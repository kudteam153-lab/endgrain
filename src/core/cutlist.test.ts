import { describe, expect, it } from "vitest";
import { cutPlan, estimate } from "./cutlist.ts";
import { DEFAULT_RECIPE, boardWidth, rowCount } from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { speciesById } from "./species.ts";

/**
 * Раскрой проверяется сходимостью с чертежом, а не «функция возвращает
 * таблицу». Ошибка здесь стоит заготовки: столяр отпилит по нашим цифрам и
 * узнает о расхождении, когда доска уже склеена.
 */

const twoLevel: Recipe = {
  ...DEFAULT_RECIPE,
  lamellas: [
    { speciesId: "oak", widthMm: 60 },
    { speciesId: "maple", widthMm: 60 },
    { speciesId: "oak", widthMm: 60 },
    { speciesId: "maple", widthMm: 60 },
  ],
  lamellaThicknessMm: 30,
  boardLMm: 300,
  weaves: [{ stripWidthMm: 30, count: 6, kind: "rotate" }],
};

describe("заготовки", () => {
  it("сворачивает одинаковые ламели в одну строку с количеством", () => {
    // Восемь строк, где половина совпадает, — список, по которому ошибаются.
    const { stock } = cutPlan(twoLevel);
    expect(stock).toHaveLength(2);
    expect(stock.map((s) => s.count)).toEqual([2, 2]);
    expect(stock.map((s) => s.speciesId)).toEqual(["oak", "maple"]);
  });

  it("ширины заготовок в сумме дают ширину первой склейки", () => {
    const { stock } = cutPlan(twoLevel);
    const span = stock.reduce((s, i) => s + i.widthMm * i.count, 0);
    expect(span).toBe(240);
  });

  it("длина заготовки — та, что задал столяр, а не выведенная задним числом", () => {
    const { stock } = cutPlan(twoLevel);
    expect(stock.every((s) => s.lengthMm === twoLevel.blankLengthMm)).toBe(
      true,
    );
  });
});

describe("шаги реза", () => {
  it("на доске без переклеек — один поперечный рез", () => {
    const { steps } = cutPlan(DEFAULT_RECIPE);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.kind).toBe("crosscut");
    expect(steps[0]!.pieceCount).toBe(rowCount(DEFAULT_RECIPE));
  });

  it("переклейка идёт отдельным шагом до поперечного реза", () => {
    const { steps } = cutPlan(twoLevel);
    expect(steps.map((s) => s.kind)).toEqual(["rip", "crosscut"]);
    expect(steps[0]!.pieceCount).toBe(6);
  });

  it("каждый шаг знает панель, которую кладут на пилу", () => {
    // Первый рез идёт по склейке ламелей: 240 мм ширины, 30 высоты.
    // Второй — по панели переклейки: шесть полос по 30 мм высоты панели.
    const { steps } = cutPlan(twoLevel);
    expect(steps[0]!.panel).toEqual({ wMm: 240, hMm: 30, lengthMm: 1200 });
    expect(steps[1]!.panel.wMm).toBe(boardWidth(twoLevel));
    expect(steps[1]!.panel.hMm).toBe(30);
  });

  it("считает, сколько плашек выйдет, а не только сколько нужно", () => {
    // Расхождение этих двух чисел и есть отход (#F-03).
    const { steps } = cutPlan(DEFAULT_RECIPE);
    const step = steps[0]!;
    expect(step.yieldCount).toBeGreaterThanOrEqual(step.pieceCount);
    // 1200 мм заготовки, плашка 46 + пропил 3.2 → 24 штуки.
    expect(step.yieldCount).toBe(24);
  });

  it("готовая доска в плане совпадает с чертежом", () => {
    const plan = cutPlan(twoLevel);
    expect(plan.board.wMm).toBe(boardWidth(twoLevel));
    expect(plan.board.lMm).toBe(rowCount(twoLevel) * 30);
  });
});

