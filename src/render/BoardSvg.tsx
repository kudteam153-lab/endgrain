import { forwardRef, useMemo } from "react";
import { speciesById } from "../core/species.ts";
import type { Face } from "../core/types.ts";
import "./BoardSvg.css";

/**
 * Доска как лист сборочного чертежа (DECISIONS.md #D-11, #D-12).
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
 * 3. Доска собирается на глазах — ряд за рядом, как плашки на верстаке. Это
 *    не анимация ради анимации: проигрывается ровно та последовательность,
 *    которую исполняет модель (#D-01).
 *
 * Толщина линий и кегль выводятся из размера доски (`u`), а не задаются в
 * пикселях: иначе на доске 200 мм выноски закрывают узор, а на 800 мм
 * превращаются в волосок.
 */

interface Props {
  face: Face;
  thicknessMm: number;
  lamellaWidths: number[];
  patternName: string;
  kerfMm: number;
  seed: number;
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
 * на глаз. Предыдущая версия резала по константе, и «Дуб · Клён · Орех ·
 * Падук» спокойно вылезал за линию в соседнюю графу: клетка узкая, а 26
 * символов в лимит укладывались.
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
  { face, thicknessMm, lamellaWidths, patternName, kerfMm, seed, assemblyKey },
  ref,
) {
  const u = Math.max(face.wMm, face.hMm) / 100;

  const padTop = 14 * u;
  const padRight = 16 * u;
  const padLeft = 4 * u;

  // Штамп: сетка задана явно — три строки одной высоты. Первая версия считала
  // позиции долями строки, и графы налезли друг на друга.
  const stampTop = face.hMm + 13 * u;
  const stampRow = 7 * u;
  const stampH = stampRow * 3;
  const stampSplit = face.wMm * 0.68;
  const colA = face.wMm * 0.24;
  const colB = face.wMm * 0.46;
  const pad = 2 * u;
  const padBottom = 13 * u + stampH + 3 * u;

  const vb = {
    x: -padLeft,
    y: -padTop,
    w: face.wMm + padLeft + padRight,
    h: face.hMm + padTop + padBottom,
  };

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

  return (
    <svg
      ref={ref}
      className="board-svg"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="img"
      aria-label={`Чертёж доски ${fmt(face.wMm)} на ${fmt(face.hMm)} миллиметров, узор «${patternName}»`}
    >
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
        <line x1={0} y1={-1.5 * u} x2={0} y2={-9 * u} />
        <line x1={face.wMm} y1={-1.5 * u} x2={face.wMm} y2={-9 * u} />
        <line
          x1={0}
          y1={-7 * u}
          x2={face.wMm}
          y2={-7 * u}
          markerStart="url(#eg-arrow)"
          markerEnd="url(#eg-arrow)"
        />
        <text
          className="board-svg__dim-text"
          x={face.wMm / 2}
          y={-8.6 * u}
          fontSize={3.6 * u}
        >
          {fmt(face.wMm)}
        </text>

        <line x1={face.wMm + 1.5 * u} y1={0} x2={face.wMm + 9 * u} y2={0} />
        <line
          x1={face.wMm + 1.5 * u}
          y1={face.hMm}
          x2={face.wMm + 9 * u}
          y2={face.hMm}
        />
        <line
          x1={face.wMm + 7 * u}
          y1={0}
          x2={face.wMm + 7 * u}
          y2={face.hMm}
          markerStart="url(#eg-arrow)"
          markerEnd="url(#eg-arrow)"
        />
        <text
          className="board-svg__dim-text"
          x={face.wMm + 8.6 * u}
          y={face.hMm / 2}
          fontSize={3.6 * u}
          transform={`rotate(-90 ${face.wMm + 8.6 * u} ${face.hMm / 2})`}
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
                cy={face.hMm + 6.8 * u}
                r={2.6 * u}
                strokeWidth={0.28 * u}
              />
              <text
                className="board-svg__tick-text"
                x={t.x}
                y={face.hMm + 6.8 * u}
                fontSize={2.8 * u}
              >
                {t.index}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* --- Штамп (основная надпись) ---------------------------------------
          Три строки. Первая — что изготавливаем, вторая — из чего, третья —
          чем и в каком размере. Графы данных отделены вертикалью справа.
          Породы занимают строку целиком: в узкой клетке они не помещались и
          перечёркивали соседнюю линию. */}
      <g className="board-svg__stamp" strokeWidth={0.28 * u}>
        <rect
          className="board-svg__stamp-frame"
          x={0}
          y={stampTop}
          width={face.wMm}
          height={stampH}
          strokeWidth={0.5 * u}
        />
        <line
          x1={stampSplit}
          y1={stampTop}
          x2={stampSplit}
          y2={stampTop + stampH}
        />
        <line
          x1={0}
          y1={stampTop + stampRow}
          x2={face.wMm}
          y2={stampTop + stampRow}
        />
        <line
          x1={0}
          y1={stampTop + stampRow * 2}
          x2={face.wMm}
          y2={stampTop + stampRow * 2}
        />
        <line
          x1={colA}
          y1={stampTop + stampRow * 2}
          x2={colA}
          y2={stampTop + stampH}
        />
        <line
          x1={colB}
          y1={stampTop + stampRow * 2}
          x2={colB}
          y2={stampTop + stampH}
        />

        <StampField
          x={pad}
          top={stampTop}
          label="изделие"
          value={clipToWidth(
            "Торцевая разделочная доска",
            stampSplit - pad * 2,
            3.2 * u,
          )}
          u={u}
          large
        />
        <StampField
          x={pad}
          top={stampTop + stampRow}
          label="породы"
          value={clipToWidth(
            speciesList.join(" · "),
            stampSplit - pad * 2,
            2.6 * u,
          )}
          u={u}
        />
        <StampField
          x={pad}
          top={stampTop + stampRow * 2}
          label="узор"
          value={clipToWidth(patternName, colA - pad * 2, 2.6 * u)}
          u={u}
        />
        <StampField
          x={colA + pad}
          top={stampTop + stampRow * 2}
          label="габарит"
          value={`${fmt(face.wMm)}×${fmt(face.hMm)}×${fmt(thicknessMm)}`}
          u={u}
        />
        <StampField
          x={colB + pad}
          top={stampTop + stampRow * 2}
          label="пропил"
          value={`${fmt(kerfMm)} мм`}
          u={u}
        />

        <StampField
          x={stampSplit + pad}
          top={stampTop}
          label="масштаб"
          value={drawingScale(face.wMm)}
          u={u}
        />
        <StampField
          x={stampSplit + pad}
          top={stampTop + stampRow}
          label="плашек"
          value={String(rows.length)}
          u={u}
        />
        <StampField
          x={stampSplit + pad}
          top={stampTop + stampRow * 2}
          label="seed"
          value={String(seed)}
          u={u}
        />
      </g>

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
        y={top + 2.4 * u}
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
        y={top + 5.8 * u}
        fontSize={large ? 3.2 * u : 2.6 * u}
      >
        {value}
      </text>
    </g>
  );
}
