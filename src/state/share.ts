import type { Recipe } from "../core/recipe.ts";
import { parseRecipe } from "./parse.ts";

/**
 * Шаринг ссылкой (`GOAL.md` acceptance №5, `#D-03`).
 *
 * Рецепт целиком уезжает в URL-хеш. Не только seed: доска — это ещё и
 * размеры, пропил и заготовка, которые задал человек, а генератор их не
 * трогает. Ссылка «seed 42» открыла бы у друга другую доску, потому что у
 * него другая заготовка по умолчанию.
 *
 * Хеш, а не query: он не уходит на сервер в логи и не требует настройки
 * хостинга под маршруты — статика отдаёт один `index.html` (`#D-03`).
 */

const PREFIX = "#d=";

/** Base64url: обычный base64 ломается в адресной строке на `+`, `/` и `=`. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeRecipe(recipe: Recipe): string {
  return PREFIX + toBase64Url(JSON.stringify(recipe));
}

/**
 * Разбор ссылки. Проходит через ту же проверку полей, что и импорт файла:
 * хеш правится руками в адресной строке, и «доверять» ему нельзя ровно так же
 * (`security-paths.txt`). Мусор на входе — это `null`, а не пустой экран.
 */
export function decodeRecipe(hash: string): Recipe | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    return parseRecipe(JSON.parse(fromBase64Url(hash.slice(PREFIX.length))));
  } catch {
    return null;
  }
}

/** Ссылка на текущую доску — то, что кладут в буфер обмена. */
export function shareUrl(recipe: Recipe): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${encodeRecipe(recipe)}`;
}
