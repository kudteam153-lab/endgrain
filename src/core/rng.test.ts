import { describe, expect, it } from "vitest";
import { makeRng } from "./rng.ts";

/**
 * ГСЧ проверяется не на «случайность» — на воспроизводимость. Одна ссылка это
 * одна доска (`#D-03`), поэтому свойство, которое обязано держаться, звучит
 * так: тот же seed сегодня и через неделю даёт ту же последовательность.
 */

const take = (seed: number, n: number): number[] => {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("детерминированность", () => {
  it("один seed — одна последовательность", () => {
    expect(take(42, 20)).toEqual(take(42, 20));
  });

  it("разные seed — разные последовательности", () => {
    expect(take(1, 10)).not.toEqual(take(2, 10));
  });

  it("дробный и отрицательный seed приводятся к целому uint32", () => {
    // Seed приходит из URL-хеша и из поля ввода: «3.7» и «3» обязаны дать одну
    // доску, иначе ссылка на неё зависит от того, как её напечатали.
    expect(take(3.7, 5)).toEqual(take(3, 5));
    expect(take(-1, 5)).toEqual(take(4294967295, 5));
  });

  it("последовательность не меняется от версии к версии", () => {
    // Золотой образец. Проверяет не формулу, а её неизменность: правка
    // констант mulberry32 «на глаз» обесценит все уже разосланные ссылки, и
    // без этого теста такая правка прошла бы молча.
    expect(take(1, 6)).toMatchSnapshot();
  });
});

describe("границы", () => {
  it("next остаётся в [0, 1)", () => {
    const values = take(7, 1000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("int включает обе границы и не выходит за них", () => {
    const rng = makeRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("int(n, n) отдаёт n, а не падает на нулевом диапазоне", () => {
    const rng = makeRng(11);
    expect(rng.int(4, 4)).toBe(4);
  });

  it("pick на пустом списке отказывает, а не отдаёт undefined", () => {
    expect(() => makeRng(1).pick([])).toThrow(/пустого списка/);
  });
});

describe("weighted", () => {
  it("нулевой вес не выпадает никогда", () => {
    // Свойство палитры: породу, помеченную «не брать», нельзя получить
    // случайно — иначе в узоре появится дерево, которого столяр не покупал.
    const rng = makeRng(13);
    const items = [
      { id: "a", w: 1 },
      { id: "b", w: 0 },
      { id: "c", w: 1 },
    ];
    const seen = new Set(
      Array.from({ length: 500 }, () => rng.weighted(items, (i) => i.w).id),
    );
    expect(seen.has("b")).toBe(false);
    expect(seen.has("a") && seen.has("c")).toBe(true);
  });

  it("тяжёлый элемент выпадает заметно чаще лёгкого", () => {
    const rng = makeRng(17);
    const items = [
      { id: "heavy", w: 9 },
      { id: "light", w: 1 },
    ];
    let heavy = 0;
    for (let i = 0; i < 1000; i++) {
      if (rng.weighted(items, (x) => x.w).id === "heavy") heavy++;
    }
    // Ожидание 900 из 1000. Границы широкие намеренно: тест ловит
    // перепутанные веса, а не отклонение выборки.
    expect(heavy).toBeGreaterThan(820);
    expect(heavy).toBeLessThan(960);
  });
});
