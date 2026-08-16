import { forwardRef, useMemo } from "react";
import { speciesById } from "../core/species.ts";
import type { Face } from "../core/types.ts";
import "./BoardSvg.css";

/**
 * Доска как лист сборочного чертежа (DECISIONS.md #D-11, #D-12, #D-13).
 *
 * Три вещи, которые делают это чертежом, а не картинкой с рамкой:
 *
 * 1. Размерные линии показывают настоящие размеры и меняются вместе с ними.
 *    Декоративная стрелка, которая ничего не измеряет, — первое, за что этот
 *    концепт заворачивают.
 * 2. Штамп — основная надпись. Несёт то же, что несёт настоящий штамп: что
 *    изготавливаем, из чего, в каком масштабе, каким резом. И уезжает в
 *    экспорт вместе с узором, то есть выгруженная картинка остаётся
 *    документом, а не просто картинкой.
 * 3. Доска собирается на глазах — ряд за рядом, как плашки на верстаке.
 *    Проигрывается ровно та последовательность, которую исполняет модель.
 *
 * Штамп встаёт снизу или сбоку — смотря какой формы бокс листа (#D-13).
 * Выбор не косметический: на альбомном экране вертикальная доска со штампом
 * снизу занимала половину высоты, а половина бумаги пустовала по бокам.
 * Штамп сбоку добирает эту ширину, и чертёж вырастает почти вдвое.
 */

interface Props {
  face: Face;
  thicknessMm: number;
  /**
   * Рейки первой склейки. Из них рисуется брусок над срезом: лист должен
   * отвечать на вопрос «откуда узор», а не только «какой он». Ширины
   * настоящие, поэтому брусок бывает шире доски — после переклейки так и есть.
   */
  billetStrips: Array<{ widthMm: number; color: string }>;
  lamellaWidths: number[];
  patternName: string;
  kerfMm: number;
  seed: number;
  /** Ширина бокса, делённая на высоту. Определяет, куда встанет штамп. */
  boxAspect: number;
  /** Меняется — сборка проигрывается заново. */
  assemblyKey: number;
}

const fmt = (mm: number): string =>
  Number.isInteger(mm) ? String(mm) : mm.toFixed(1).replace(/\.0$/, "");

/** Масштаб чертежа в привычной записи: 1:1, 1:2, 1:5. */
function drawingScale(widthMm: number): string {
  const steps = [1, 2, 5, 10, 20];
  const target = widthMm / 180;
  return `1:${steps.find((s) => s >= target) ?? steps[steps.length - 1]}`;
}

/**
 * Обрезка значения графы по ФАКТИЧЕСКОЙ ширине клетки, а не по числу символов
 * на глаз. Версия с константой пропускала «Дуб · Клён · Орех · Падук» — 26
 * символов в лимит укладывались, а в узкую клетку нет, и текст перечёркивал
 * соседнюю линию.
 *
 * 0.56 — средняя ширина знака IBM Plex Sans в долях кегля. Оценка грубая и
 * намеренно консервативная: лучше обрезать на знак раньше, чем перечеркнуть
 * линию штампа.
 */
