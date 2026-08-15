import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Пропорции бокса, в который вписывается чертёж (#D-13).
 *
 * Нужны, чтобы выбрать раскладку листа: на альбомном боксе штамп встаёт
 * сбоку и чертёж занимает всю высоту, на портретном — снизу. Измеряется бокс,
 * а не доска: доска меняется от каждой правки ручки, бокс — только от размера
 * окна. Поэтому раскладка не дрожит.
 *
 * Округление до сотых намеренно: без него ResizeObserver дёргает состояние на
 * доли пикселя при любой перерисовке.
 */
export function useBoxAspect(
  ref: RefObject<HTMLElement | null>,
  fallback = 1.4,
): number {
  const [aspect, setAspect] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box || box.height <= 0) return;
      setAspect((prev) => {
        const next = Math.round((box.width / box.height) * 100) / 100;
        return next === prev ? prev : next;
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return aspect;
}
