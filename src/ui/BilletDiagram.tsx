import { speciesById } from "../core/species.ts";
import type { Lamella } from "../core/recipe.ts";
import "./BilletDiagram.css";

/**
 * Брусок → рез → срез (`#D-22`).
 *
 * Схема отвечает на вопрос, который у торцевой доски задают первым: откуда
 * берётся узор. Рейки складывают в брусок, брусок режут поперёк, и на торце
 * проявляется рисунок — то же, что делают в хаконэ-ёсэги со времён Эдо.
 *
 * Стоит в панели, а не на листе. На листе это была бы иллюстрация к чертежу,
 * которую мастер уносит в мастерскую и там не использует; здесь — подпись к
 * тому самому списку реек, который он прямо сейчас правит. И меняется вместе
 * с ним: породы и ширины берутся из рецепта, а не нарисованы один раз.
 */

interface Props {
  lamellas: Lamella[];
  kerfMm: number;
}

/** Глубина бруска и скос — только пропорции картинки, не миллиметры доски. */
const W = 100;
const FRONT_H = 17;
const DEPTH_X = 22;
const DEPTH_Y = 13;
const CUT_AT = 0.74;

export function BilletDiagram({ lamellas, kerfMm }: Props) {
  if (lamellas.length === 0) return null;

  const total = lamellas.reduce((sum, l) => sum + Math.max(1, l.widthMm), 0);
  const top = DEPTH_Y;
  const bottom = top + FRONT_H;

  let x = 0;
  const strips = lamellas.map((l, i) => {
    const w = (Math.max(1, l.widthMm) / total) * (W - DEPTH_X);
    const strip = {
      key: i,
      x,
      w,
      color: speciesById(l.speciesId).color,
    };
    x += w;
    return strip;
  });

  const cutX = (W - DEPTH_X) * CUT_AT;

  return (
    <figure className="billet">
      <svg
        className="billet__svg"
        viewBox={`0 0 ${W} ${bottom + 2}`}
        role="img"
        aria-label="Рейки склеены в брусок, брусок режется поперёк, узор проявляется на торце"
      >
        {/* Верхняя грань уходит вглубь: без неё это полосатый прямоугольник,
            а не брусок, и «поперёк» нечему быть поперёк. */}
        {strips.map((s) => (
          <polygon
            key={`t${s.key}`}
            className="billet__top"
            points={`${s.x},${top} ${s.x + s.w},${top} ${s.x + s.w + DEPTH_X},${top - DEPTH_Y} ${s.x + DEPTH_X},${top - DEPTH_Y}`}
            fill={s.color}
          />
        ))}

        {strips.map((s) => (
          <rect
            key={`f${s.key}`}
            className="billet__front"
            x={s.x}
            y={top}
            width={s.w}
            height={FRONT_H}
            fill={s.color}
          />
        ))}

        {/* Линия реза — единственное красное на схеме: ею и отделяется ломоть. */}
        <line
          className="billet__cut"
          x1={cutX + DEPTH_X / 2}
          y1={top - DEPTH_Y - 1}
          x2={cutX}
          y2={bottom + 1}
        />
      </svg>

      <figcaption className="billet__caption">
        Рейки склеены в брусок. Поперечный рез шириной{" "}
        <span className="num">{kerfMm}</span> мм отделяет ломоть — на его торце
        и виден узор.
      </figcaption>
    </figure>
  );
}
