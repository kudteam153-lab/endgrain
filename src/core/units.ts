/**
 * Единицы измерения: миллиметры и дюймы (`PLAN.md §День 4`).
 *
 * Переключатель `Recipe.units` заведён с дня 1 и до сих пор ни на что не
 * влиял. Перевод делается целиком: смесь систем в одной таблице — «ламель
 * 1 3/4″, пропил 3.2 мм» — хуже, чем отсутствие дюймов вовсе, потому что
 * читается как опечатка и проверяется только на верстаке.
 *
 * Дробные дюймы, а не десятичные: рулетка и угольник размечены шестнадцатыми,
 * и «1.81″» столяру нечем отложить.
 */

export type Units = "mm" | "in";

const MM_IN_INCH = 25.4;

/** Шестнадцатая доля — предел разметки ручного инструмента. */
const FRACTION = 16;

/** Board foot — объём в дюймовой системе: 12″ × 12″ × 1″. */
const M3_IN_BOARD_FOOT = 0.0023597372;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Длина в выбранной системе. Дюймы округляются до шестнадцатых и
 * сокращаются: 8/16 показывается как 1/2, целые — без дроби.
 */
export function formatLength(mm: number, units: Units): string {
  if (units === "mm") {
    return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
  }

  const sixteenths = Math.round((mm / MM_IN_INCH) * FRACTION);
  const whole = Math.trunc(sixteenths / FRACTION);
  const rest = Math.abs(sixteenths % FRACTION);

  if (rest === 0) return `${whole}″`;

  const divisor = gcd(rest, FRACTION);
  const fraction = `${rest / divisor}/${FRACTION / divisor}`;
  return whole === 0 ? `${fraction}″` : `${whole} ${fraction}″`;
}

/** Объём: кубометры или board feet — то, чем считают доску в дюймовой системе. */
export function formatVolume(m3: number, units: Units): string {
  if (units === "mm") return `${m3.toFixed(4)} м³`;
  return `${(m3 / M3_IN_BOARD_FOOT).toFixed(1)} BF`;
}

/** Подпись единицы для колонок таблиц и размерных линий. */
export const lengthUnit = (units: Units): string =>
  units === "mm" ? "мм" : "″";

/** Цена в рублях без копеек: тысячи рублей с копейками читаются как ошибка. */
export const formatMoney = (rub: number): string =>
  `${Math.round(rub).toLocaleString("ru-RU")} ₽`;
