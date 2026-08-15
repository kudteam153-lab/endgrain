import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RECIPE } from "../core/recipe.ts";
import type { Recipe, Weave } from "../core/recipe.ts";
import { SPECIES } from "../core/species.ts";

/**
 * Состояние проекта: автосохранение в localStorage плюс экспорт и импорт JSON.
 *
 * Обязательный пункт условий конкурса (`FACTS.md #F-11`), перенесён на день 2
 * решением `#D-08`. Сервера нет по `#D-03`, поэтому «сохранение» — это
 * браузер и файл, и оба должны переживать перезагрузку страницы.
 */

const STORAGE_KEY = "endgrain.recipe.v1";

/**
 * Разбор недоверенного входа: localStorage правится руками, файл приносят
 * чужой. Проверяется каждое поле, а не `as Recipe` — иначе первый же кривой
 * JSON уронит приложение на пустом экране, и человек решит, что оно сломано.
 */
export function parseRecipe(raw: unknown): Recipe | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const num = (v: unknown, min: number, max: number): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      ? v
      : null;

  const lamellas = Array.isArray(r["lamellas"])
    ? r["lamellas"].flatMap(
        (l): Array<{ speciesId: string; widthMm: number }> => {
          if (typeof l !== "object" || l === null) return [];
          const item = l as Record<string, unknown>;
          const width = num(item["widthMm"], 1, 500);
          const speciesId = item["speciesId"];
          if (width === null || typeof speciesId !== "string") return [];
          if (!SPECIES.some((s) => s.id === speciesId)) return [];
          return [{ speciesId, widthMm: width }];
        },
      )
    : [];
  if (lamellas.length === 0) return null;

  const thickness = num(r["lamellaThicknessMm"], 1, 200);
  const blank = num(r["blankLengthMm"], 50, 5000);
  const boardL = num(r["boardLMm"], 20, 2000);
  const boardH = num(r["boardHMm"], 5, 200);
  const kerf = num(r["kerfMm"], 0, 20);
  const seed = num(r["seed"], 0, Number.MAX_SAFE_INTEGER);
  if (thickness === null || blank === null || boardL === null) return null;
  if (boardH === null || kerf === null) return null;

  const pattern = r["pattern"];
  const units = r["units"];

  // Переклейки появились на дне 3 (#D-15). Поля нет — проект сохранён раньше,
  // и это доска в один уровень, а не битый файл.
  const weaves = Array.isArray(r["weaves"])
    ? r["weaves"].flatMap((w): Weave[] => {
        if (typeof w !== "object" || w === null) return [];
        const item = w as Record<string, unknown>;
        const stripWidthMm = num(item["stripWidthMm"], 1, 1000);
        const count = num(item["count"], 2, 40);
        const kind = item["kind"];
        if (stripWidthMm === null || count === null) return [];
        if (kind !== "rotate" && kind !== "basket") return [];
        return [{ stripWidthMm, count: Math.round(count), kind }];
      })
    : [];
  if (weaves.length > 2) return null;

  return {
    lamellas,
    weaves,
    lamellaThicknessMm: thickness,
    blankLengthMm: blank,
    boardLMm: boardL,
    boardHMm: boardH,
    kerfMm: kerf,
    pattern:
      pattern === "stripe" ||
      pattern === "checker" ||
      pattern === "brick" ||
      pattern === "diamond" ||
      pattern === "mirror"
        ? pattern
        : DEFAULT_RECIPE.pattern,
    units: units === "in" ? "in" : "mm",
    seed: seed ?? DEFAULT_RECIPE.seed,
  };
}

function load(): Recipe {
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
