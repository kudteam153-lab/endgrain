import { useCallback, useEffect, useState } from "react";

/**
 * Отложенные варианты — список seed'ов.
 *
 * Хранится seed, а не рецепт: доска восстанавливается из него однозначно
 * (`CORE_PRINCIPLES.md §2.3`), и хранить рядом вторую копию раскладки значит
 * завести способ разойтись с генератором после первой же правки грамматики.
 */

const STORAGE_KEY = "endgrain.favourites.v1";
const LIMIT = 24;

function load(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function useFavourites() {
  const [seeds, setSeeds] = useState<number[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
    } catch {
      // Приватный режим или переполненное хранилище — работа продолжается.
    }
  }, [seeds]);

  const toggle = useCallback((seed: number) => {
    setSeeds((prev) =>
      prev.includes(seed)
        ? prev.filter((s) => s !== seed)
        : [seed, ...prev].slice(0, LIMIT),
    );
  }, []);

  return { seeds, toggle };
}
