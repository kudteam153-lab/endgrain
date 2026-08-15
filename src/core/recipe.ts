import { topRow } from "./geometry.ts";
import { panelAt } from "./simulate.ts";
import { SPECIES } from "./species.ts";
import type { Level, Piece, Project, Strip, Transform } from "./types.ts";

/**
 * Рецепт — то, чем крутит человек. Модель операций (`Project`, #D-01) остаётся
 * источником истины, но собирать стек склеек и резов руками столяру незачем:
 * он думает ламелями, размерами доски и узором.
 *
 * Односторонняя связь: рецепт → проект. Обратной нет намеренно. Иначе
 * появятся два способа описать одну доску, и однажды они разойдутся —
 * ровно то, что запрещает `CORE_PRINCIPLES.md §2.2`.
 */

/** Припуск на выравнивание, по 3 мм на сторону — FACTS.md #F-02. */
export const FLATTENING_ALLOWANCE_MM = 3;

/** Ширина пропила по умолчанию — FACTS.md #F-01. */
export const DEFAULT_KERF_MM = 3.2;

export type PatternId = "stripe" | "checker" | "brick" | "diamond" | "mirror";

/**
 * Переклейка: панель режется вдоль на полосы, полосы разворачиваются и
 * склеиваются заново.
 *
 * Это то, что делает рисунок двумерным. Без переклейки узор — вертикальные
 * полосы, как их ни сдвигай: рез один, и делить лицо по высоте нечем.
 * Переклеек 0–2, дальше идёт обязательный поперечный рез — отсюда «1–3
 * уровня» из `PLAN.md §День 3`.
 */
export type WeaveId = "rotate" | "basket";

export interface Weave {
  /** Ширина полосы продольного реза. */
  stripWidthMm: number;
  /** Сколько полос идёт в следующую склейку. */
  count: number;
  kind: WeaveId;
}

export interface Lamella {
  speciesId: string;
  widthMm: number;
}

export interface Recipe {
  /** Ламели первой склейки слева направо. */
  lamellas: Lamella[];
  /** Толщина ламели = высота ряда на готовой доске, пока нет переклеек. */
  lamellaThicknessMm: number;
  /** Длина исходной заготовки — из неё нарезаются плашки (#F-03). */
  blankLengthMm: number;
  boardLMm: number;
  boardHMm: number;
  kerfMm: number;
  pattern: PatternId;
  /**
   * Переклейки до поперечного реза. Пусто или отсутствует — доска в один
   * уровень, как было до дня 3; старые сохранённые проекты читаются без правок.
   */
  weaves?: Weave[];
  units: "mm" | "in";
  seed: number;
}

export const PATTERNS: ReadonlyArray<{
  id: PatternId;
  name: string;
  hint: string;
}> = [
  { id: "stripe", name: "Полоса", hint: "ряды не смещаются" },
  { id: "checker", name: "Шахматка", hint: "каждый второй ряд на ламель" },
  {
    id: "brick",
    name: "Кирпич",
    hint: "на половину ламели, с крайними полуплашками",
  },
  { id: "diamond", name: "Диагональ", hint: "нарастающий сдвиг ряд за рядом" },
  { id: "mirror", name: "Зеркало", hint: "каждый второй ряд отражён" },
];

export const WEAVES: ReadonlyArray<{
  id: WeaveId;
  name: string;
  hint: string;
}> = [
  {
    id: "rotate",
    name: "Поворот",
    hint: "полосы ставятся на ребро — рисунок делится и по высоте",
  },
  {
    id: "basket",
    name: "Корзинка",
    hint: "соседние полосы развёрнуты навстречу друг другу",
  },
];

/** Сумма ширин ламелей — ширина того, что склеивается первым. */
export const lamellaSpan = (r: Recipe): number =>
  r.lamellas.reduce((sum, l) => sum + l.widthMm, 0);

/**
 * Ширина реза плашки = финальная толщина + 2 × припуск (#F-02).
 * Считать от финальной толщины напрямую — получить доску тоньше заявленной
 * после шлифовки.
 */
export const sliceWidth = (r: Recipe): number =>
  r.boardHMm + 2 * FLATTENING_ALLOWANCE_MM;

/** Последовательность трансформов узора. Длина подстраивается под раскладку. */
export function patternTransforms(
  pattern: PatternId,
  columnCount: number,
): Transform[] {
  switch (pattern) {
    case "stripe":
      return [{ op: "none" }];
    case "checker":
      return [{ op: "none" }, { op: "offset", steps: 1 }];
    case "brick":
      return [{ op: "none" }, { op: "halfWidth" }];
    case "mirror":
      return [{ op: "none" }, { op: "mirror" }];
    case "diamond":
      // Сдвиг растёт на колонку в каждом ряду и замыкается на ширине доски —
      // отсюда диагональ, а не лесенка в никуда.
      return Array.from({ length: Math.max(2, columnCount) }, (_, i) => ({
        op: "offset" as const,
        steps: i,
      }));
  }
}

