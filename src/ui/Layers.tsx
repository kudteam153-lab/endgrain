import { useMemo } from "react";
import { generateRecipe } from "../core/generate.ts";
import type { Recipe } from "../core/recipe.ts";
import { speciesById } from "../core/species.ts";
import { evaluate } from "../core/warnings.ts";
import "./Layers.css";

/**
 * Слои — отложенные доски рядом с текущей (`#D-22`).
 *
 * В хаконэ-ёсэги с блока строгают тонкие слои, и все они об одном узоре. Здесь
 * колонка показывает не слои одной доски (они одинаковы по построению — в этом
 * весь торцевой набор), а те доски, которые мастер отложил. Сравнивать
 * приходится именно их, и до сих пор для этого надо было открывать галерею
 * поверх листа, то есть терять из виду то, с чем сравниваешь.
 *
 * Колонка живёт на листе, но в документ не уезжает: это орган выбора, а не
 * часть чертежа. На печати и в PDF скрыта тем же правилом, что переключатель
 * 2D/3D.
 */

interface Props {
  base: Recipe;
  seeds: number[];
  current: number;
  onPick: (recipe: Recipe) => void;
}

/** Больше трёх не показываем: колонка не должна спорить с чертежом за место. */
const SHOWN = 3;

export function Layers({ base, seeds, current, onPick }: Props) {
  const layers = useMemo(
    () =>
      seeds
        .filter((s) => s !== current)
        .slice(0, SHOWN)
        .map((seed) => {
          const recipe = generateRecipe(seed, base);
          return { seed, recipe, face: evaluate(recipe).face };
        })
        .filter((l) => l.face !== null),
    [seeds, current, base],
  );

  if (layers.length === 0) return null;

  return (
    <div className="layers">
      <h2 className="layers__head">Слои</h2>
      {layers.map(({ seed, recipe, face }, i) => (
        <button
          key={seed}
          type="button"
          className="layers__item"
          onClick={() => onPick(recipe)}
          title={`Открыть отложенную доску, seed ${seed}`}
        >
          <svg
            className="layers__thumb"
            viewBox={`0 0 ${face!.wMm} ${face!.hMm}`}
            preserveAspectRatio="xMidYMid meet"
            role="presentation"
          >
            {face!.cells.map((c, k) => (
              <rect
                key={k}
                x={c.xMm}
                y={c.yMm}
                width={c.wMm}
                height={c.hMm}
                fill={speciesById(c.speciesId).color}
              />
            ))}
          </svg>
          <span className="layers__label">
            Слой {String(i + 1).padStart(2, "0")}
          </span>
        </button>
      ))}
    </div>
  );
}
