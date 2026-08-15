import { describe, expect, it } from "vitest";
import { parseRecipe } from "./parse.ts";
import { DEFAULT_RECIPE } from "../core/recipe.ts";
import { evaluate } from "../core/warnings.ts";

/**
 * Разбор недоверенного входа: localStorage правится руками, файл проекта
 * приносят чужой. Проверяется не «поля на месте», а то, что после разбора
 * рецепт заведомо собирается — иначе кривой файл роняет экран, и человек
 * решит, что сломано приложение.
 */

const valid = JSON.parse(JSON.stringify(DEFAULT_RECIPE)) as Record<
  string,
  unknown
>;

describe("переклейки", () => {
  it("читает сохранённые переклейки", () => {
    const parsed = parseRecipe({
      ...valid,
      weaves: [{ stripWidthMm: 25, count: 4, kind: "basket" }],
    });
    expect(parsed?.weaves).toEqual([
      { stripWidthMm: 25, count: 4, kind: "basket" },
    ]);
  });

  it("проект без поля weaves — доска в один уровень, а не битый файл", () => {
    // Так выглядят все проекты, сохранённые до дня 3.
    const { weaves: _, ...withoutWeaves } = valid;
    expect(parseRecipe(withoutWeaves)?.weaves).toEqual([]);
  });

  it("отбрасывает переклейку с неизвестным видом реза", () => {
    const parsed = parseRecipe({
      ...valid,
      weaves: [{ stripWidthMm: 25, count: 4, kind: "чего-нибудь" }],
    });
    expect(parsed?.weaves).toEqual([]);
  });

  it("отбрасывает переклейку, которую нечем резать", () => {
    // Ноль полос — это отказ модели на ровном месте: `rip` бросит, и экран
    // уйдёт в ошибку ещё до того, как сработает `evaluate`.
    const parsed = parseRecipe({
      ...valid,
      weaves: [{ stripWidthMm: 25, count: 0, kind: "rotate" }],
    });
    expect(parsed?.weaves).toEqual([]);
  });

  it("отказывает файлу с тремя переклейками — глубже трёх уровней не бывает", () => {
    const parsed = parseRecipe({
      ...valid,
      weaves: Array.from({ length: 3 }, () => ({
        stripWidthMm: 25,
        count: 4,
        kind: "rotate",
      })),
    });
    expect(parsed).toBeNull();
  });
});

describe("разобранный рецепт собирается", () => {
  it("любой принятый вход даёт доску, а не отказ модели", () => {
    const inputs: unknown[] = [
      valid,
      { ...valid, weaves: [{ stripWidthMm: 900, count: 40, kind: "rotate" }] },
      { ...valid, weaves: [{ stripWidthMm: 1, count: 2, kind: "basket" }] },
      { ...valid, lamellaThicknessMm: 1, boardLMm: 2000 },
    ];

    for (const [i, input] of inputs.entries()) {
      const parsed = parseRecipe(input);
      if (!parsed) continue;
      expect(evaluate(parsed).error, `вход ${i}`).toBeNull();
    }
  });
});
