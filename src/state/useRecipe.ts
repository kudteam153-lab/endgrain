import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RECIPE } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { parseRecipe } from "./parse.ts";
import { decodeRecipe, encodeRecipe } from "./share.ts";

/**
 * Состояние проекта: автосохранение в localStorage плюс экспорт и импорт JSON.
 *
 * Обязательный пункт условий конкурса (`FACTS.md #F-11`), перенесён на день 2
 * решением `#D-08`. Сервера нет по `#D-03`, поэтому «сохранение» — это
 * браузер и файл, и оба должны переживать перезагрузку страницы.
 */

const STORAGE_KEY = "endgrain.recipe.v1";

function load(): Recipe {
  // Ссылка сильнее автосохранения: человек открыл чужую доску намеренно, и
  // подсунуть ему вместо неё свою прошлую — worst из возможных сюрпризов.
  const shared = decodeRecipe(window.location.hash);
  if (shared) return shared;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RECIPE;
    return parseRecipe(JSON.parse(raw)) ?? DEFAULT_RECIPE;
  } catch {
    // Приватный режим, переполненное хранилище, битый JSON — не повод
    // показывать пустой экран. Тихо начинаем с дефолта.
    return DEFAULT_RECIPE;
  }
}

export function useRecipe() {
  const [recipe, setRecipe] = useState<Recipe>(load);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
    } catch {
      // Хранилище недоступно — работа продолжается, просто без автосохранения.
    }

    // Адресная строка всегда показывает текущую доску: скопировать ссылку
    // можно и без кнопки, а история браузера не засоряется — `replaceState`,
    // не `pushState`.
    try {
      window.history.replaceState(null, "", encodeRecipe(recipe));
    } catch {
      // Пустой `origin` в песочнице — не повод ронять приложение.
    }
  }, [recipe]);

  const patch = useCallback((next: Partial<Recipe>) => {
    setRecipe((prev) => ({ ...prev, ...next }));
  }, []);

  const reset = useCallback(() => setRecipe(DEFAULT_RECIPE), []);

  const toJson = useCallback(() => JSON.stringify(recipe, null, 2), [recipe]);

  const fromJson = useCallback((text: string) => {
    try {
      const parsed = parseRecipe(JSON.parse(text));
      if (!parsed) {
        setImportError(
          "Это не проект доски — в файле нет ламелей или размеров.",
        );
        return false;
      }
      setRecipe(parsed);
      setImportError(null);
      return true;
    } catch {
      setImportError("Файл не читается как JSON.");
      return false;
    }
  }, []);

  return { recipe, setRecipe, patch, reset, toJson, fromJson, importError };
}
