import { useMemo } from "react";
import { cutPlan, estimate } from "../core/cutlist.ts";
import type { CutStep } from "../core/cutlist.ts";
import { PATTERNS } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { speciesById } from "../core/species.ts";
import { formatLength, formatMoney, formatVolume } from "../core/units.ts";
import type { Transform } from "../core/types.ts";
import "./CutSheet.css";

/**
 * Лист 02 — раскрой: что купить, что резать и в каком порядке.
 *
 * Второй лист, а не оверлей: тем же способом он уйдёт в печать (#D-14) и в
 * PDF дня 5. Столяр смотрит на цифры не одновременно с узором, а вместо него —
 * когда узор уже выбран и надо ехать за материалом.
 *
 * Порядок работ важнее сводной таблицы: на доске в три склейки полосы второго
 * реза берутся из панели, которую сам же и склеил шагом раньше. Списком
 * размеров это не описывается.
 */

interface Props {
  recipe: Recipe;
}

export function CutSheet({ recipe }: Props) {
  const plan = useMemo(() => cutPlan(recipe), [recipe]);
  const cost = useMemo(() => estimate(recipe), [recipe]);
  const units = recipe.units;

  // В таблицах единица стоит в шапке колонки, в тексте шага — рядом с числом:
  // «полосы по 28» читается как «28 штук», а не «28 мм».
  const len = (mm: number) => formatLength(mm, units);
  const size = (mm: number) =>
    units === "mm" ? `${formatLength(mm, units)} мм` : formatLength(mm, units);
  const patternName =
    PATTERNS.find((p) => p.id === recipe.pattern)?.name ?? recipe.pattern;

  return (
    <article className="cut-sheet">
      <header className="cut-sheet__head">
        <div>
          <p className="label">Лист 02</p>
          <h2 className="cut-sheet__title">Раскрой и материал</h2>
        </div>
        <p className="cut-sheet__lead">
          Доска {len(plan.board.wMm)} × {len(plan.board.lMm)} ×{" "}
          {len(plan.board.hMm)}, узор «{patternName}», seed {recipe.seed}.
        </p>
      </header>

      <section className="cut-sheet__block">
        <h3 className="label">Заготовки — что купить</h3>
        <table className="cut-sheet__table">
          <thead>
            <tr>
              <th>№</th>
              <th>Порода</th>
              <th className="num">Ширина</th>
              <th className="num">Толщина</th>
              <th className="num">Длина</th>
              <th className="num">Шт</th>
            </tr>
          </thead>
          <tbody>
            {plan.stock.map((item, i) => (
              <tr key={`${item.speciesId}-${i}`}>
                <td className="num">{i + 1}</td>
                <td>{speciesById(item.speciesId).name}</td>
                <td className="num">{len(item.widthMm)}</td>
                <td className="num">{len(item.thicknessMm)}</td>
                <td className="num">{len(item.lengthMm)}</td>
                <td className="num">{item.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="cut-sheet__block">
        <h3 className="label">Порядок работ</h3>
        <ol className="cut-sheet__steps">
          {buildSteps(plan.steps, patternName, size).map((step, i) => (
            <li key={i} className="cut-sheet__step">
              <p className="cut-sheet__step-text">{step.text}</p>
              {step.note && <p className="cut-sheet__note">{step.note}</p>}
              {step.short && <p className="cut-sheet__short">{step.short}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="cut-sheet__block">
        <h3 className="label">Материал</h3>
        <table className="cut-sheet__table">
          <thead>
            <tr>
              <th>Порода</th>
              <th className="num">Купить</th>
              <th className="num">В доске</th>
              <th className="num">Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {cost.bySpecies.map((line) => (
              <tr key={line.speciesId}>
                <td>{speciesById(line.speciesId).name}</td>
                <td className="num">{formatVolume(line.stockM3, units)}</td>
                <td className="num">{formatVolume(line.boardM3, units)}</td>
                <td className="num">{formatMoney(line.costRub)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Итого</td>
              <td className="num">{formatVolume(cost.stockM3, units)}</td>
              <td className="num">{formatVolume(cost.boardM3, units)}</td>
              <td className="num">{formatMoney(cost.costRub)}</td>
            </tr>
          </tfoot>
        </table>

        <dl className="cut-sheet__facts">
          <div>
            <dt>В опилки</dt>
            <dd className="num">{formatVolume(cost.kerfM3, units)}</dd>
          </div>
          <div>
            <dt>На выравнивание</dt>
            <dd className="num">{formatVolume(cost.planingM3, units)}</dd>
          </div>
          <div>
            <dt>Потери</dt>
            <dd className="num">{Math.round(cost.wasteShare * 100)} %</dd>
          </div>
          <div>
            <dt>Останется целым</dt>
            <dd className="num">{formatVolume(cost.leftoverM3, units)}</dd>
          </div>
        </dl>
        <p className="cut-sheet__note">
          Потери считаются от того, что пущено в дело: пропил и припуск на
          выравнивание. Остаток заготовки в них не входит — это целый кусок, он
          пойдёт на следующую доску.
        </p>
        <p className="cut-sheet__note">
          Брать с запасом: {formatVolume(cost.stockM3 * 1.15, units)} …{" "}
          {formatVolume(cost.stockM3 * 1.3, units)}. Это 10–20 % на раскрой и
          5–10 % на сучки и трещины — доску выбирают на месте, и часть
          отбраковывается до пилы.
        </p>
      </section>
    </article>
  );
}

interface Step {
  text: string;
  note?: string | undefined;
  /** Заготовки не хватает — предупреждение прямо в шаге. */
  short?: string | undefined;
}

/**
 * Шаги словами. Каждый — одно действие у станка: склеить, распустить,
 * развернуть, отрезать. Формулировки короткие намеренно — лист читают,
 * стоя у верстака, а не за столом.
 */
function buildSteps(
  steps: CutStep[],
  patternName: string,
  len: (mm: number) => string,
): Step[] {
  const out: Step[] = [];

  for (const [i, step] of steps.entries()) {
    const panel = `${len(step.panel.wMm)} × ${len(step.panel.hMm)}`;

    if (i === 0) {
      out.push({
        text: `Склеить ламели кромка к кромке в панель ${panel}, длина ${len(step.panel.lengthMm)}.`,
        note: "Направление волокон у соседних ламелей чередовать — иначе панель поведёт.",
      });
    }

    if (step.kind === "rip") {
      out.push({
        text: `Распустить панель вдоль на полосы по ${len(step.sliceWidthMm)}. Нужно ${step.pieceCount}.`,
        short: shortfallNote(step),
      });
      out.push({
        text: turnText(step.transforms),
        note: `Склеить полосы обратно в панель — она станет шире исходной: ${len(
          steps[i + 1]?.panel.wMm ?? step.panel.wMm,
        )}.`,
      });
      continue;
    }

    out.push({
      text: `Отрезать поперёк ${step.pieceCount} плашек шириной ${len(step.sliceWidthMm)}.`,
      note: `Ширина реза — толщина доски плюс по ${len(3)} на сторону: припуск съест шлифовка.`,
      short: shortfallNote(step),
    });
  }

  out.push({
    text: `Разложить плашки по узору «${patternName}», склеить, зажать.`,
    note: "Торец не строгать: рейсмус вырывает волокно. Только шлифовка от 80 к 220.",
  });

  return out;
}

/** Что делают с полосами перед обратной склейкой. */
function turnText(transforms: Transform[]): string {
  const dirs = transforms.filter((t) => t.op === "rot90");
  if (dirs.length > 1) {
    return "Поставить полосы на ребро, соседние разворачивать навстречу друг другу.";
  }
  return "Поставить все полосы на ребро, разворачивая в одну сторону.";
}

/** Предупреждение прямо в шаге: заготовки не хватит. */
function shortfallNote(step: CutStep): string | undefined {
  if (step.yieldCount >= step.pieceCount) return undefined;
  return `Из панели выйдет ${step.yieldCount} — не хватает ${step.pieceCount - step.yieldCount}. Возьмите заготовку длиннее.`;
}
