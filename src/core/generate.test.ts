import { describe, expect, it } from "vitest";
import { generateGallery, generateRecipe } from "./generate.ts";
import { DEFAULT_RECIPE } from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { speciesById } from "./species.ts";
import { evaluate } from "./warnings.ts";

/**
 * Грамматика проверяется по двум обещаниям (`CHECKPOINT_CURRENT.md §8`):
 * один seed — один рецепт, и генератор не выдаёт того, что не собирается или
 * собирается с предупреждением уровня alarm. Красоту тесты не проверяют —
 * её смотрят глазами на прогоне seed'ов, и это отдельный пункт дня.
 */

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

const paletteOf = (r: Recipe): string[] => [
  ...new Set(r.lamellas.map((l) => l.speciesId)),
];

describe("детерминированность", () => {
  it("один seed — один рецепт", () => {
    expect(JSON.stringify(generateRecipe(42))).toBe(
      JSON.stringify(generateRecipe(42)),
    );
  });

  it("рецепт не зависит от того, сколько раз до него генерировали", () => {
    // Общего состояния между вызовами быть не должно: галерея генерирует
    // двенадцать досок подряд, и тринадцатая обязана совпасть с одиночной.
    generateGallery(1, DEFAULT_RECIPE);
    expect(JSON.stringify(generateRecipe(7))).toBe(
      JSON.stringify(generateRecipe(7)),
    );
  });

  it("разные seed дают разные доски", () => {
    const distinct = new Set(
      SEEDS.map((s) => JSON.stringify(generateRecipe(s).lamellas)),
    );
    // Совпадения допустимы — грамматика конечна, — но не массовые.
    expect(distinct.size).toBeGreaterThan(SEEDS.length * 0.9);
  });
});

describe("генератор не выдаёт неизготавливаемое", () => {
  it("ни один seed не даёт отказа модели", () => {
    const broken = SEEDS.filter((s) => evaluate(generateRecipe(s)).error);
    expect(broken).toEqual([]);
  });

  it("ни один seed не даёт предупреждения уровня alarm", () => {
    const alarming = SEEDS.filter((s) =>
      evaluate(generateRecipe(s)).warnings.some((w) => w.severity === "alarm"),
    );
    expect(alarming).toEqual([]);
  });

  it("держится и на нестандартной доске столяра", () => {
    // Маленькая доска с короткой заготовкой — там ограничения жмут сильнее
    // всего, и именно там генератор обязан отступить, а не выдать alarm.
    const small: Recipe = {
      ...DEFAULT_RECIPE,
      boardLMm: 200,
      boardHMm: 25,
      blankLengthMm: 400,
      kerfMm: 2.4,
    };
    for (const seed of SEEDS.slice(0, 40)) {
      const { error, warnings } = evaluate(generateRecipe(seed, small));
      expect(error, `seed ${seed}`).toBeNull();
      expect(
        warnings.filter((w) => w.severity === "alarm"),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });
});

describe("правила грамматики", () => {
  it("соседние ламели различаются тоном", () => {
    // Иначе доска читается одним пятном: породы из #F-09 тёплые и близкие.
    const lightness = (hex: string): number => {
      const v = hex.replace("#", "");
      return (
        (0.2126 * parseInt(v.slice(0, 2), 16) +
          0.7152 * parseInt(v.slice(2, 4), 16) +
          0.0722 * parseInt(v.slice(4, 6), 16)) /
        255
      );
    };

    for (const seed of SEEDS) {
      const { lamellas } = generateRecipe(seed);
      for (let i = 1; i < lamellas.length; i++) {
        const a = lightness(speciesById(lamellas[i - 1]!.speciesId).color);
        const b = lightness(speciesById(lamellas[i]!.speciesId).color);
        expect(
          Math.abs(a - b),
          `seed ${seed}, ламели ${i} и ${i + 1}`,
        ).toBeGreaterThanOrEqual(0.2);
      }
    }
  });

  it("в палитре не больше одной экзотики", () => {
    // Две дорогие породы разом делают смету неприличной — доска обойдётся
    // дороже, чем столяр её продаст.
    for (const seed of SEEDS) {
      const exotic = paletteOf(generateRecipe(seed)).filter(
        (id) => speciesById(id).priceM3 > 250_000,
      );
      expect(exotic.length, `seed ${seed}: ${exotic.join(", ")}`).toBeLessThan(
        2,
      );
    }
  });

  it("ламели не тоньше того, что держится в струбцинах", () => {
    for (const seed of SEEDS) {
      const thinnest = Math.min(
        ...generateRecipe(seed).lamellas.map((l) => l.widthMm),
      );
      expect(thinnest, `seed ${seed}`).toBeGreaterThanOrEqual(14);
    }
  });

  it("переклеек не больше двух — глубина 1–3 уровня", () => {
    for (const seed of SEEDS) {
      expect((generateRecipe(seed).weaves ?? []).length).toBeLessThanOrEqual(2);
    }
  });
});

describe("генератор крутит узор, а не доску столяра", () => {
  it("сохраняет размеры, пропил и заготовку из базового рецепта", () => {
    const base: Recipe = {
      ...DEFAULT_RECIPE,
      boardLMm: 333,
      boardHMm: 44,
      blankLengthMm: 1234,
      kerfMm: 2.4,
      units: "in",
    };
    const made = generateRecipe(5, base);

    expect(made.boardLMm).toBe(base.boardLMm);
    expect(made.boardHMm).toBe(base.boardHMm);
    expect(made.blankLengthMm).toBe(base.blankLengthMm);
    expect(made.kerfMm).toBe(base.kerfMm);
    expect(made.units).toBe(base.units);
  });

  it("проставляет в рецепт тот seed, по которому он собран", () => {
    // На этом стоит шаринг: seed в штампе чертежа должен открывать ту же доску.
    expect(generateRecipe(99).seed).toBe(99);
  });
});

describe("галерея", () => {
  it("даёт двенадцать вариантов, и они различаются", () => {
    const gallery = generateGallery(1, DEFAULT_RECIPE);
    expect(gallery).toHaveLength(12);
    const distinct = new Set(gallery.map((r) => JSON.stringify(r.lamellas)));
    expect(distinct.size).toBeGreaterThan(9);
  });

  it("каждый вариант открывается как рецепт: seed различает их", () => {
    const gallery = generateGallery(100, DEFAULT_RECIPE);
    expect(gallery.map((r) => r.seed)).toEqual(
      Array.from({ length: 12 }, (_, i) => 100 + i),
    );
  });
});