/**
 * Что делают с полосами перед обратной склейкой.
 *
 * Поворот обязателен всем полосам сразу: у повёрнутой лицо меняет ширину с
 * высотой, и полоса, оставленная как есть, встанет рядом другого размера —
 * в склейке появится пустота, которой на верстаке соответствует щель.
 */
function weaveTransforms(kind: WeaveId): Transform[] {
  switch (kind) {
    case "rotate":
      return [{ op: "rot90", dir: "cw" }];
    case "basket":
      return [
        { op: "rot90", dir: "cw" },
        { op: "rot90", dir: "ccw" },
      ];
  }
}

const stripsOf = (r: Recipe): Strip[] =>
  r.lamellas.map((l) => ({
    speciesId: l.speciesId,
    widthMm: l.widthMm,
    thicknessMm: r.lamellaThicknessMm,
    lengthMm: r.blankLengthMm,
  }));

/** Уровни переклейки: каждый — продольный рез и разворот полос. */
function weaveLevels(r: Recipe): Level[] {
  const strips = stripsOf(r);
  return (r.weaves ?? []).map((w, i) => ({
    source:
      i === 0
        ? ({ from: "lumber", strips } as const)
        : ({ from: "previous" } as const),
    cut: {
      kind: "rip" as const,
      angleDeg: 90,
      sliceWidthMm: w.stripWidthMm,
      kerfMm: r.kerfMm,
    },
    pieceCount: w.count,
    transforms: weaveTransforms(w.kind),
  }));
}

/** Финальный поперечный рез — тот, что разворачивает волокно в торец. */
function crosscutLevel(r: Recipe, columnCount: number, rows: number): Level {
  const weaves = r.weaves ?? [];
  return {
    source:
      weaves.length === 0
        ? ({ from: "lumber", strips: stripsOf(r) } as const)
        : ({ from: "previous" } as const),
    cut: {
      kind: "crosscut" as const,
      angleDeg: 90,
      sliceWidthMm: sliceWidth(r),
      kerfMm: r.kerfMm,
    },
    pieceCount: rows,
    transforms: patternTransforms(r.pattern, columnCount),
  };
}

/**
 * Панель, которая ложится под поперечный рез.
 *
 * Её высота — высота одного ряда готовой доски, и после переклейки она уже не
 * равна толщине ламели. Спрашивается у симулятора, а не считается формулой
 * рядом: формула — это второй способ узнать то же самое (§2.2).
 */
export function panelBeforeCut(r: Recipe): Piece {
  const weaves = weaveLevels(r);
  // Число рядов здесь ещё не известно и на панель не влияет: рез финального
  // уровня не выполняется, склейка перед ним — выполняется.
  const levels = [...weaves, crosscutLevel(r, r.lamellas.length, 1)];
  return panelAt(levels, weaves.length);
}

/**
 * Потолок числа плашек.
 *
 * Не столярное ограничение, а страховка вкладки: ряд толщиной в миллиметр при
 * доске в два метра требует двух тысяч плашек, и симуляция такой доски вешает
 * браузер — ровно там, где её открывает жюри. Столярный предел наступает
 * гораздо раньше: доска из 400 плашек уже нереальна по времени склейки.
 */
const MAX_ROWS = 400;

/** Сколько рядов плашек нужно на заданную длину доски. */
export const rowCount = (r: Recipe): number =>
  Math.min(
    MAX_ROWS,
    Math.max(1, Math.round(r.boardLMm / panelBeforeCut(r).face.hMm)),
  );

/** Ширина готовой доски. До переклеек равна сумме ламелей, после — нет. */
export const boardWidth = (r: Recipe): number => panelBeforeCut(r).face.wMm;

/** Рецепт → стек столярных операций. */
export function buildProject(r: Recipe): Project {
  const weaves = weaveLevels(r);
  const panel = panelBeforeCut(r);
  const rows = rowCount(r);

  return {
    species: [...SPECIES],
    levels: [...weaves, crosscutLevel(r, topRow(panel.face).length, rows)],
    boardWMm: panel.face.wMm,
    boardLMm: rows * panel.face.hMm,
    boardHMm: r.boardHMm,
    units: r.units,
    seed: r.seed,
  };
}

export const DEFAULT_RECIPE: Recipe = {
  lamellas: [
    { speciesId: "oak", widthMm: 40 },
    { speciesId: "maple", widthMm: 40 },
    { speciesId: "walnut", widthMm: 40 },
    { speciesId: "maple", widthMm: 40 },
    { speciesId: "oak", widthMm: 40 },
    { speciesId: "padauk", widthMm: 40 },
    { speciesId: "maple", widthMm: 40 },
    { speciesId: "walnut", widthMm: 40 },
  ],
  lamellaThicknessMm: 40,
  // Полтора метра — ходовая доска в магазине. При 800 мм плашек хватало ровно
  // на доску без переклеек, и генератор физически не мог показать ничего
  // сложнее полос: каждый второй рез упирался в нехватку заготовки.
  blankLengthMm: 1200,
  boardLMm: 400,
  boardHMm: 40,
  kerfMm: DEFAULT_KERF_MM,
  pattern: "diamond",
  units: "mm",
  seed: 1,
};
