/**
 * Детерминированный ГСЧ от seed — mulberry32.
 *
 * `Math.random` здесь не годится принципиально (`CORE_PRINCIPLES.md §2.3`):
 * на детерминированности стоит шаринг ссылкой (`#D-03`), галерея вариантов
 * и воспроизведение чужой доски. Ссылка, открытая через неделю, обязана дать
 * ту же доску — значит генератор не имеет права зависеть ни от времени, ни от
 * порядка вызовов вне собственной последовательности.
 *
 * Своя функция, а не зависимость: тридцать строк против пакета в лок-файле,
 * который придётся объяснять на ревью конкурса.
 */

export interface Rng {
  /** Следующее число в [0, 1). */
  next(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  /** Элемент массива. Пустой массив — ошибка вызывающего, не молчаливый undefined. */
  pick<T>(items: readonly T[]): T;
  /** Событие с вероятностью p. */
  chance(p: number): boolean;
  /**
   * Элемент по весам: вес 3 против 1 — втрое чаще. Нужен палитре, где
   * экзотика должна попадаться редко, а не наравне с дубом.
   */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
}

export function makeRng(seed: number): Rng {
  // Приведение к uint32: seed приходит из URL и из поля ввода, там бывает
  // дробное и отрицательное. Без приведения два «одинаковых» seed дали бы
  // разные доски.
  let a = Math.trunc(seed) >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      const item = items[int(0, items.length - 1)];
      if (item === undefined) throw new Error("Выбор из пустого списка");
      return item;
    },
    chance: (p: number): boolean => next() < p,
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
      if (total <= 0) return this.pick(items);
      let point = next() * total;
      for (const item of items) {
        point -= Math.max(0, weight(item));
        if (point <= 0) return item;
      }
      return items[items.length - 1]!;
    },
  };
}
