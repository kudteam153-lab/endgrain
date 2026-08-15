import { useEffect, useMemo, useRef } from "react";
import { generateGallery, generateRecipe } from "../core/generate.ts";
import { PATTERNS } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { speciesById } from "../core/species.ts";
import type { Face } from "../core/types.ts";
import { evaluate } from "../core/warnings.ts";
import "./Gallery.css";

/**
 * Двенадцать вариантов поверх листа.
 *
 * Оверлей, а не полоса снизу и не вкладка: экран один и не прокручивается
 * (#D-13), чертёж уже вписан в лист впритык, и любая постоянная лента отняла
 * бы у него высоту. Оверлей берёт место только пока смотрят варианты, и
 * закрывается клавишей.
 */

interface Props {
  base: Recipe;
  startSeed: number;
  favourites: number[];
  onPick: (recipe: Recipe) => void;
  onToggleFavourite: (seed: number) => void;
  onMore: () => void;
  onClose: () => void;
}

export function Gallery({
  base,
  startSeed,
  favourites,
  onPick,
  onToggleFavourite,
  onMore,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  const variants = useMemo(
    () => generateGallery(startSeed, base),
    [startSeed, base],
  );

  const saved = useMemo(
    () => favourites.map((seed) => generateRecipe(seed, base)),
    [favourites, base],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="gallery"
      role="dialog"
      aria-modal="true"
      aria-label="Варианты узора"
    >
      <div className="gallery__bar">
        <h2 className="label">Варианты</h2>
        <p className="gallery__hint">
          Размеры доски, пропил и заготовка — ваши. Меняется только узор.
        </p>
        <div className="stage__spacer" />
        <button type="button" className="btn btn--accent" onClick={onMore}>
          Ещё двенадцать
        </button>
        <button ref={closeRef} type="button" className="btn" onClick={onClose}>
          Закрыть
        </button>
      </div>

      <div className="gallery__scroll">
        {saved.length > 0 && (
          <section className="gallery__section">
            <h3 className="label">Отложено</h3>
            <ul className="gallery__grid">
              {saved.map((recipe) => (
                <Variant
                  key={`fav-${recipe.seed}`}
                  recipe={recipe}
                  saved
                  onPick={onPick}
                  onToggleFavourite={onToggleFavourite}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="gallery__section">
          <h3 className="label">Сгенерировано</h3>
          <ul className="gallery__grid">
            {variants.map((recipe) => (
              <Variant
                key={recipe.seed}
                recipe={recipe}
                saved={favourites.includes(recipe.seed)}
                onPick={onPick}
                onToggleFavourite={onToggleFavourite}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

interface VariantProps {
  recipe: Recipe;
  saved: boolean;
  onPick: (recipe: Recipe) => void;
  onToggleFavourite: (seed: number) => void;
}

function Variant({ recipe, saved, onPick, onToggleFavourite }: VariantProps) {
  const { face } = useMemo(() => evaluate(recipe), [recipe]);
  const patternName =
    PATTERNS.find((p) => p.id === recipe.pattern)?.name ?? recipe.pattern;
  const depth = (recipe.weaves ?? []).length;

  return (
    <li className="gallery__item">
      <button
        type="button"
        className="gallery__pick"
        onClick={() => onPick(recipe)}
        aria-label={`Открыть вариант ${recipe.seed}: узор «${patternName}»`}
      >
        {face ? (
          <Thumb face={face} />
        ) : (
          <span className="gallery__broken">не собирается</span>
        )}
      </button>

      <div className="gallery__meta">
        <span className="gallery__seed num">{recipe.seed}</span>
        <span className="gallery__pattern">
          {patternName}
          {depth > 0 && ` · ${depth === 1 ? "переклейка" : "две переклейки"}`}
        </span>
        <button
          type="button"
          className="gallery__save"
          aria-pressed={saved}
          aria-label={saved ? "Убрать из отложенных" : "Отложить вариант"}
          onClick={() => onToggleFavourite(recipe.seed)}
        >
          {saved ? "★" : "☆"}
        </button>
      </div>
    </li>
  );
}

/** Миниатюра: только узор. Размерные линии и штамп на превью не читаются. */
function Thumb({ face }: { face: Face }) {
  return (
    <svg
      className="gallery__thumb"
      viewBox={`0 0 ${face.wMm} ${face.hMm}`}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
    >
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
    </svg>
  );
}
