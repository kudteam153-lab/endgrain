import { sliceYield } from "./geometry.ts";
import { buildProject } from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { panelAt, simulate } from "./simulate.ts";
import { SPECIES } from "./species.ts";
import type { Level, Project, Transform } from "./types.ts";

/**
 * Раскрой: что купить, что резать и в каком порядке (`PLAN.md §День 4`).
 *
 * Всё выводится из стека операций (`#D-01`). Второй код, считающий то же
 * самое своими формулами, разошёлся бы с превью — и разошёлся бы молча, а
 * проверяется это только в мастерской, на испорченной заготовке
 * (`CORE_PRINCIPLES.md §2.2`).
 *
 * Порядок шагов важнее сводной таблицы размеров. На доске в три склейки
 * полосы второго реза нарезаются из панели, которой на складе не существует:
 * столяр не может «взять по списку» то, что сам же склеит шагом раньше.
 */

const MM3_IN_M3 = 1e9;

/** Заготовка, которую покупают: порода и три размера. */
export interface StockItem {
  speciesId: string;
  widthMm: number;
  thicknessMm: number;
  lengthMm: number;
  count: number;
}

/** Панель, которая ложится на пилу. */
export interface PanelSize {
  wMm: number;
  hMm: number;
  lengthMm: number;
}

/** Один рез: что кладём, чем режем, сколько выходит и сколько нужно. */
export interface CutStep {
  /** Номер уровня в модели, 1-based. */
  level: number;
  kind: "rip" | "crosscut";
  panel: PanelSize;
  sliceWidthMm: number;
  kerfMm: number;
  /** Сколько плашек идёт в следующую склейку. */
  pieceCount: number;
  /** Сколько выйдет из панели. Меньше нужного — заготовки не хватает. */
  yieldCount: number;
  /** Что делают с плашками перед следующей склейкой. */
  transforms: Transform[];
}

export interface CutPlan {
  /** Заготовки первой склейки, сгруппированные по породе и размеру. */
  stock: StockItem[];
  steps: CutStep[];
  board: { wMm: number; lMm: number; hMm: number };
}

export interface SpeciesLine {
  speciesId: string;
  /** Объём купленной заготовки. */
  stockM3: number;
  /** Объём, оставшийся в готовой доске. */
  boardM3: number;
  /** Цена заготовки по `FACTS.md #F-09`. */
  costRub: number;
}

export interface Estimate {
  bySpecies: SpeciesLine[];
  stockM3: number;
  boardM3: number;
  /** Ушло в опилки на всех резах. */
  kerfM3: number;
  /** Съест выравнивание: плашка режется шире доски на припуск (#F-02). */
  planingM3: number;
  /**
   * Годный остаток заготовки. Не отход: доска длиной 400 мм из заготовки в
   * 1200 оставляет две трети материала, и они пойдут на следующую доску.
   * Считать их потерей — пугать столяра цифрой «не дошло до доски 59 %».
   */
  leftoverM3: number;
  /** Доля потерь от того, что реально пущено в дело: пропил и выравнивание. */
  wasteShare: number;
  costRub: number;
}

/**
 * Заготовки первой склейки, свёрнутые по «порода + три размера».
 *
 * Столяр покупает и пилит одинаковые ламели пачкой, а не по одной: список из
 * восьми строк, где четыре совпадают, — это список, по которому ошибаются.
 */
export function stockOf(project: Project): StockItem[] {
  const first = project.levels[0];
  if (!first || first.source.from !== "lumber") return [];

  const byKey = new Map<string, StockItem>();
  for (const s of first.source.strips) {
    const key = `${s.speciesId}|${s.widthMm}|${s.thicknessMm}|${s.lengthMm}`;
    const found = byKey.get(key);
    if (found) {
      found.count += 1;
      continue;
    }
    byKey.set(key, {
      speciesId: s.speciesId,
      widthMm: s.widthMm,
      thicknessMm: s.thicknessMm,
      lengthMm: s.lengthMm,
      count: 1,
    });
  }

  return [...byKey.values()];
}

/** План раскроя по уровням модели. */
export function planOf(project: Project): CutPlan {
  const steps = project.levels.map((level, i) => {
    const panel = panelAt(project.levels, i);
    return {
      level: i + 1,
      kind: level.cut.kind,
      panel: {
        wMm: panel.face.wMm,
        hMm: panel.face.hMm,
        lengthMm: panel.lengthMm,
      },
      sliceWidthMm: level.cut.sliceWidthMm,
      kerfMm: level.cut.kerfMm,
      pieceCount: level.pieceCount,
      yieldCount: yieldOf(level, panel.lengthMm, panel.face.wMm),
      transforms: level.transforms,
    };
  });

  return {
    stock: stockOf(project),
    steps,
    board: {
      wMm: project.boardWMm,
      lMm: project.boardLMm,
      hMm: project.boardHMm,
    },
  };
}

