import { PATTERNS, boardWidth, rowCount, sliceWidth } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { SPECIES } from "../core/species.ts";
import { requiredBlankLength, sliceCapacity } from "../core/warnings.ts";
import "./Controls.css";

/**
 * Панель параметров. Пересчёт мгновенный, кнопки «применить» нет
 * (`CORE_PRINCIPLES.md §3`).
 *
 * Ширина доски здесь не поле ввода, а следствие раскладки ламелей — как на
 * верстаке. Поле, которое молча переставляло бы ламели под введённое число,
 * врало бы: столяр режет то, что в списке, а не то, что в поле.
 */

interface Props {
  recipe: Recipe;
  patch: (next: Partial<Recipe>) => void;
  onReset: () => void;
}

export function Controls({ recipe, patch, onReset }: Props) {
  const setLamella = (
    index: number,
    next: Partial<{ speciesId: string; widthMm: number }>,
  ) => {
    patch({
      lamellas: recipe.lamellas.map((l, i) =>
        i === index ? { ...l, ...next } : l,
      ),
    });
  };

  const addLamella = () => {
    const last = recipe.lamellas[recipe.lamellas.length - 1];
    patch({
      lamellas: [
        ...recipe.lamellas,
        { speciesId: last?.speciesId ?? "oak", widthMm: last?.widthMm ?? 40 },
      ],
    });
  };

  const removeLamella = (index: number) => {
    if (recipe.lamellas.length <= 2) return;
    patch({ lamellas: recipe.lamellas.filter((_, i) => i !== index) });
  };

  const rows = rowCount(recipe);
  const capacity = sliceCapacity(recipe);

  return (
    <div className="controls">
      <section className="controls__group">
        <h2 className="label">Узор</h2>
        <div className="controls__patterns" role="radiogroup" aria-label="Узор">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={recipe.pattern === p.id}
              className="controls__pattern"
              onClick={() => patch({ pattern: p.id })}
            >
              <span className="controls__pattern-name">{p.name}</span>
              <span className="controls__pattern-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="controls__group">
        <h2 className="label">Ламели первой склейки</h2>
        <p className="controls__aside">
          Ширина доски — сумма ламелей:{" "}
          <span className="num">{boardWidth(recipe)}</span> мм. Это не поле
          ввода, а то, что вы реально склеиваете.
        </p>

        <ol className="controls__lamellas">
          {recipe.lamellas.map((l, i) => (
            <li key={i} className="controls__lamella">
              <span className="controls__lamella-no num">{i + 1}</span>
              <select
                className="controls__select"
                aria-label={`Порода ламели ${i + 1}`}
                value={l.speciesId}
                onChange={(e) => setLamella(i, { speciesId: e.target.value })}
              >
                {SPECIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                className="controls__num"
                type="number"
                min={1}
                max={500}
                step={1}
                aria-label={`Ширина ламели ${i + 1}, мм`}
                value={l.widthMm}
                onChange={(e) =>
                  setLamella(i, { widthMm: Number(e.target.value) || 1 })
                }
              />
              <button
                type="button"
                className="controls__icon-btn"
                aria-label={`Убрать ламель ${i + 1}`}
                disabled={recipe.lamellas.length <= 2}
                onClick={() => removeLamella(i)}
              >
                −
              </button>
            </li>
          ))}
        </ol>

        <button type="button" className="controls__btn" onClick={addLamella}>
          Добавить ламель
        </button>
      </section>

      <section className="controls__group">
        <h2 className="label">Размеры доски</h2>

        <Field
          label="Длина"
          unit="мм"
          value={recipe.boardLMm}
          min={20}
          max={2000}
          onChange={(v) => patch({ boardLMm: v })}
          note={`${rows} рядов по ${recipe.lamellaThicknessMm} мм`}
        />
        <Field
          label="Толщина"
          unit="мм"
          value={recipe.boardHMm}
          min={5}
          max={200}
          onChange={(v) => patch({ boardHMm: v })}
          note={`режем плашку ${sliceWidth(recipe)} мм — с припуском на выравнивание`}
        />
        <Field
          label="Толщина ламели"
          unit="мм"
          value={recipe.lamellaThicknessMm}
          min={1}
          max={200}
          onChange={(v) => patch({ lamellaThicknessMm: v })}
          note="высота ряда на готовой доске"
        />
      </section>

      <section className="controls__group">
        <h2 className="label">Пила и заготовка</h2>

        <div className="controls__row">
          <span className="controls__label">Пропил</span>
          <div
            className="controls__segmented"
            role="radiogroup"
            aria-label="Ширина пропила"
          >
            {[3.2, 2.4].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={recipe.kerfMm === k}
                className="controls__seg"
                onClick={() => patch({ kerfMm: k })}
              >
                <span className="num">{k}</span> мм
              </button>
            ))}
          </div>
        </div>
        <p className="controls__aside">
          3.2 — полный диск, 2.4 — тонкий. Пропил уходит в опилки: на нём
          считается отход.
        </p>

        <Field
          label="Длина заготовки"
          unit="мм"
          value={recipe.blankLengthMm}
          min={50}
          max={5000}
          onChange={(v) => patch({ blankLengthMm: v })}
          note={`хватит на ${capacity} плашек, нужно ${rows} · от ${Math.ceil(requiredBlankLength(recipe))} мм`}
        />
      </section>

      <section className="controls__group">
        <button
          type="button"
          className="controls__btn controls__btn--quiet"
          onClick={onReset}
        >
          Сбросить к исходной доске
        </button>
      </section>
    </div>
  );
}

interface FieldProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  note?: string;
  onChange: (value: number) => void;
}

function Field({ label, unit, value, min, max, note, onChange }: FieldProps) {
  return (
    <div className="controls__field">
      <label className="controls__row">
        <span className="controls__label">{label}</span>
        <span className="controls__input-wrap">
          <input
            className="controls__num"
            type="number"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value) || min)}
          />
          <span className="controls__unit">{unit}</span>
        </span>
      </label>
      {note && <p className="controls__note">{note}</p>}
    </div>
  );
}
