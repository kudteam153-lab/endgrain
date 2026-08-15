import { boardWidth, rowCount, sliceWidth } from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { simulate } from "./simulate.ts";
import { buildProject } from "./recipe.ts";
import type { Face } from "./types.ts";

/**
 * Видимый слой физической реализуемости (DECISIONS.md #D-09).
 *
 * Модель и так не выражает неизготавливаемое (#D-01) — но именно поэтому она
 * молчит, и человек со стороны не отличит «проверок нет» от «нарушить
 * нельзя». Здесь собрано то, что модель собрать даёт, а мастерская — нет:
 * не хватило заготовки, элемент тоньше, чем можно склеить, толщина, при
 * которой доску поведёт.
 *
 * Правило: предупреждение появляется, когда есть что сказать. Постоянной
 * зелёной плашки «всё хорошо» нет — она превращает предупреждения в фон.
 */

export type Severity = "alarm" | "note";

export interface Warning {
  id: string;
  severity: Severity;
  text: string;
  /** Откуда взято ограничение — чтобы столяр мог не верить на слово. */
  source?: string;
}

/** Тоньше этого ламель не удержать в струбцинах ровно — уводит по шву. */
const MIN_LAMELLA_MM = 10;
/** Тоньше этого элемент на готовой доске выглядит браком склейки. */
const MIN_ELEMENT_MM = 4;
/** Тоньше этой доски торцевую вести будет при первой же сушке. */
const MIN_BOARD_H_MM = 20;
/** Толще — вес, цена и лишний час строгания без выигрыша. */
const MAX_BOARD_H_MM = 60;

/**
 * Сколько плашек выйдет из заготовки. Последний кусок не в счёт: короткий
 * остаток нельзя безопасно подать на пилу (FACTS.md #F-03).
 */
export function sliceCapacity(r: Recipe): number {
  const step = sliceWidth(r) + r.kerfMm;
  return step > 0 ? Math.floor(r.blankLengthMm / step) : 0;
}

/** Длина заготовки, которой хватит на задуманное. Обратная сторона #F-03. */
export function requiredBlankLength(r: Recipe): number {
  return rowCount(r) * (sliceWidth(r) + r.kerfMm);
}

export function collectWarnings(r: Recipe, face: Face): Warning[] {
  const out: Warning[] = [];

  const rows = rowCount(r);
  const capacity = sliceCapacity(r);
  if (rows > capacity) {
    const need = Math.ceil(requiredBlankLength(r));
    out.push({
      id: "blank-too-short",
      severity: "alarm",
      text: `Заготовки не хватит: нужно ${rows} плашек, из ${r.blankLengthMm} мм выйдет ${capacity}. Возьмите заготовку от ${need} мм или уменьшите длину доски.`,
      source: "длина = число плашек × (толщина + пропил) + припуск (#F-03)",
    });
  }

  const thinLamella = r.lamellas.find((l) => l.widthMm < MIN_LAMELLA_MM);
  if (thinLamella) {
    out.push({
      id: "lamella-too-thin",
      severity: "alarm",
      text: `Ламель ${thinLamella.widthMm} мм — тоньше ${MIN_LAMELLA_MM} мм её не удержать в струбцинах ровно, шов уведёт.`,
    });
  }

  // Полуплашки кирпичного смещения возникают сами (#F-07) и могут оказаться
  // тоньше, чем имеет смысл клеить. Считаются по факту, а не по формуле:
  // узор уже собран, и мелкие элементы в нём видно.
  const tiniest = face.cells.reduce((min, c) => Math.min(min, c.wMm), Infinity);
  if (Number.isFinite(tiniest) && tiniest < MIN_ELEMENT_MM) {
    out.push({
      id: "element-too-small",
      severity: "note",
      text: `В узоре есть элемент ${tiniest.toFixed(1)} мм. Такие полоски съедает шлифовка — узор выйдет не таким, как на превью.`,
    });
  }

  if (r.boardHMm < MIN_BOARD_H_MM) {
    out.push({
      id: "board-too-thin",
      severity: "alarm",
      text: `Доска ${r.boardHMm} мм — торцевую тоньше ${MIN_BOARD_H_MM} мм ведёт при первой сушке.`,
    });
  } else if (r.boardHMm > MAX_BOARD_H_MM) {
    out.push({
      id: "board-too-thick",
      severity: "note",
      text: `Доска ${r.boardHMm} мм — это вес и цена без выигрыша. Обычная торцевая — 35–50 мм.`,
    });
  }

  const speciesUsed = new Set(r.lamellas.map((l) => l.speciesId));
  if (speciesUsed.size < 2) {
    out.push({
      id: "single-species",
      severity: "note",
      text: "Одна порода — узора не будет видно. Добавьте вторую с заметно другим тоном.",
    });
  }

  return out;
}

/** Собрать доску и её предупреждения за один проход. */
export function evaluate(r: Recipe): {
  face: Face | null;
  error: string | null;
  warnings: Warning[];
} {
  try {
    const face = simulate(buildProject(r));
    return { face, error: null, warnings: collectWarnings(r, face) };
  } catch (e) {
    // Отказ модели — это сообщение столяру, а не код ошибки (#D-09).
    return {
      face: null,
      error: e instanceof Error ? e.message : String(e),
      warnings: [],
    };
  }
}

export const boardDimensions = (r: Recipe) => ({
  wMm: boardWidth(r),
  lMm: rowCount(r) * r.lamellaThicknessMm,
  hMm: r.boardHMm,
});
