import { DEFAULT_RECIPE, sliceWidth } from "./recipe.ts";
import type { Lamella, PatternId, Recipe, Weave } from "./recipe.ts";
import { makeRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { SPECIES } from "./species.ts";
import type { Species } from "./types.ts";
import { evaluate } from "./warnings.ts";

/**
 * Грамматика узора: seed → рецепт (`PLAN.md §День 3`, ставка `#D-02`).
 *
 * Главный риск дня записан заранее и он не технический: случайные ламели дают
 * либо кашу, либо восемь одинаковых досок. Поэтому здесь не «рандом в
 * допустимых границах», а набор правил, каждое из которых сужает выбор:
 * контраст соседей, ритм ширин, одна экзотика на палитру, узор под глубину
 * переклейки. Разнообразие берётся из числа сочетаний правил, а не из ширины
 * диапазонов — расширять диапазоны значит получать грязь быстрее.
 *
 * Размеры доски, толщина, пропил и заготовка не генерируются: их задал
 * столяр, и «сгенерировать» их значит переспорить человека в том, какую доску
 * он делает (acceptance №2 в `GOAL.md`).
 */

/**
 * Дороже этого порога — экзотика: дорого и не всегда есть в наличии (#F-09).
 * Порог отделяет падук, амарант и зебрано от ореха и сапеле. Ниже него тёмная
 * порода в палитре оставалась одна — орех, — и он попадал в каждую вторую
 * доску просто потому, что заменить его было нечем.
 */
const EXOTIC_PRICE_M3 = 250_000;

/** Ниже — доска читается как одно пятно: соседи обязаны различаться тоном. */
const MIN_NEIGHBOUR_CONTRAST = 0.2;

/** Тоньше ламель не держится в струбцинах ровно (см. `warnings.ts`). */
const MIN_LAMELLA_WIDTH_MM = 14;

/**
 * Ширина доски, к которой сводится любая раскладка.
 *
 * Границы не эстетические: уже 180 мм — это уже не разделочная доска, шире
 * 420 мм не влезает между струбцинами домашней мастерской и не помещается в
 * мойку. Без них ширина гуляла от 76 до 520 мм — генератор честно исполнял
 * грамматику и выдавал вещи, которые никто не станет делать.
 */
const BOARD_WIDTH_MM = { min: 200, max: 420 } as const;

/**
 * Полоса переклейки не тоньше этого — иначе ряд готовой доски выходит мелким,
 * а весь узор превращается в однородную текстуру. На просмотре двухсот
 * seed'ов (#D-16) такие доски внутри своей категории были неразличимы: десять
 * вариантов «плетёного коврика» в разных тонах.
 */
const MIN_STRIP_MM = 25;

/** Полос больше — колонки мельче. Крупная клетка читается, мелкая рябит. */
const MAX_STRIPS = 7;

/**
 * Светлота породы из её цвета. Считается по коэффициентам восприятия: глаз
 * различает породы по светлоте, а не по расстоянию между кодами цвета, и
 * «дуб рядом с падуком» на глаз контрастнее, чем в RGB.
 */
function lightness(hex: string): number {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const isExotic = (s: Species): boolean => s.priceM3 > EXOTIC_PRICE_M3;

const LIGHT = SPECIES.filter((s) => lightness(s.color) >= 0.6);
const DARK = SPECIES.filter((s) => lightness(s.color) <= 0.35);
const MID = SPECIES.filter((s) => {
  const l = lightness(s.color);
  return l > 0.35 && l < 0.6;
});

/**
 * Палитра: светлая и тёмная обязательны, средняя и вторая тёмная — по случаю.
 *
 * Экзотика допускается одна на палитру. Две превращают смету в неприличную:
 * доска из амаранта с зебрано стоит дороже, чем столяр её продаст, и такой
 * узор бесполезен, каким бы красивым ни вышел.
 */
function buildPalette(rng: Rng, size: number): Species[] {
  const exoticBudget = { left: 1 };
  const affordable = (pool: readonly Species[]): Species[] =>
    exoticBudget.left > 0 ? [...pool] : pool.filter((s) => !isExotic(s));

  const take = (pool: readonly Species[]): Species => {
    // Экзотика реже обычного дерева даже в пределах бюджета: иначе каждая
    // вторая доска выходит «дизайнерской», и обычный дуб исчезает.
    const chosen = rng.weighted(affordable(pool), (s) => (isExotic(s) ? 1 : 3));
    if (isExotic(chosen)) exoticBudget.left -= 1;
    return chosen;
  };

  const palette = [take(LIGHT), take(DARK)];
  if (size >= 3) palette.push(take(rng.chance(0.6) ? MID : LIGHT));
  if (size >= 4) palette.push(take(rng.chance(0.5) ? DARK : MID));

  return palette;
}

const contrast = (a: Species, b: Species): number =>
  Math.abs(lightness(a.color) - lightness(b.color));

/**
 * Ритм ширин. Три способа разложить ламели, все столярные:
 * ровный шаг, чередование двух ширин и симметрия от центра.
 *
 * Число ламелей выводится из целевой ширины, а не выбирается отдельно: иначе
 * «двенадцать ламелей по 45» и «пять по 20» одинаково проходят грамматику, а
 * это доски 540 и 100 мм — ни ту, ни другую делать не станут.
 */
function buildWidths(rng: Rng, targetSpanMm: number): number[] {
  const base = rng.pick([20, 25, 30, 35, 40, 45]);
  const count = Math.min(14, Math.max(5, Math.round(targetSpanMm / base)));
  const rhythm = rng.weighted(
    ["even", "alternating", "symmetric"] as const,
    (r) => (r === "even" ? 2 : 1),
  );

  if (rhythm === "even") return Array.from({ length: count }, () => base);

  const narrow = Math.max(MIN_LAMELLA_WIDTH_MM, Math.round(base * 0.55));

  if (rhythm === "alternating") {
    return Array.from({ length: count }, (_, i) => (i % 2 ? narrow : base));
  }

  // Симметрия: широкие в центре, узкие к краям. Доска читается как изделие,
  // а не как случайно нарезанный набор.
  const half = Math.ceil(count / 2);
  const step = (base - narrow) / Math.max(1, half - 1);
  const grow = Array.from({ length: half }, (_, i) =>
    Math.round(narrow + step * i),
  );
  const mirrored = [...grow, ...[...grow].reverse()].slice(0, count);
  return mirrored;
}

/**
 * Раскладка пород по ламелям. Соседи обязаны различаться тоном — это то
 * правило, без которого палитра из четырёх тёплых пород даёт грязь.
 */
function buildLamellas(
  rng: Rng,
  palette: Species[],
  widths: number[],
): Lamella[] {
  const out: Lamella[] = [];
  let previous: Species | null = null;

  for (const widthMm of widths) {
    const fits = palette.filter(
      (s) => !previous || contrast(s, previous) >= MIN_NEIGHBOUR_CONTRAST,
    );
    // Список пуст только на палитре без контраста — тогда берём любую, а
    // предупреждение о неразличимом узоре покажет `warnings.ts`.
    const species = rng.pick(fits.length > 0 ? fits : palette);
    out.push({ speciesId: species.id, widthMm });
    previous = species;
  }

  return out;
}

/**
 * Переклейки. Ширина полосы считается от ширины панели, а не берётся из
 * диапазона: полоса шире панели даёт ноль полос, и такой рецепт отвергается
 * моделью — генератор обязан выдавать собираемое, а не «часто собираемое».
 */
function buildWeaves(
  rng: Rng,
  depth: number,
  spanMm: number,
  thicknessMm: number,
  kerfMm: number,
  minRowMm: number,
): Weave[] {
  const weaves: Weave[] = [];

  // Панель первой склейки: ширина — сумма ламелей, высота — их толщина.
  let panelW = spanMm;
  let panelH = thicknessMm;

  for (let i = 0; i < depth; i++) {
    // Полос столько, чтобы новая панель попала в ширину доски: её набирают
    // высоты полос, поставленных на ребро.
    const lo = Math.max(3, Math.ceil(BOARD_WIDTH_MM.min / panelH));
    const hi = Math.min(MAX_STRIPS, Math.floor(BOARD_WIDTH_MM.max / panelH));
    if (hi < lo) break;
    const count = rng.int(lo, hi);

    // Полосы режутся из ширины панели, и каждая уносит пропил. Снизу полосу
    // держат два ограничения разом: заготовка (полоса станет высотой ряда, и
    // рядов должно хватить) и глаз (тонкая полоса даёт рябь вместо узора).
    const minStrip = Math.max(MIN_STRIP_MM, minRowMm);
    const maxStrip = panelW / count - kerfMm;
    if (maxStrip < minStrip) break;

    const stripWidthMm = Math.round(
      minStrip + (maxStrip - minStrip) * rng.pick([1, 0.85]),
    );
    weaves.push({ stripWidthMm, count, kind: rng.pick(["rotate", "basket"]) });

    panelW = count * panelH;
    panelH = stripWidthMm;
  }

  return weaves;
}

/**
 * Высота ряда, ниже которой заготовки перестаёт хватать.
 *
 * Рядов на доску нужно `длина ÷ высота ряда`, каждый ряд съедает плашку с
 * пропилом (#F-03). Считать это до генерации, а не отбраковывать готовое
 * потом, — разница между «переклейка бывает» и «переклейка бывает редко и
 * непонятно почему»: на дефолтной заготовке отваливались две трети вариантов.
 */
function minRowHeight(base: Recipe): number {
  const perRow = sliceWidth(base) + base.kerfMm;
  return (base.boardLMm * perRow) / base.blankLengthMm;
}

/**
 * Узор поверх переклейки. После двух резов рисунок уже двумерный, и
 * нарастающий сдвиг превращает его в кашу — там уместнее спокойный ряд.
 */
function pickPattern(rng: Rng, weaveDepth: number): PatternId {
  // `stripe` поверх переклейки вычеркнут после просмотра двухсот seed'ов
  // (#D-16): ряды не смещаются, колонки панели после реза узкие, и доска
  // выходит штрих-кодом. Это была худшая категория выборки — каждый седьмой
  // вариант.
  if (weaveDepth >= 2) return rng.pick(["checker", "mirror"]);
  if (weaveDepth === 1) return rng.pick(["checker", "brick", "mirror"]);
  return rng.weighted(
    ["diamond", "checker", "brick", "mirror", "stripe"] as const,
    (p) => (p === "diamond" ? 4 : p === "stripe" ? 1 : 3),
  );
}

/** Один черновик грамматики. `tighten` сужает выбор на повторных попытках. */
function draft(rng: Rng, base: Recipe, tighten: number): Recipe {
  const minRow = minRowHeight(base);

  const palette = buildPalette(rng, rng.int(2, tighten > 0 ? 3 : 4));
  const widths = buildWidths(
    rng,
    rng.int(BOARD_WIDTH_MM.min, BOARD_WIDTH_MM.max),
  );
  const lamellas = buildLamellas(rng, palette, widths);
  const span = widths.reduce((s, w) => s + w, 0);

  // Толщина ламели — высота ряда, пока переклеек нет. Тонкая при длинной
  // доске означает больше плашек, чем даст заготовка.
  // 25 мм убрано после просмотра (#D-16): при такой толщине клетка мельчает и
  // узор читается фактурой, а не рисунком.
  const thicknessChoices = [30, 35, 40].filter((t) => t >= minRow);
  const lamellaThicknessMm =
    thicknessChoices.length > 0
      ? rng.pick(thicknessChoices)
      : Math.ceil(minRow / 5) * 5;

  const depth =
    tighten > 1
      ? 0
      : Math.min(
          2 - tighten,
          rng.weighted([0, 1, 2] as const, (d) =>
            d === 0 ? 3 : d === 1 ? 5 : 3,
          ),
        );

  const weaves = buildWeaves(
    rng,
    depth,
    span,
    lamellaThicknessMm,
    base.kerfMm,
    minRow,
  );

  return {
    ...base,
    lamellas,
    lamellaThicknessMm,
    pattern: pickPattern(rng, weaves.length),
    weaves,
    seed: base.seed,
  };
}

/**
 * Рецепт по seed. Размеры доски, пропил и заготовка берутся из `base` —
 * генератор крутит узор, а не переспоривает столяра о размере доски.
 *
 * Черновик, который модель отвергает или который даёт предупреждение уровня
 * alarm, не показывается: вместо него берётся следующий, более консервативный.
 * Пустой экран с ошибкой вместо доски провалил бы acceptance №1 —
 * «сгенерировать и получить узор за тридцать секунд».
 */
export function generateRecipe(
  seed: number,
  base: Recipe = DEFAULT_RECIPE,
): Recipe {
  const rng = makeRng(seed);
  const from: Recipe = { ...base, seed };

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = draft(rng, from, attempt);
    const { error, warnings } = evaluate(candidate);
    if (!error && !warnings.some((w) => w.severity === "alarm")) {
      return candidate;
    }
  }

  // Последний рубеж: узор из двух контрастных пород ровным шагом. Собирается
  // при любых размерах доски, потому что ничего сверх первой склейки не делает.
  return {
    ...from,
    lamellas: Array.from({ length: 8 }, (_, i) => ({
      speciesId: i % 2 === 0 ? "maple" : "walnut",
      widthMm: 30,
    })),
    pattern: "checker",
    weaves: [],
  };
}

/** Двенадцать вариантов для галереи — соседние seed'ы, тот же размер доски. */
export function generateGallery(
  startSeed: number,
  base: Recipe,
  count = 12,
): Recipe[] {
  return Array.from({ length: count }, (_, i) =>
    generateRecipe(startSeed + i, base),
  );
}
