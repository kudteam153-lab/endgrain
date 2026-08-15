import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/**
 * PDF-инструкция — то, ради чего затевался производственный слой
 * (`GOAL.md` acceptance №3–4). Не режется ни при каких условиях
 * (`CORE_PRINCIPLES.md §4.3`).
 *
 * Страницы растрируются, а не собираются текстом. Причина одна и она
 * практическая: кириллица. Векторный текст в PDF требует встроенного TTF, в
 * проекте лежат только woff2, а шрифт, который не встал, — это PDF с пустыми
 * прямоугольниками вместо инструкции, и заметит это жюри, а не мы.
 *
 * Растр берётся в три раза крупнее экранного — это больше 300 dpi на A4, то
 * есть печатное качество для чертежа и таблиц.
 */

/** A4 в миллиметрах и поля, те же, что у печати браузером (#D-14). */
const PAGE = { wMm: 210, hMm: 297, marginMm: 12 } as const;

const SCALE = 3;

/** Длинная сторона растра в точках. */
const LONG_SIDE_PX = 2200;

/** Белый: PDF печатают на бумаге, и тёмная тема на ней превращается в тонер. */
const PAPER = "#ffffff";

interface Page {
  canvas: HTMLCanvasElement;
}

/**
 * Растеризация SVG — тем же способом, что экспорт PNG: стили инлайнятся в
 * копию, иначе `var(--ink)` вне документа не разрешается ни во что.
 */
async function rasterizeSvg(
  svg: SVGSVGElement,
  serialize: (svg: SVGSVGElement, background: string) => string,
): Promise<HTMLCanvasElement> {
  const text = serialize(svg, PAPER);

  // Размеры берутся из `viewBox`, а не из бокса на экране. По боксу чертёж
  // растягивался под пропорции элемента: доска 240×360 приезжала в PDF
  // горизонтальной, то есть размеры на листе врали.
  const vb = (svg.getAttribute("viewBox") ?? "0 0 100 100")
    .split(/\s+/)
    .map(Number);
  const vbW = vb[2] && vb[2] > 0 ? vb[2] : 100;
  const vbH = vb[3] && vb[3] > 0 ? vb[3] : 100;

  const url = URL.createObjectURL(
    new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось растрировать чертёж"));
      image.src = url;
    });

    // Длинная сторона — 2200 точек: на A4 это больше 250 dpi, печатное
    // качество для чертежа, при котором файл остаётся в пару мегабайт.
    const zoom = LONG_SIDE_PX / Math.max(vbW, vbH);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vbW * zoom));
    canvas.height = Math.max(1, Math.round(vbH * zoom));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas недоступен");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Растеризация листа раскроя. Он свёрстан таблицами, а не рисунком, поэтому
 * идёт через html2canvas — единственное место, где без этого не обойтись.
 *
 * Фон принудительно белый: мастер, работающий в тёмной теме, иначе получит
 * PDF, который нельзя напечатать.
 */
async function rasterizeNode(node: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    scale: SCALE,
    backgroundColor: PAPER,
    logging: false,
    useCORS: true,
  });
}

/** Вписать страницу в лист A4 с полями, сохранив пропорции. */
function place(doc: jsPDF, canvas: HTMLCanvasElement, isFirst: boolean): void {
  if (!isFirst) doc.addPage();

  const boxW = PAGE.wMm - PAGE.marginMm * 2;
  const boxH = PAGE.hMm - PAGE.marginMm * 2;
  const ratio = canvas.width / canvas.height;

  // Лист вписывается целиком: обрезать чертёж по краю страницы значит
  // отрезать размерную линию, а по ней и режут.
  const width = ratio > boxW / boxH ? boxW : boxH * ratio;
  const height = ratio > boxW / boxH ? boxW / ratio : boxH;

  doc.addImage(
    canvas.toDataURL("image/jpeg", 0.92),
    "JPEG",
    PAGE.marginMm + (boxW - width) / 2,
    PAGE.marginMm,
    width,
    height,
  );
}

export interface PdfSources {
  /** Лист 01 — чертёж. */
  drawing: SVGSVGElement | null;
  /** Лист 02 — раскрой и смета. */
  cutSheet: HTMLElement | null;
  /** Схема склеек по шагам. */
  assembly: SVGSVGElement | null;
  serializeSvg: (svg: SVGSVGElement, background: string) => string;
}

/**
 * Собрать и скачать PDF. Порядок страниц — порядок работы мастера: сначала
 * что делаем, потом из чего, потом как собираем.
 */
export async function exportPdf(
  sources: PdfSources,
  filename: string,
): Promise<void> {
  const pages: Page[] = [];

  if (sources.drawing) {
    pages.push({
      canvas: await rasterizeSvg(sources.drawing, sources.serializeSvg),
    });
  }
  if (sources.cutSheet) {
    pages.push({ canvas: await rasterizeNode(sources.cutSheet) });
  }
  if (sources.assembly) {
    pages.push({
      canvas: await rasterizeSvg(sources.assembly, sources.serializeSvg),
    });
  }

  if (pages.length === 0) throw new Error("Нечего печатать");

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  for (const [i, page] of pages.entries()) place(doc, page.canvas, i === 0);

  doc.save(`${filename}.pdf`);
}
