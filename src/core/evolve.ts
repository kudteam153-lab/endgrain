import { PATTERNS } from "./recipe.ts";
import type { Lamella, Recipe } from "./recipe.ts";
import { makeRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { SPECIES } from "./species.ts";
import { evaluate } from "./warnings.ts";

/**
 * Эволюция узоров (`#D-04`): «ещё похожих» и скрещивание двух досок.
 *
 * Мутируется рецепт, а не выход генератора. Грамматика ужесточалась весь
 * день 3 (`#D-16`), и потомок обязан оставаться внутри её границ: доска,
 * которую модель отвергает или которая даёт предупреждение alarm, не
 * показывается никогда — даже если она «просто мутация».
 *
 * Отсюда общее правило файла: любая операция возвращает рецепт, прошедший ту
 * же проверку, что и свежесгенерированный. Не прошёл — берём следующий
 * вариант, а в самом конце возвращаем родителя. Родитель заведомо валиден.
 */

/** Сколько попыток на потомка, прежде чем вернуть родителя без изменений. */
const ATTEMPTS = 8;

const isSound = (recipe: Recipe): boolean => {
  const { error, warnings } = evaluate(recipe);
  return !error && !warnings.some((w) => w.severity === "alarm");
};

/**
 * Потомок одной доски: та же композиция, сдвинутая в одном-двух местах.
 *
 * Смысл в узнаваемости. Если менять всё сразу, получится новая случайная
 * доска — а её даёт кнопка «сгенерировать», и вторая такая же кнопка не
 * нужна.
 */
export function mutate(recipe: Recipe, seed: number): Recipe {
  const rng = makeRng(seed);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const child = { ...applyMutation(rng, recipe), seed };
    if (isSound(child)) return child;
  }

  return { ...recipe, seed };
}

/** Двенадцать родственников — тем же приёмом, что галерея вариантов. */
export function mutateMany(
  recipe: Recipe,
  startSeed: number,
  count = 12,
): Recipe[] {
  return Array.from({ length: count }, (_, i) => mutate(recipe, startSeed + i));
}

function applyMutation(rng: Rng, recipe: Recipe): Recipe {
  const kind = rng.weighted(
    ["palette", "widths", "pattern", "depth", "weave", "thickness"] as const,
    // Веса выставлены по итогам просмотра родни (#D-20): заметное выпадает
    // чаще. «Ещё похожих» показывают, чтобы выбрать из шести, а не чтобы
    // искать, чем они отличаются.
    (m) =>
      m === "palette" || m === "pattern" || m === "depth"
        ? 3
        : m === "widths"
          ? 2
          : 1,
  );

  switch (kind) {
    case "palette":
      return { ...recipe, lamellas: swapSpecies(rng, recipe.lamellas) };

    case "widths":
      return { ...recipe, lamellas: nudgeWidths(rng, recipe.lamellas) };

    case "pattern": {
      const others = PATTERNS.filter((p) => p.id !== recipe.pattern);
      return { ...recipe, pattern: rng.pick(others).id };
    }

    case "weave": {
      const weaves = recipe.weaves ?? [];
      if (weaves.length === 0) return recipe;
      const index = rng.int(0, weaves.length - 1);
      return {
        ...recipe,
        weaves: weaves.map((w, i) =>
          i === index
            ? {
                ...w,
                kind: w.kind === "rotate" ? "basket" : "rotate",
                count: Math.max(3, w.count + rng.pick([-1, 1])),
              }
            : w,
        ),
      };
    }

    case "depth": {
      // Самая заметная мутация: доска либо получает переклейку, либо теряет
      // её. Полосатый родитель без неё давал шесть почти одинаковых потомков
      // — сдвиг ширин на пять миллиметров глазом не читается.
      const weaves = recipe.weaves ?? [];
      if (weaves.length > 0) {
        return { ...recipe, weaves: weaves.slice(0, weaves.length - 1) };
      }
      const span = recipe.lamellas.reduce((s, l) => s + l.widthMm, 0);
      const count = rng.int(4, 7);
      const strip = Math.round(span / count - recipe.kerfMm);
      if (strip < 25) return recipe;
      return {
        ...recipe,
        weaves: [
          {
            stripWidthMm: strip,
            count,
            kind: rng.pick(["rotate", "basket"]),
          },
        ],
      };
    }

    case "thickness":
      return {
        ...recipe,
        lamellaThicknessMm: Math.max(
          20,
          recipe.lamellaThicknessMm + rng.pick([-5, 5]),
        ),
      };
  }
}