function clipToWidth(
  value: string,
  availableMm: number,
  fontSizeMm: number,
): string {
  const max = Math.max(3, Math.floor(availableMm / (fontSizeMm * 0.56)));
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export const BoardSvg = forwardRef<SVGSVGElement, Props>(function BoardSvg(
  {
    face,
    thicknessMm,
    billetStrips,
    lamellaWidths,
    patternName,
    kerfMm,
    seed,
    boxAspect,
    assemblyKey,
  },
  ref,
) {
  const u = Math.max(face.wMm, face.hMm) / 100;

  const padTop = 13 * u;
  const padLeft = 4 * u;
  const tickZone = 10 * u;

  /** Брусок над чертежом: одинаково для альбомного листа и для портретного. */
  const billetW = billetStrips.reduce(
    (sum, s) => sum + Math.max(1, s.widthMm),
    0,
  );
  const billetFront = 12 * u;
  const billetDx = 16 * u;
  const billetDy = 9 * u;
  /**
   * Зона над чертежом: торец бруска, уход верхней грани вглубь, зазор до
   * размерной линии и строка подписи с запасом на выносные элементы шрифта.
   * Считалась впритык — подпись срезало верхним краем листа.
   */
  const headZone =
    billetStrips.length > 0 ? billetFront + billetDy + 14 * u : 0;
  // Печать сняли с листа: на документе она спорила со штампом, а подписью
  // служит именно штамп. Знак остался в шапке и на вкладке (#D-22).
  const footZone = 0;

  /** Ячейки по рядам — ряд это одна плашка, и укладывается он целиком. */
  const rows = useMemo(() => {
    const byY = new Map<number, typeof face.cells>();
    for (const c of face.cells) {
      const key = Math.round(c.yMm * 1e3);
      const bucket = byY.get(key);
      if (bucket) bucket.push(c);
      else byY.set(key, [c]);
    }
    return [...byY.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, cells]) => cells);
  }, [face.cells]);

  const lamellaTicks = useMemo(() => {
    const ticks: Array<{ x: number; index: number }> = [];
    let x = 0;
    for (const [i, w] of lamellaWidths.entries()) {
      ticks.push({ x: x + w / 2, index: i + 1 });
      x += w;
    }
    return ticks;
  }, [lamellaWidths]);

  const showTicks =
    lamellaWidths.length > 0 && face.wMm / lamellaWidths.length > 7 * u;

  const speciesList = useMemo(
    () =>
      [...new Set(face.cells.map((c) => c.speciesId))].map(
        (id) => speciesById(id).name,
      ),
    [face.cells],
  );

  const fields: Array<[string, string]> = [
    ["изделие", "Торцевая разделочная доска"],
    ["породы", speciesList.join(" · ")],
    ["узор", patternName],
    ["габарит", `${fmt(face.wMm)}×${fmt(face.hMm)}×${fmt(thicknessMm)}`],
    ["пропил", `${fmt(kerfMm)} мм`],
    ["масштаб", drawingScale(face.wMm)],
    ["плашек", String(rows.length)],
    ["seed", String(seed)],
  ];

  // Две раскладки листа. Берём ту, чьи пропорции ближе к пропорциям бокса, —
  // тогда чертёж занимает бокс целиком, а не летает в пустой бумаге.
  // Ширина листа считается по самому широкому из двух: доска и брусок. После
  // переклейки брусок шире доски, и без этого он вылезал бы за край бумаги.
  const bodyW = Math.max(face.wMm, billetW + billetDx);

  const tall = {
    stampRowH: 7 * u,
    get stampH() {
      return this.stampRowH * 3;
    },
    get vbW() {
      return padLeft + bodyW + 16 * u;
    },
    get vbH() {
      return (
        headZone + padTop + face.hMm + tickZone + 3 * u + this.stampH + footZone
      );
    },
  };
  const wide = {
    gapX: 15 * u,
    stampW: 70 * u,
    stampRowH: 6.5 * u,
    get stampH() {
      return this.stampRowH * fields.length;
    },
    get vbW() {
      return padLeft + bodyW + this.gapX + this.stampW + 4 * u;
    },
    get vbH() {
      return headZone + padTop + face.hMm + tickZone + footZone;
    },
  };

  const fit = (w: number, h: number) => Math.abs(Math.log(w / h / boxAspect));
  const isWide = fit(wide.vbW, wide.vbH) < fit(tall.vbW, tall.vbH);

  const vb = isWide
    ? { w: wide.vbW, h: wide.vbH }
    : { w: tall.vbW, h: tall.vbH };

  return (
    <svg
      ref={ref}
      className="board-svg"
      viewBox={`${-padLeft} ${-(padTop + headZone)} ${vb.w} ${vb.h}`}
      role="img"
      aria-label={`Чертёж доски ${fmt(face.wMm)} на ${fmt(face.hMm)} миллиметров, узор «${patternName}»`}
    >
      {billetStrips.length > 0 && (
        <Billet
          strips={billetStrips}
          bottom={-(padTop + 5 * u)}
          front={billetFront}
          dx={billetDx}
          dy={billetDy}
          u={u}
        />
      )}

      <g key={assemblyKey} className="board-svg__rows">
        {rows.map((cells, r) => (
          <g className="board-svg__row" key={r}>
            {cells.map((c, i) => (
              <rect
                key={i}
                x={c.xMm}
                y={c.yMm}
                width={c.wMm}
                height={c.hMm}
                fill={speciesById(c.speciesId).color}
              />
            ))}
            {/* Швы склейки — без них узор читается заливкой, а не набором
                склеенных плашек. */}
            <g className="board-svg__seams" strokeWidth={0.3 * u}>
              {cells.map((c, i) => (
                <rect
                  key={i}
                  x={c.xMm}
                  y={c.yMm}
                  width={c.wMm}
                  height={c.hMm}
                />
              ))}
            </g>
          </g>
        ))}
      </g>

      <rect
        className="board-svg__outline"
        x={0}
        y={0}
        width={face.wMm}
        height={face.hMm}
        strokeWidth={0.5 * u}
      />

      <g className="board-svg__dims" strokeWidth={0.28 * u}>
        <line x1={0} y1={-1.5 * u} x2={0} y2={-8.5 * u} />
        <line x1={face.wMm} y1={-1.5 * u} x2={face.wMm} y2={-8.5 * u} />
        <line
          x1={0}
          y1={-6.5 * u}
          x2={face.wMm}
          y2={-6.5 * u}
          markerStart="url(#eg-arrow)"
          markerEnd="url(#eg-arrow)"
        />
        <text
          className="board-svg__dim-text"
          x={face.wMm / 2}
          y={-8 * u}
          fontSize={3.4 * u}
        >
          {fmt(face.wMm)}
        </text>

        <line x1={face.wMm + 1.5 * u} y1={0} x2={face.wMm + 8.5 * u} y2={0} />
        <line
          x1={face.wMm + 1.5 * u}
          y1={face.hMm}
          x2={face.wMm + 8.5 * u}
          y2={face.hMm}
        />
        <line
          x1={face.wMm + 6.5 * u}
          y1={0}
          x2={face.wMm + 6.5 * u}
          y2={face.hMm}
          markerStart="url(#eg-arrow)"
          markerEnd="url(#eg-arrow)"
        />
        <text
          className="board-svg__dim-text"
          x={face.wMm + 8 * u}
          y={face.hMm / 2}
          fontSize={3.4 * u}
          transform={`rotate(-90 ${face.wMm + 8 * u} ${face.hMm / 2})`}
        >
          {fmt(face.hMm)}
        </text>
      </g>

      {showTicks && (
        <g className="board-svg__lamellas">
          {lamellaTicks.map((t) => (
            <g key={t.index}>
              <line
                x1={t.x}
                y1={face.hMm + 1.5 * u}
                x2={t.x}
                y2={face.hMm + 4 * u}
                strokeWidth={0.28 * u}
              />
              <circle
                cx={t.x}
                cy={face.hMm + 6.6 * u}
                r={2.5 * u}
                strokeWidth={0.28 * u}
              />
              <text
                className="board-svg__tick-text"
                x={t.x}
                y={face.hMm + 6.6 * u}
                fontSize={2.7 * u}
              >
                {t.index}
              </text>
            </g>
          ))}
        </g>
      )}

      {isWide ? (
        <StampColumn
            x={face.wMm + wide.gapX}
            y={Math.max(0, face.hMm - wide.stampH)}
            width={wide.stampW}
            rowH={wide.stampRowH}
          fields={fields}
          u={u}
        />
      ) : (
        <StampBar
            width={face.wMm}
            y={face.hMm + tickZone + 3 * u}
          rowH={tall.stampRowH}
          fields={fields}
          u={u}
        />
      )}

      <defs>
        <marker
          id="eg-arrow"
          markerWidth={6}
          markerHeight={6}
          refX={3}
          refY={3}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path className="board-svg__arrow" d="M 0.6 1.4 L 5 3 L 0.6 4.6 z" />
        </marker>
      </defs>
    </svg>
  );
});

