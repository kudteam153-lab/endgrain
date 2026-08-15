import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PATTERNS, boardWidth, rowCount } from "./core/recipe.ts";
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
  const [assemblyKey, setAssemblyKey] = useState(0);

  const { face, error, warnings } = useMemo(() => evaluate(recipe), [recipe]);

  const lamellaWidths = useMemo(
    () => recipe.lamellas.map((l) => l.widthMm),
    [recipe.lamellas],
  );

  const patternName = useMemo(
    () => PATTERNS.find((p) => p.id === recipe.pattern)?.name ?? recipe.pattern,
    [recipe.pattern],
  );

  /**
   * Сборка проигрывается на открытии и по кнопке, но НЕ на каждую правку
   * ручки: иначе доска дёргается на каждом нажатии в поле ширины, и приём,
   * который должен впечатлять, начинает мешать работать.
   */
  const replay = useCallback(() => setAssemblyKey((k) => k + 1), []);
  useEffect(() => {
    replay();
  }, [recipe.pattern, replay]);

  const filename = `doska-${boardWidth(recipe)}x${rowCount(recipe) * recipe.lamellaThicknessMm}`;

  const sheetColor = () =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--sheet")
      .trim() || "#ffffff";

  const handlePng = async () => {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      await exportPng(svgRef.current, filename, sheetColor());
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
      <header className="masthead">
        <div className="masthead__mark">
          <h1 className="masthead__title">
            Торцевая
            <br />
            доска
          </h1>
          <p className="masthead__sub">
            Узор собирается как на верстаке — склейка, рез, переклейка. Что
            нельзя изготовить, здесь не рисуется.
          </p>
        </div>

        <dl className="masthead__meta">
          <div className="masthead__field">
            <dt>Лист</dt>
            <dd className="num">01</dd>
          </div>
          <div className="masthead__field">
            <dt>Единицы</dt>
            <dd className="num">мм</dd>
          </div>
          <div className="masthead__field">
            <dt>Плашек</dt>
            <dd className="num">{rowCount(recipe)}</dd>
          </div>
          <div className="masthead__field">
            <dt>Ширина</dt>
            <dd className="num">{boardWidth(recipe)}</dd>
          </div>
        </dl>
      </header>

      <main className="app__main">
        <aside className="rail" aria-label="Параметры доски">
          <Controls recipe={recipe} patch={patch} onReset={reset} />
        </aside>

        <section className="stage">
          <div className="stage__bar">
            <button type="button" className="btn btn--accent" onClick={replay}>
              Собрать заново
            </button>
            <div className="stage__spacer" />
            <button
              type="button"
              className="btn"
              onClick={() =>
                svgRef.current &&
                exportSvg(svgRef.current, filename, sheetColor())
              }
            >
              SVG
            </button>
            <button
              type="button"
              className="btn"
              onClick={handlePng}
              disabled={busy}
            >
              {busy ? "Рисую" : "PNG"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => exportJson(toJson(), filename)}
            >
              Сохранить
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
            >
              Открыть
            </button>
            <input
              ref={fileRef}
              className="stage__file"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImport(e.target.files?.[0])}
            />
          </div>

          <div className="plate">
            {face ? (
              <BoardSvg
                ref={svgRef}
                face={face}
                thicknessMm={recipe.boardHMm}
                lamellaWidths={lamellaWidths}
                patternName={patternName}
                kerfMm={recipe.kerfMm}
                seed={recipe.seed}
                assemblyKey={assemblyKey}
              />
            ) : (
              <div className="plate__blocked">
                <p className="label">Так доска не собирается</p>
                <p className="plate__blocked-text">{error}</p>
              </div>
            )}
          </div>

          {(importError || warnings.length > 0) && (
            <ul className="notes">
              {importError && (
                <li className="note note--alarm">{importError}</li>
              )}
              {warnings.map((w) => (
                <li
                  key={w.id}
                  className={
                    w.severity === "alarm" ? "note note--alarm" : "note"
                  }
                >
                  <span className="note__text">{w.text}</span>
                  {w.source && <span className="note__source">{w.source}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
