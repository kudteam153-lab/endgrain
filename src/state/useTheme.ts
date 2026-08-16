import { useCallback, useEffect, useState } from "react";

/**
 * Выбор темы (`#D-22`).
 *
 * До этого тема бралась только из системы, и человек с тёмной ОС видел
 * графитовую версию, ни разу не увидев бумагу васи — то есть ту самую систему,
 * ради которой всё и делалось. Переключатель это чинит.
 *
 * По умолчанию — «как в системе»: навязывать свой выбор мастеру, который уже
 * настроил машину под свет в мастерской, неправильно.
 *
 * Классы, а не `data-theme`: `.paper` уже используется для принудительно
 * светлой темы на время сборки PDF, и вторая механика рядом с первой
 * разъехалась бы. Правила специфичности разобраны в `index.css`.
 */

export type ThemeChoice = "auto" | "light" | "dark";

const STORAGE_KEY = "endgrain.theme.v1";

export const THEMES: Array<{ id: ThemeChoice; name: string }> = [
  { id: "auto", name: "Авто" },
  { id: "light", name: "Свет" },
  { id: "dark", name: "Тьма" },
];

function load(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(load);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-light", theme === "light");
    root.classList.toggle("theme-dark", theme === "dark");
    try {
      if (theme === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Приватный режим или переполненное хранилище — работа продолжается.
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => setThemeState(next), []);

  return { theme, setTheme };
}