interface BilletProps {
  strips: Array<{ widthMm: number; color: string }>;
  /** Низ торца бруска в координатах листа. Брусок растёт вверх от него. */
  bottom: number;
  front: number;
  dx: number;
  dy: number;
  u: number;
}

/**
 * Брусок над срезом (`#D-22`).
 *
 * Лист отвечает на вопрос «откуда узор», а не только «какой он»: сверху рейки,
 * склеенные в брусок, с намеченным поперечным резом, снизу — торец, который из
 * этого выйдет. Так делают доски, и так делали хаконэ-ёсэги.
 *
 * Ширины настоящие, не подогнанные под ширину доски: после переклейки брусок
 * шире доски, и рисовать его в размер чертежа значило бы соврать в главном.
 */
function Billet({ strips, bottom, front, dx, dy, u }: BilletProps) {
  const top = bottom - front;
  let x = 0;
  const bars = strips.map((s, i) => {
    const w = Math.max(1, s.widthMm);
    const bar = { key: i, x, w, color: s.color };
    x += w;
    return bar;
  });
  const total = x;
  // Рез на трёх четвертях длины: видно и брусок, и то, что от него отделяют.
  const cut = total * 0.76;

  return (
    <g className="board-svg__billet">
      <text
        className="board-svg__billet-cap"
        x={0}
        y={top - dy - 2.5 * u}
        fontSize={2.9 * u}
      >
        БРУСОК · РЕЙКИ СКЛЕЕНЫ, РЕЖЕМ ПОПЕРЁК
      </text>

      {/* Верхняя грань уходит вглубь: без неё это полосатый прямоугольник, и
          «поперёк» нечему быть поперёк. */}
      {bars.map((b) => (
        <polygon
          key={`t${b.key}`}
          className="board-svg__billet-top"
          points={`${b.x},${top} ${b.x + b.w},${top} ${b.x + b.w + dx},${top - dy} ${b.x + dx},${top - dy}`}
          fill={b.color}
        />
      ))}

      {bars.map((b) => (
        <rect
          key={`f${b.key}`}
          className="board-svg__billet-front"
          x={b.x}
          y={top}
          width={b.w}
          height={front}
          fill={b.color}
        />
      ))}

      <line
        className="board-svg__billet-cut"
        x1={cut + dx}
        y1={top - dy - 1.5 * u}
        x2={cut}
        y2={bottom + 1.5 * u}
        strokeWidth={0.55 * u}
        strokeDasharray={`${2 * u} ${1.4 * u}`}
      />
    </g>
  );
}

