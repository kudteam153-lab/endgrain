import { Suspense, lazy, useEffect, useRef } from "react";
import type { Face } from "../core/types.ts";
import "./VolumeOverlay.css";

/**
 * Доска в объёме поверх листа.
 *
 * Оверлей, а не четвёртый лист: листы — документы, они печатаются и уходят в
 * PDF, а объём существует только на экране. Смешивать их значило бы обещать
 * мастеру страницу, которой он не получит.
 *
 * `three.js` грузится по нажатию: он весит больше всего приложения, а нужен
 * одному действию. Первый экран важнее (та же причина, что у PDF в `#D-18`).
 */

const Board3d = lazy(() =>
  import("../render/Board3d.tsx").then((m) => ({ default: m.Board3d })),
);

interface Props {
  face: Face;
  thicknessMm: number;
  title: string;
  onClose: () => void;
}

export function VolumeOverlay({ face, thicknessMm, title, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="volume"
      role="dialog"
      aria-modal="true"
      aria-label="Доска в объёме"
    >
      <div className="volume__bar">
        <h2 className="label">В объёме</h2>
        <p className="volume__hint">{title}. Тяните мышью, чтобы повернуть.</p>
        <div className="stage__spacer" />
        <button ref={closeRef} type="button" className="btn" onClick={onClose}>
          Закрыть
        </button>
      </div>

      <div className="volume__stage">
        <Suspense
          fallback={<p className="volume__loading">Собираю доску в объёме…</p>}
        >
          <Board3d face={face} thicknessMm={thicknessMm} />
        </Suspense>
      </div>
    </div>
  );
}