describe("смета", () => {
  it("объём заготовки считается по трём размерам и количеству", () => {
    // Четыре ламели 60×30×1200 мм = 4 × 2 160 000 мм³ = 0.00864 м³.
    const { stockM3 } = estimate(twoLevel);
    expect(stockM3).toBeCloseTo(0.00864, 8);
  });

  it("цена берётся из породы, а не из среднего по палитре", () => {
    const { bySpecies } = estimate(twoLevel);
    for (const line of bySpecies) {
      const expected = line.stockM3 * speciesById(line.speciesId).priceM3;
      expect(line.costRub, line.speciesId).toBeCloseTo(expected, 6);
    }
  });

  it("в доске остаётся меньше, чем куплено", () => {
    // Между «купить» и «в доске» лежат пропил, припуск на выравнивание и
    // остаток заготовки — ради этой разницы смета и разведена на две цифры.
    const { stockM3, boardM3, wasteShare } = estimate(twoLevel);
    expect(boardM3).toBeGreaterThan(0);
    expect(boardM3).toBeLessThan(stockM3);
    expect(wasteShare).toBeGreaterThan(0);
    expect(wasteShare).toBeLessThan(1);
  });

  it("остаток заготовки не считается отходом", () => {
    // Доска 300 мм из заготовки 1200 оставляет три четверти материала целым
    // куском. Записать это в потери — сказать столяру, что он выбросил
    // три четверти купленного, хотя оно лежит на верстаке.
    const { stockM3, boardM3, kerfM3, planingM3, leftoverM3, wasteShare } =
      estimate(twoLevel);

    expect(leftoverM3).toBeGreaterThan(0);
    expect(boardM3 + kerfM3 + planingM3 + leftoverM3).toBeCloseTo(stockM3, 9);
    // Потери считаются от пущенного в дело, а не от всего купленного.
    expect(wasteShare).toBeLessThan(0.5);
  });

  it("припуск на выравнивание — шесть миллиметров с плашки", () => {
    // Плашка режется шириной 46 при доске 40 (#F-02). На 10 плашках лица
    // 240×30 это 10 × 6 × 240 × 30 = 432 000 мм³.
    const plan = cutPlan(twoLevel);
    const last = plan.steps.at(-1)!;
    const expected =
      (last.pieceCount * 6 * last.panel.wMm * last.panel.hMm) / 1e9;
    expect(estimate(twoLevel).planingM3).toBeCloseTo(expected, 9);
  });

  it("тонкий диск уменьшает опилки, но не припуск на выравнивание", () => {
    const thin = estimate({ ...twoLevel, kerfMm: 2.4 });
    const full = estimate({ ...twoLevel, kerfMm: 3.2 });
    expect(thin.kerfM3).toBeLessThan(full.kerfM3);
    expect(thin.planingM3).toBeCloseTo(full.planingM3, 9);
  });

  it("объём доски сходится с её габаритом", () => {
    // Сумма по породам обязана давать физический объём доски: иначе где-то
    // потерялась или удвоилась площадь.
    const plan = cutPlan(twoLevel);
    const { boardM3 } = estimate(twoLevel);
    const geometric = (plan.board.wMm * plan.board.lMm * plan.board.hMm) / 1e9;
    expect(boardM3).toBeCloseTo(geometric, 9);
  });

  it("опилки не превышают того, что купили", () => {
    const { kerfM3, stockM3 } = estimate(twoLevel);
    expect(kerfM3).toBeGreaterThan(0);
    expect(kerfM3).toBeLessThan(stockM3);
  });

  it("тонкий пропил оставляет больше материала, чем полный", () => {
    // Проверка направления, а не величины: 2.4 против 3.2 (#F-01).
    const thin = estimate({ ...twoLevel, kerfMm: 2.4 });
    const full = estimate({ ...twoLevel, kerfMm: 3.2 });
    expect(thin.kerfM3).toBeLessThan(full.kerfM3);
  });
});
