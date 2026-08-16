import { describe, expect, it } from "vitest";
import { crossbreed, mutate, mutateMany } from "./evolve.ts";
import { generateRecipe } from "./generate.ts";
import { DEFAULT_RECIPE } from "./recipe.ts";
import type { Recipe } from "./recipe.ts";
import { evaluate } from "./warnings.ts";

/**
 * Эволюция проверяется по двум обещаниям: потомок остаётся изготавливаемым и
 * остаётся узнаваемым. Первое — жёсткое: доску, которую модель отвергает,
 * показывать нельзя, каким бы способом она ни получилась. Второе — смысл
 * самой операции: неузнаваемый потомок это просто ещё один случайный узор,
 * а для него уже есть кнопка «сгенерировать».
 */

const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const parent = generateRecipe(7);
const other = generateRecipe(31);

const palette = (r: Recipe) => [...new Set(r.lamellas.map((l) => l.speciesId))];

describe("мутация", () => {
  it("детерминирована: тот же родитель и seed — тот же потомок", () => {
    expect(JSON.stringify(mutate(parent, 5))).toBe(
      JSON.stringify(mutate(parent, 5)),
    );
  });

  it("ни один потомок не выходит за границы грамматики", () => {
    // То же требование, что к генератору (#D-16): ни отказа модели, ни alarm.
    for (const seed of SEEDS) {
      const child = mutate(parent, seed);
      const { error, warnings } = evaluate(child);
      expect(error, `seed ${seed}`).toBeNull();
      expect(
        warnings.filter((w) => w.severity === "alarm"),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });

  it("держится и на доске, собранной руками, а не генератором", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect(evaluate(mutate(DEFAULT_RECIPE, seed)).error).toBeNull();
    }
  });

  it("потомок остаётся родственником, а не новой доской", () => {
    // Узнаваемость меряется по общему: число ламелей, размеры доски и хотя бы
    // часть палитры сохраняются. Меняется один признак, а не все сразу.
    for (const seed of SEEDS) {
      const child = mutate(parent, seed);
      expect(child.lamellas.length, `seed ${seed}`).toBe(
        parent.lamellas.length,
      );
      expect(child.boardLMm).toBe(parent.boardLMm);

      const shared = palette(child).filter((id) =>
        palette(parent).includes(id),
      );
      expect(
        shared.length,
        `seed ${seed}: палитра разошлась целиком`,
      ).toBeGreaterThan(0);
    }
  });

  it("но и не копия родителя", () => {
    const family = mutateMany(parent, 100);
    const different = family.filter(
      (child) =>
        JSON.stringify({ ...child, seed: 0 }) !==
        JSON.stringify({ ...parent, seed: 0 }),
    );
    // Часть мутаций может не найти, что менять (например, переклеек нет), —
    // но большинство обязано что-то изменить.
    expect(different.length).toBeGreaterThan(family.length / 2);
  });

  it("двенадцать родственников различаются между собой", () => {
    const family = mutateMany(parent, 200);
    const distinct = new Set(family.map((r) => JSON.stringify(r.lamellas)));
    expect(distinct.size).toBeGreaterThan(2);
  });
});

describe("скрещивание", () => {
  it("потомок изготавливаем при любых родителях", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const a = generateRecipe(seed);
      const b = generateRecipe(seed + 500);
      const { error, warnings } = evaluate(crossbreed(a, b, seed));
      expect(error, `seed ${seed}`).toBeNull();
      expect(warnings.filter((w) => w.severity === "alarm")).toEqual([]);
    }
  });

  it("берёт породы у одного родителя, раскладку у другого", () => {
    // Роли могут меняться местами: если первое сочетание признаков не
    // собирается, функция пробует обратное. Обещание не в том, кто из двоих
    // отдал ритм, а в том, что потомок целиком набран из родительских
    // признаков и ничего не выдумывает от себя.
    for (const seed of SEEDS.slice(0, 20)) {
      const child = crossbreed(parent, other, seed);

      const rhythms = [parent, other].map((p) =>
        JSON.stringify(p.lamellas.map((l) => l.widthMm)),
      );
      expect(rhythms, `seed ${seed}: ритм не от родителей`).toContain(
        JSON.stringify(child.lamellas.map((l) => l.widthMm)),
      );

      const parentSpecies = new Set([...palette(parent), ...palette(other)]);
      for (const id of palette(child)) {
        expect(parentSpecies, `seed ${seed}: чужая порода ${id}`).toContain(id);
      }

      expect([parent.pattern, other.pattern]).toContain(child.pattern);
    }
  });

  it("детерминировано", () => {
    expect(JSON.stringify(crossbreed(parent, other, 9))).toBe(
      JSON.stringify(crossbreed(parent, other, 9)),
    );
  });
});