/**
 * Замена одной породы на другую по всей доске. Меняется роль целиком, а не
 * отдельная ламель: точечная замена ломает ритм чередования, ради которого
 * грамматика и расставляла породы по контрасту.
 */
function swapSpecies(rng: Rng, lamellas: Lamella[]): Lamella[] {
  const used = [...new Set(lamellas.map((l) => l.speciesId))];
  const from = rng.pick(used);
  const donor = SPECIES.find((s) => s.id === from);
  if (!donor) return lamellas;

  // Новая порода — из того же тонального класса, иначе контраст соседей,
  // выстроенный грамматикой, рассыпается.
  const kin = SPECIES.filter(
    (s) => !used.includes(s.id) && sameTone(s.color, donor.color),
  );
  if (kin.length === 0) return lamellas;

  const to = rng.pick(kin).id;
  return lamellas.map((l) =>
    l.speciesId === from ? { ...l, speciesId: to } : l,
  );
}

/**
 * Ритм ширин перестраивается, а не сдвигается целиком.
 *
 * Сдвиг всех ламелей на один шаг менял числа, но не картинку: на просмотре
 * родни (#D-20) такие потомки выглядели копиями родителя. Здесь ритм
 * переворачивается, выравнивается или сжимается — то, что видно.
 */
function nudgeWidths(rng: Rng, lamellas: Lamella[]): Lamella[] {
  const clamp = (v: number) => Math.max(14, Math.min(60, Math.round(v)));

  switch (rng.pick(["reverse", "even", "contrast"] as const)) {
    case "reverse":
      return lamellas.map((l, i) => ({
        ...l,
        widthMm: lamellas[lamellas.length - 1 - i]?.widthMm ?? l.widthMm,
      }));

    case "even": {
      const average =
        lamellas.reduce((s, l) => s + l.widthMm, 0) / lamellas.length;
      return lamellas.map((l) => ({ ...l, widthMm: clamp(average) }));
    }

    case "contrast": {
      // Узкие ещё уже, широкие ещё шире: ритм читается сильнее.
      const average =
        lamellas.reduce((s, l) => s + l.widthMm, 0) / lamellas.length;
      return lamellas.map((l) => ({
        ...l,
        widthMm: clamp(average + (l.widthMm - average) * 1.8),
      }));
    }
  }
}

const lightness = (hex: string): number => {
  const v = hex.replace("#", "");
  return (
    (0.2126 * parseInt(v.slice(0, 2), 16) +
      0.7152 * parseInt(v.slice(2, 4), 16) +
      0.0722 * parseInt(v.slice(4, 6), 16)) /
    255
  );
};

const sameTone = (a: string, b: string): boolean =>
  Math.abs(lightness(a) - lightness(b)) < 0.18;

/**
 * Скрещивание: палитра от одной доски, ритм и узор от другой.
 *
 * Не усреднение — усреднённая доска не похожа ни на одного родителя и обычно
 * хуже обоих. Наследуются целые признаки, как их и выбирал человек: «вот эти
 * породы» и «вот такая раскладка».
 */
export function crossbreed(a: Recipe, b: Recipe, seed: number): Recipe {
  const rng = makeRng(seed);

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const palette = [...new Set(a.lamellas.map((l) => l.speciesId))];

    // Ритм берём у второго родителя, породы — у первого, по кругу.
    const lamellas = b.lamellas.map((l, i) => ({
      speciesId: palette[i % palette.length] ?? l.speciesId,
      widthMm: l.widthMm,
    }));

    const child: Recipe = {
      ...b,
      lamellas,
      pattern: rng.chance(0.5) ? a.pattern : b.pattern,
      ...(rng.chance(0.5) ? { weaves: a.weaves ?? [] } : {}),
      seed,
    };

    if (isSound(child)) return child;

    // Не сошлось — пробуем с другим распределением признаков.
    const swapped = { ...crossOnce(rng, b, a), seed };
    if (isSound(swapped)) return swapped;
  }

  // Оба родителя валидны по построению, поэтому в худшем случае отдаём
  // одного из них с новым seed — но не сломанного потомка.
  return { ...a, seed };
}

function crossOnce(rng: Rng, a: Recipe, b: Recipe): Recipe {
  const palette = [...new Set(a.lamellas.map((l) => l.speciesId))];
  return {
    ...b,
    lamellas: b.lamellas.map((l, i) => ({
      speciesId: palette[i % palette.length] ?? l.speciesId,
      widthMm: l.widthMm,
    })),
    pattern: rng.chance(0.5) ? a.pattern : b.pattern,
  };
}
