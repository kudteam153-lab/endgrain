import { useMemo, useRef, useState } from "react";
import { boardWidth, rowCount } from "./core/recipe.ts";
import { speciesById } from "./core/species.ts";
import { evaluate } from "./core/warnings.ts";
import { BoardSvg } from "./render/BoardSvg.tsx";
import { exportJson, exportPng, exportSvg } from "./render/exportImage.ts";
import { Controls } from "./ui/Controls.tsx";
import { useRecipe } from "./state/useRecipe.ts";
import "./App.css";

export function App() {
  const { recipe, patch, reset, toJson, fromJson, importError } = useRecipe();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { face, error, warnings } = useMemo(() => evaluate(recipe), [recipe]);

  const lamellaWidths = useMemo(
    () => recipe.lamellas.map((l) => l.widthMm),
    [recipe.lamellas],
  );

  const palette = useMemo(() => {
    const ids = [...new Set(recipe.lamellas.map((l) => l.speciesId))];
    return ids.map(speciesById);
  }, [recipe.lamellas]);

  const filename = `doska-${boardWidth(recipe)}x${rowCount(recipe) * recipe.lamellaThicknessMm}`;

  const paperColor = () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface")
      .trim() || "#ffffff";

  const handlePng = async () => {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      await exportPng(svgRef.current, filename, paperColor());
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    fromJson(await file.text());
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1>Торцевая доска</h1>
          <p className="app__tagline">
            Узор собирается как на верстаке: склейка, рез, переклейка. Что
            нельзя изготовить — здесь не рисуется.
          </p>
        </div>

        <div className="app__actions">
          <button
            type="button"
            className="app__btn"
            onClick={() =>
              svgRef.current &&
              exportSvg(svgRef.current, filename, paperColor())
            }
          >
            SVG
          </button>
          <button
            type="button"
            className="app__btn"
            onClick={handlePng}
            disabled={busy}
          >
            {busy ? "Рисую…" : "PNG"}
          </button>
          <button
            type="button"
            className="app__btn"
            onClick={() => exportJson(toJson(), filename)}
          >
            Сохранить проект
          </button>
          <button
            type="button"
            className="app__btn"
            onClick={() => fileRef.current?.click()}
          >
            Открыть проект
          </button>
          <input
            ref={fileRef}
            className="app__file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleImport(e.target.files?.[0])}
          />
        </div>
      </header>

      <main className="app__main">
        <aside className="app__panel" aria-label="Параметры доски">
          <Controls recipe={recipe} patch={patch} onReset={reset} />
        </aside>

        <section className="app__stage">
          <div className="app__paper">
            {face ? (
              <BoardSvg
                ref={svgRef}
                face={face}
                thicknessMm={recipe.boardHMm}
                lamellaWidths={lamellaWidths}
              />
            ) : (
              <p className="app__blocked">{error}</p>
            )}
          </div>

          <div className="app__readout">
            <dl className="app__specs">
              <div>
                <dt>Ширина</dt>
                <dd className="num">{boardWidth(recipe)} мм</dd>
              </div>
              <div>
                <dt>Длина</dt>
                <dd className="num">
                  {rowCount(recipe) * recipe.lamellaThicknessMm} мм
                </dd>
              </div>
              <div>
                <dt>Толщина</dt>
                <dd className="num">{recipe.boardHMm} мм</dd>
              </div>
              <div>
                <dt>Плашек</dt>
                <dd className="num">{rowCount(recipe)}</dd>
              </div>
            </dl>

            <ul className="app__palette">
              {palette.map((s) => (
                <li key={s.id} className="app__swatch">
                  <span className="app__chip" data-species={s.id}>
                    <svg viewBox="0 0 12 12" aria-hidden="true">
                      <rect width="12" height="12" fill={s.color} />
                    </svg>
                  </span>
                  {s.name}
                </li>
              ))}
            </ul>
          </div>

          {(importError || warnings.length > 0) && (
            <ul className="app__warnings">
              {importError && (
                <li className="app__warning app__warning--alarm">
                  {importError}
                </li>
              )}
              {warnings.map((w) => (
                <li
                  key={w.id}
                  className={
                    w.severity === "alarm"
                      ? "app__warning app__warning--alarm"
                      : "app__warning"
                  }
                >
                  {w.text}
                  {w.source && (
                    <span className="app__warning-source">{w.source}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