export const cutPlan = (recipe: Recipe): CutPlan =>
  planOf(buildProject(recipe));

/**
 * Сколько плашек даст рез. Поперечный ограничен длиной панели, продольный —
 * её шириной: пила идёт поперёк того размера, вдоль которого лежит рисунок.
 */
function yieldOf(level: Level, lengthMm: number, widthMm: number): number {
  const along = level.cut.kind === "crosscut" ? lengthMm : widthMm;
  return sliceYield(along, level.cut.sliceWidthMm, level.cut.kerfMm);
}

/**
 * Смета: объём по породам, отход и цена.
 *
 * «Купить» и «в доске» разведены намеренно (`FACTS.md #F-04`): между ними
 * лежат пропилы, припуск на выравнивание и остаток заготовки. Одна средняя
 * цифра «расход материала» скрывает ровно то, из-за чего в мастерской не
 * хватает доски.
 */
export function estimate(recipe: Recipe): Estimate {
  const project = buildProject(recipe);
  const plan = planOf(project);
  const face = simulate(project);

  const lines = new Map<string, SpeciesLine>();
  const lineFor = (id: string): SpeciesLine => {
    const found = lines.get(id);
    if (found) return found;
    const made: SpeciesLine = {
      speciesId: id,
      stockM3: 0,
      boardM3: 0,
      costRub: 0,
    };
    lines.set(id, made);
    return made;
  };

  for (const item of plan.stock) {
    const volume =
      (item.widthMm * item.thicknessMm * item.lengthMm * item.count) /
      MM3_IN_M3;
    const price = SPECIES.find((s) => s.id === item.speciesId)?.priceM3 ?? 0;
    const line = lineFor(item.speciesId);
    line.stockM3 += volume;
    line.costRub += volume * price;
  }

  // Сколько какой породы осталось в доске, считается по лицу: после резов и
  // сдвигов это единственное место, где порода привязана к площади.
  for (const c of face.cells) {
    lineFor(c.speciesId).boardM3 +=
      (c.wMm * c.hMm * project.boardHMm) / MM3_IN_M3;
  }

  const values = [...lines.values()];
  const stockM3 = sum(values.map((l) => l.stockM3));
  const boardM3 = sum(values.map((l) => l.boardM3));
  const kerfM3 = kerfVolume(plan);
  const planingM3 = planingVolume(plan);

  // В дело пущено то, что стало доской, опилками и стружкой выравнивания.
  // Всё остальное — целый кусок заготовки, который лежит на верстаке.
  const usedM3 = boardM3 + kerfM3 + planingM3;

  return {
    bySpecies: values,
    stockM3,
    boardM3,
    kerfM3,
    planingM3,
    leftoverM3: Math.max(0, stockM3 - usedM3),
    wasteShare: usedM3 > 0 ? (kerfM3 + planingM3) / usedM3 : 0,
    costRub: sum(values.map((l) => l.costRub)),
  };
}

/**
 * Припуск на выравнивание. Плашку режут шире готовой доски на 3 мм с каждой
 * стороны (#F-02), и эти шесть миллиметров с каждой плашки уходят в шлифовку.
 * Единственная потеря, которую нельзя уменьшить тонким диском.
 */
function planingVolume(plan: CutPlan): number {
  const last = plan.steps.at(-1);
  if (!last || last.kind !== "crosscut") return 0;

  const surplus = last.sliceWidthMm - plan.board.hMm;
  return (
    (last.pieceCount * Math.max(0, surplus) * last.panel.wMm * last.panel.hMm) /
    MM3_IN_M3
  );
}

/** Опилки: каждый рез уносит пропил по всей площади сечения панели. */
function kerfVolume(plan: CutPlan): number {
  let total = 0;
  for (const step of plan.steps) {
    // Резов на один меньше, чем плашек: последняя отделяется тем же резом,
    // что и предыдущая.
    const cuts = Math.max(0, step.pieceCount - 1);
    const area =
      step.kind === "crosscut"
        ? step.panel.wMm * step.panel.hMm
        : step.panel.hMm * step.panel.lengthMm;
    total += (cuts * step.kerfMm * area) / MM3_IN_M3;
  }
  return total;
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
