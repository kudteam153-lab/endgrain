import { forwardRef, useMemo } from "react";
import { speciesById } from "../core/species.ts";
import type { Face } from "../core/types.ts";
import "./BoardSvg.css";

/**
 * Доска как деталь на сборочном чертеже (DECISIONS.md #D-11).
 *
 * Размерные линии — не украшение: они показывают настоящие размеры и меняются
 * вместе с ними. Декоративная стрелка, которая ничего не измеряет, — первое,
 * за что этот концепт заворачивают, и в решении это записано отдельно.
 *
 * Толщина линий и кегль подписей выводятся из размера доски (`u`), а не
 * задаются в пикселях: иначе на доске 200 мм выноски закрывают узор, а на
 * доске 800 мм превращаются в волосок.
 */

interface Props {
  face: Face;
  /** Толщина доски — третий размер, на плоском чертеже его пишут подписью. */
  thicknessMm: number;
  /** Ширины ламелей первой склейки — по ним нумеруются колонки. */
  lamellaWidths: number[];
}

const fmt = (mm: number): string =>
  Number.isInteger(mm) ? String(mm) : mm.toFixed(1).replace(/\.0$/, "");

export const BoardSvg = forwardRef<SVGSVGElement, Props>(function BoardSvg(
  { face, thicknessMm, lamellaWidths },
  ref,
) {
  const u = Math.max(face.wMm, face.hMm) / 100;

  // Поля под выноски. Сверху ширина, справа длина, снизу нумерация ламелей.
  const padTop = 13 * u;
  const padRight = 15 * u;
  const padBottom = 16 * u;
  const padLeft = 3 * u;

  const vb = {
    x: -padLeft,
    y: -padTop,
    w: face.wMm + padLeft + padRight,
    h: face.hMm + padTop + padBottom,
  };

  const lamellaTicks = useMemo(() => {
    const ticks: Array<{ x: number; index: number; widthMm: number }> = [];
    let x = 0;
    for (const [i, w] of lamellaWidths.entries()) {
      ticks.push({ x: x + w / 2, index: i + 1, widthMm: w });
      x += w;
    }
    return ticks;
  }, [lamellaWidths]);

  // Нумеровать каждую ламель имеет смысл, пока цифры не слиплись.
  const showTicks =
    lamellaWidths.length > 0 && face.wMm / lamellaWidths.length > 7 * u;

  return (
    <svg
      ref={ref}
      className="board-svg"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="img"
      aria-label={`Узор доски ${fmt(face.wMm)} на ${fmt(face.hMm)} миллиметров`}
    >
      <g className="board-svg__cells">
        {face.cells.map((c, i) => (
          <rect
            key={i}
            x={c.xMm}
            y={c.yMm}
            width={c.wMm}
            height={c.hMm}
            fill={speciesById(c.speciesId).color}
          />
        ))}
      </g>

      {/* Швы склейки — тонкая тёмная линия по границам ячеек. Без них узор
          читается как заливка, а не как набор склеенных плашек. */}
      <g className="board-svg__seams" strokeWidth={0.35 * u}>
        {face.cells.map((c, i) => (
          <rect key={i} x={c.xMm} y={c.yMm} width={c.wMm} height={c.hMm} />
        ))}
      </g>

      <rect
        className="board-svg__outline"
        x={0}
        y={0}
        width={face.wMm}
        height={face.hMm}
        strokeWidth={0.45 * u}
      />

      <g className="board-svg__dims" strokeWidth={0.35 * u}>
        {/* Ширина: выносные линии от углов, размерная со стрелками, подпись. */}
        <line x1={0} y1={-1.5 * u} x2={0} y2={-8 * u} />
        <line x1={face.wMm} y1={-1.5 * u} x2={face.wMm} y2={-8 * u} />
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
          fontSize={4 * u}
        >
          {fmt(face.wMm)}
        </text>

        {/* Длина. */}
        <line x1={face.wMm + 1.5 * u} y1={0} x2={face.wMm + 8 * u} y2={0} />
        <line
          x1={face.wMm + 1.5 * u}
          y1={face.hMm}
          x2={face.wMm + 8 * u}
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
          className="board-svg__dim-text board-svg__dim-text--rot"
          x={face.wMm + 8 * u}
          y={face.hMm / 2}
          fontSize={4 * u}
          transform={`rotate(-90 ${face.wMm + 8 * u} ${face.hMm / 2})`}
        >
          {fmt(face.hMm)}
        </text>

        {/* Толщина — третий размер, на плоском чертеже он подписью. Своей
            строкой под нумерацией ламелей: в правом поле она наезжала на
            крайние номера, и на снимке это было первым, что бросалось. */}
        <text
          className="board-svg__note"
          x={0}
          y={face.hMm + 14 * u}
          fontSize={2.8 * u}
          textAnchor="start"
        >
          толщина {fmt(thicknessMm)} мм · ламелей {lamellaWidths.length}
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
                strokeWidth={0.35 * u}
              />
              <circle
                cx={t.x}
                cy={face.hMm + 6.6 * u}
                r={2.6 * u}
                strokeWidth={0.35 * u}
              />
              <text
                className="board-svg__tick-text"
                x={t.x}
                y={face.hMm + 6.6 * u}
                fontSize={3 * u}
              >
                {t.index}
              </text>
            </g>
          ))}
        </g>
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
