import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Пропорции бокса, в который вписывается чертёж (#D-13, #D-14).
 *
 * Нужны, чтобы выбрать раскладку листа: на альбомном боксе штамп встаёт
 * сбоку и чертёж занимает всю высоту, на портретном — снизу. Измеряется бокс,
 * а не доска: доска меняется от каждой правки ручки, бокс — только от размера
 * окна. Поэтому раскладка не дрожит.
 *
 * На печати бокс другой — портретный A4, и меркой экрана его мерить нельзя:
 * альбомная раскладка легла бы в портретную страницу с пустыми полями сверху
 * и снизу. Поэтому на время печати пропорции подменяются на печатное поле.
 */

/** A4 минус поля 12 мм: 186 × 273. */
const A4_PRINT_ASPECT = 186 / 273;

/** Округление до сотых: без него ResizeObserver дёргает состояние на доли пикселя. */
const round = (v: number) => Math.round(v * 100) / 100;

export function useBoxAspect(
  ref: RefObject<HTMLElement | null>,
  fallback = 1.4,
): number {
  const [measured, setMeasured] = useState(fallback);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box || box.height <= 0) return;
      setMeasured((prev) => {
        const next = round(box.width / box.height);
        return next === prev ? prev : next;
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return printing ? A4_PRINT_ASPECT : measured;
}