type Field = [string, string];

interface StampColumnProps {
  x: number;
  y: number;
  width: number;
  rowH: number;
  fields: Field[];
  u: number;
}

/** Штамп колонкой — для альбомного листа. Графы идут сверху вниз. */
function StampColumn({ x, y, width, rowH, fields, u }: StampColumnProps) {
  const pad = 2 * u;
  return (
    <g className="board-svg__stamp" strokeWidth={0.28 * u}>
      <rect
        className="board-svg__stamp-frame"
        x={x}
        y={y}
        width={width}
        height={rowH * fields.length}
        strokeWidth={0.5 * u}
      />
      {fields.map(([label, value], i) => (
        <g key={label}>
          {i > 0 && (
            <line x1={x} y1={y + rowH * i} x2={x + width} y2={y + rowH * i} />
          )}
          <StampField
            x={x + pad}
            top={y + rowH * i}
            label={label}
            value={clipToWidth(value, width - pad * 2, (i === 0 ? 3 : 2.6) * u)}
            u={u}
            large={i === 0}
          />
        </g>
      ))}
    </g>
  );
}

interface StampBarProps {
  width: number;
  y: number;
  rowH: number;
  fields: Field[];
  u: number;
}

/**
 * Штамп лентой под доской — для портретного листа. Три строки: что
 * изготавливаем, из чего, чем и в каком размере.
 */
