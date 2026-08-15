/**
 * Экспорт узора в SVG и PNG — обязательный пункт условий (`FACTS.md #F-11`).
 *
 * Тонкость, из-за которой наивный экспорт отдаёт чёрный прямоугольник: цвета
 * в разметке заданы CSS-переменными, а они живут в документе. Вне страницы
 * `var(--ink)` не разрешается ни во что. Поэтому перед сериализацией
 * вычисленные значения переносятся в атрибуты копии — файл становится
 * самодостаточным и открывается чем угодно.
 */

const COPIED = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-variant-numeric",
  "text-anchor",
  "dominant-baseline",
] as const;

function inlineComputedStyles(
  source: SVGSVGElement,
  clone: SVGSVGElement,
): void {
  const from = source.querySelectorAll("*");
  const to = clone.querySelectorAll("*");

  for (const [i, node] of from.entries()) {
    const target = to[i];
    if (!(target instanceof SVGElement)) continue;
    const computed = getComputedStyle(node);
    for (const prop of COPIED) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== "none" && value !== "normal") {
        target.setAttribute(prop, value.trim());
      }
    }
    target.removeAttribute("class");
  }
}

function serialize(svg: SVGSVGElement, background: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");

  // Подложка: без неё PNG выходит с прозрачным фоном, и узор из светлых пород
  // (клён, ясень) исчезает в любом просмотрщике с белой темой.
  const vb = (clone.getAttribute("viewBox") ?? "0 0 100 100")
    .split(/\s+/)
    .map(Number);
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(vb[0] ?? 0));
  rect.setAttribute("y", String(vb[1] ?? 0));
  rect.setAttribute("width", String(vb[2] ?? 100));
  rect.setAttribute("height", String(vb[3] ?? 100));
  rect.setAttribute("fill", background);
  clone.insertBefore(rect, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSvg(
  svg: SVGSVGElement,
  filename: string,
  background: string,
): void {
  const text = serialize(svg, background);
  download(
    new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
    `${filename}.svg`,
  );
}

/**
 * PNG растрируется через canvas. Масштаб 3× — чтобы картинку можно было
 * приложить к заявке и распечатать, а не только посмотреть на экране.
 */
export async function exportPng(
  svg: SVGSVGElement,
  filename: string,
  background: string,
  scale = 3,
): Promise<void> {
  const text = serialize(svg, background);
  const box = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));

  const url = URL.createObjectURL(
    new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Не удалось растрировать узор"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas недоступен");
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) download(blob, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportJson(text: string, filename: string): void {
  download(
    new Blob([text], { type: "application/json;charset=utf-8" }),
    `${filename}.json`,
  );
}
