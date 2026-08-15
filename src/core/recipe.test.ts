import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECIPE,
  boardWidth,
  buildProject,
  lamellaSpan,
  rowCount,
} from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { simulate } from "./simulate.ts";
import { topRow } from "./geometry.ts";

/**
 * Рецепт на 1–3 уровня (`PLAN.md §День 3`). Проверяется не «переклейка
 * работает», а то, что после неё габариты доски продолжают совпадать с тем,
 * что человек соберёт на верстаке: ширину и высоту ряда меняет каждая
 * переклейка, и ошибка здесь — это доска не того размера, отпечатанная в PDF.
 */

/** Плед дня 1: те же числа, что посчитаны руками в `simulate.test.ts`. */
const plaid: Recipe = {
  lamellas: [
    { speciesId: "oak", widthMm: 60 },
    { speciesId: "maple", widthMm: 60 },
  ],
  lamellaThicknessMm: 20,
  blankLengthMm: 600,
  boardLMm: 100,
  boardHMm: 40,
  kerfMm: 3.2,
  pattern: "checker",
  weaves: [{ stripWidthMm: 25, count: 4, kind: "rotate" }],
  units: "mm",
  seed: 1,
};

describe("один уровень — как было до дня 3", () => {
  it("ширина доски равна сумме ламелей, ряд равен толщине ламели", () => {
    // Обратная совместимость: рецепты без переклеек лежат в localStorage у
    // всех, кто открывал приложение на дне 2.
    expect(boardWidth(DEFAULT_RECIPE)).toBe(lamellaSpan(DEFAULT_RECIPE));
    expect(rowCount(DEFAULT_RECIPE)).toBe(
      DEFAULT_RECIPE.boardLMm / DEFAULT_RECIPE.lamellaThicknessMm,
    );
  });

  it("строит ровно один уровень — поперечный рез", () => {
    const project = buildProject(DEFAULT_RECIPE);
    expect(project.levels).toHaveLength(1);
    expect(project.levels[0]!.cut.kind).toBe("crosscut");
    expect(project.levels[0]!.source.from).toBe("lumber");
  });
});

describe("две склейки — переклейка «поворот»", () => {
  it("даёт доску тех же размеров, что посчитаны руками на дне 1", () => {
    // Панель 120×20 → полосы 25 мм, четыре штуки → поворот → склейка 80×25 →
    // четыре ряда по 25 → доска 80×100.
    expect(boardWidth(plaid)).toBe(80);
    expect(rowCount(plaid)).toBe(4);

    const face = simulate(buildProject(plaid));
    expect(face.wMm).toBe(80);
    expect(face.hMm).toBe(100);
  });

  it("делит рисунок по обеим осям, а не только по ширине", () => {
    // Ради этого переклейка и заведена: без неё лицо делится только
    // вертикальными швами, как ряды ни сдвигай.
    const face = simulate(buildProject(plaid));
    const xEdges = new Set(face.cells.map((c) => c.xMm));
    const yEdges = new Set(face.cells.map((c) => c.yMm));
    expect(xEdges.size).toBeGreaterThan(2);
    expect(yEdges.size).toBeGreaterThan(rowCount(plaid));
  });

  it("строит два уровня: продольный рез, затем поперечный", () => {
    const project = buildProject(plaid);
    expect(project.levels.map((l) => l.cut.kind)).toEqual(["rip", "crosscut"]);
    expect(project.levels[1]!.source.from).toBe("previous");
    expect(project.boardWMm).toBe(80);
    expect(project.boardLMm).toBe(100);
  });

  it("«корзинка» отличается от «поворота» рисунком, но не габаритами", () => {
    // Полосы берутся шире одной ламели: на полосе, целиком попавшей в одну
    // породу, поворот по и против часовой неразличим — прямоугольник одного
    // цвета симметричен. Различие живёт на полосах, поймавших шов.
    const wide: Recipe = {
      ...plaid,
      lamellas: [
        { speciesId: "oak", widthMm: 30 },
        { speciesId: "maple", widthMm: 30 },
        { speciesId: "walnut", widthMm: 30 },
        { speciesId: "padauk", widthMm: 30 },
      ],
      weaves: [{ stripWidthMm: 20, count: 5, kind: "rotate" }],
    };
    const basket: Recipe = {
      ...wide,
      weaves: [{ stripWidthMm: 20, count: 5, kind: "basket" }],
    };
    const a = simulate(buildProject(wide));
    const b = simulate(buildProject(basket));

    expect(b.wMm).toBe(a.wMm);
    expect(b.hMm).toBe(a.hMm);
    expect(JSON.stringify(b.cells)).not.toBe(JSON.stringify(a.cells));
  });
});

describe("три склейки — две переклейки подряд", () => {
  const deep: Recipe = {
    ...plaid,
    boardLMm: 120,
    weaves: [
      { stripWidthMm: 25, count: 4, kind: "rotate" },
      { stripWidthMm: 20, count: 3, kind: "basket" },
    ],
  };

  it("собирается и даёт доску, ширина которой следует из второй переклейки", () => {
    // Панель 80×25 → полосы 20 мм, три штуки → поворот → склейка 75×20.
    expect(boardWidth(deep)).toBe(75);
    expect(rowCount(deep)).toBe(6);

    const face = simulate(buildProject(deep));
    expect(face.wMm).toBe(75);
    expect(face.hMm).toBe(120);
  });

  it("рисунок дробится мельче, чем на двух склейках", () => {
    const two = simulate(buildProject(plaid));
    const three = simulate(buildProject(deep));
    const perArea = (f: { cells: unknown[]; wMm: number; hMm: number }) =>
      f.cells.length / (f.wMm * f.hMm);
    expect(perArea(three)).toBeGreaterThan(perArea(two));
  });
});

describe("узор поверх переклейки", () => {
  it("диагональ считает сдвиг по колонкам панели, а не по числу ламелей", () => {
    // После переклейки колонок больше, чем ламелей. Сдвиг «на одну ламель»
    // означал бы сдвиг на чужую величину — диагональ рассыпалась бы в лесенку.
    const diagonal: Recipe = { ...plaid, pattern: "diamond", boardLMm: 200 };
    const project = buildProject(diagonal);
    const columns = topRow(simulate(project)).length;

    expect(project.levels[1]!.transforms).toHaveLength(columns);
  });

  it("узор не теряет материала: ячейки покрывают доску целиком", () => {
    // Считается площадь, а не ячейки в ряду. После переклейки лицо двумерно:
    // в одной плашке несколько строк, ряды по `yMm` больше не совпадают с
    // рядами плашек. Сдвиг режет крайнюю колонку по месту склейки и добавляет
    // обрезку — ту самую полуплашку из #F-07, — но материала от этого не
    // становится ни больше, ни меньше.
    const diagonal: Recipe = { ...plaid, pattern: "diamond", boardLMm: 200 };
    const face = simulate(buildProject(diagonal));

    const covered = face.cells.reduce((sum, c) => sum + c.wMm * c.hMm, 0);
    expect(covered).toBeCloseTo(face.wMm * face.hMm, 6);
  });
});