function StampBar({ width, y, rowH, fields, u }: StampBarProps) {
  const pad = 2 * u;
  // Разметка нижней строки пересчитана под самое длинное значение: габарит
  // «280×392×40» — десять знаков. На прежних долях он налезал на соседнюю
  // графу, и в печати читалось «280×392×403.2 мм» — размер, которого нет.
  const split = width * 0.7;
  const colA = width * 0.22;
  const colB = width * 0.5;
  const [name, species, pattern, size, kerf, scale, slices, seed] = fields;

  return (
    <g className="board-svg__stamp" strokeWidth={0.28 * u}>
      <rect
        className="board-svg__stamp-frame"
        x={0}
        y={y}
        width={width}
        height={rowH * 3}
        strokeWidth={0.5 * u}
      />
      <line x1={split} y1={y} x2={split} y2={y + rowH * 3} />
      <line x1={0} y1={y + rowH} x2={width} y2={y + rowH} />
      <line x1={0} y1={y + rowH * 2} x2={width} y2={y + rowH * 2} />
      <line x1={colA} y1={y + rowH * 2} x2={colA} y2={y + rowH * 3} />
      <line x1={colB} y1={y + rowH * 2} x2={colB} y2={y + rowH * 3} />

      <StampField
        x={pad}
        top={y}
        label={name![0]}
        value={clipToWidth(name![1], split - pad * 2, 3.2 * u)}
        u={u}
        large
      />
      <StampField
        x={pad}
        top={y + rowH}
        label={species![0]}
        value={clipToWidth(species![1], split - pad * 2, 2.6 * u)}
        u={u}
      />
      <StampField
        x={pad}
        top={y + rowH * 2}
        label={pattern![0]}
        value={clipToWidth(pattern![1], colA - pad * 2, 2.6 * u)}
        u={u}
      />
      <StampField
        x={colA + pad}
        top={y + rowH * 2}
        label={size![0]}
        value={clipToWidth(size![1], colB - colA - pad * 2, 2.6 * u)}
        u={u}
      />
      <StampField
        x={colB + pad}
        top={y + rowH * 2}
        label={kerf![0]}
        value={clipToWidth(kerf![1], split - colB - pad * 2, 2.6 * u)}
        u={u}
      />
      <StampField
        x={split + pad}
        top={y}
        label={scale![0]}
        value={scale![1]}
        u={u}
      />
      <StampField
        x={split + pad}
        top={y + rowH}
        label={slices![0]}
        value={slices![1]}
        u={u}
      />
      <StampField
        x={split + pad}
        top={y + rowH * 2}
        label={seed![0]}
        value={seed![1]}
        u={u}
      />
    </g>
  );
}

interface StampFieldProps {
  x: number;
  /** Верх строки штампа, а не базовая линия: так графа не уезжает из клетки. */
  top: number;
  label: string;
  value: string;
  u: number;
  large?: boolean;
}

/** Графа штампа: разреженный капс-лейбл сверху, значение под ним. */
function StampField({
  x,
  top,
  label,
  value,
  u,
  large = false,
}: StampFieldProps) {
  return (
    <g>
      <text
        className="board-svg__stamp-label"
        x={x}
        y={top + 2.3 * u}
        fontSize={1.8 * u}
      >
        {label}
      </text>
      <text
        className={
          large
            ? "board-svg__stamp-value board-svg__stamp-value--lg"
            : "board-svg__stamp-value"
        }
        x={x}
        y={top + 5.5 * u}
        fontSize={large ? 3 * u : 2.6 * u}
      >
        {value}
      </text>
    </g>
  );
}
