import { describe, expect, it } from "vitest";
import { decodeRecipe, encodeRecipe } from "./share.ts";
import { DEFAULT_RECIPE } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { evaluate } from "../core/warnings.ts";

/**
 * Ссылка — обещание из `GOAL.md` (acceptance №5): друг открывает и видит ту же
 * доску. Проверяется не «функция кодирует», а то, что круг замыкается и что
 * подпорченная ссылка не роняет экран.
 */

const withWeaves: Recipe = {
  ...DEFAULT_RECIPE,
  pattern: "brick",
  units: "in",
  seed: 4096,
  weaves: [{ stripWidthMm: 28, count: 6, kind: "basket" }],
};

describe("круг замыкается", () => {
  it("рецепт возвращается из ссылки без потерь", () => {
    const back = decodeRecipe(encodeRecipe(withWeaves));
    expect(back).toEqual(withWeaves);
  });

  it("доска из ссылки собирается", () => {
    const back = decodeRecipe(encodeRecipe(withWeaves));
    expect(back).not.toBeNull();
    expect(evaluate(back!).error).toBeNull();
  });

  it("ссылка не содержит символов, которые ломаются в адресной строке", () => {
    // Обычный base64 даёт `+`, `/` и `=` — в хеше они уезжают в проценты и
    // ссылка перестаёт открываться после копирования из мессенджера.
    expect(encodeRecipe(withWeaves)).toMatch(/^#d=[A-Za-z0-9\-_]+$/);
  });
});

describe("недоверенный вход", () => {
  it("чужой хеш не принимается", () => {
    expect(decodeRecipe("#что-то-другое")).toBeNull();
    expect(decodeRecipe("")).toBeNull();
  });

  it("испорченная ссылка возвращает null, а не падает", () => {
    const broken = encodeRecipe(withWeaves).slice(0, -5) + "zzzz";
    expect(() => decodeRecipe(broken)).not.toThrow();
  });

  it("подделанные поля отсекаются проверкой рецепта", () => {
    // Хеш правится руками в адресной строке — это тот же недоверенный вход,
    // что и файл проекта.
    const evil = "#d=" + btoa(JSON.stringify({ lamellas: "not-an-array" }));
    expect(decodeRecipe(evil)).toBeNull();

    // И порода, которой нет в палитре, не проезжает в рецепт.
    const unknownSpecies =
      "#d=" +
      btoa(
        JSON.stringify({
          ...DEFAULT_RECIPE,
          lamellas: [{ speciesId: "unobtainium", widthMm: 40 }],
        }),
      );
    expect(decodeRecipe(unknownSpecies)).toBeNull();
  });
});
