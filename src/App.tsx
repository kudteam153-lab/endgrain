import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generateRecipe } from "./core/generate.ts";
import { PATTERNS } from "./core/recipe.ts";
import type { Recipe } from "./core/recipe.ts";
import { formatLength } from "./core/units.ts";
import { evaluate } from "./core/warnings.ts";
import { BoardSvg } from "./render/BoardSvg.tsx";
import { AssemblySvg } from "./render/AssemblySvg.tsx";
import {
  exportJson,
  exportPng,
  exportSvg,
  serialize,
} from "./render/exportImage.ts";
import { Controls } from "./ui/Controls.tsx";
import { CutSheet } from "./ui/CutSheet.tsx";
import { Gallery } from "./ui/Gallery.tsx";
import { VIEWS } from "./render/views.ts";
import type { ViewId } from "./render/views.ts";
import { shareUrl } from "./state/share.ts";
import { useFavourites } from "./state/useFavourites.ts";
import { useRecipe } from "./state/useRecipe.ts";
import { useBoxAspect } from "./render/useBoxAspect.ts";
import "./App.css";

/**
 * Класс листа. Активный виден, неактивный скрыт, а на время сборки PDF все
 * листы уходят в экспортный бокс за краем окна: растрировать элемент с
 * `display: none` нечем — jsPDF отвергает картинку нулевого размера. Заодно
 * все три получают пропорции страницы, и штамп встаёт в портретную раскладку,
 * а не в экранную альбомную.
 */
function plateClass(active: boolean, exporting: boolean): string {
  if (exporting) return "plate plate--export";
  return active ? "plate" : "plate plate--offscreen";
}

/**
 * three.js грузится по нажатию «3D», а не при открытии страницы: он весит
 * больше всего остального приложения вместе взятого, а нужен одному режиму из
 * двух. Первый экран важнее — та же причина, что у PDF в `#D-18`.
 */
const Board3d = lazy(() =>
  import("./render/Board3d.tsx").then((m) => ({ default: m.Board3d })),
);

export function App() {
  const { recipe, setRecipe, patch, reset, toJson, fromJson, importError } =
    useRecipe();
  const favourites = useFavourites();
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [assemblyKey, setAssemblyKey] = useState(0);
  const [galleryFrom, setGalleryFrom] = useState<number | null>(null);
  const [sheet, setSheet] = useState<"drawing" | "cutlist" | "assembly">(
    "drawing",
  );
  const cutSheetRef = useRef<HTMLDivElement>(null);
  const assemblyRef = useRef<SVGSVGElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [solid, setSolid] = useState(false);
  const [view, setView] = useState<ViewId>("iso");
  const [family, setFamily] = useState<Recipe | null>(null);
  const boxAspect = useBoxAspect(plateRef, 1.4, pdfBusy);

  const { face, project, error, warnings } = useMemo(
    () => evaluate(recipe),
    [recipe],
  );

  /**
   * Габариты и число плашек берутся из собранного проекта, а не считаются
   * по рецепту заново: после переклейки (#D-15) ширина доски перестала быть
   * суммой ламелей, и вторая формула соврала бы именно там, где сложнее всего
   * заметить — в шапке и в имени файла.
   */
  const rows = project?.levels.at(-1)?.pieceCount ?? 0;

  /**
   * Нумерация ламелей на чертеже — только для доски без переклеек. После
   * продольного реза колонки лица набраны уже не из ламелей первой склейки, и
   * подпись «ламель 3» указывала бы на кусок совсем другой заготовки.
   */
  const lamellaWidths = useMemo(
    () =>
      (recipe.weaves ?? []).length > 0
        ? []
        : recipe.lamellas.map((l) => l.widthMm),
    [recipe.lamellas, recipe.weaves],
  );

  const patternName = useMemo(() => {
    const name =
      PATTERNS.find((p) => p.id === recipe.pattern)?.name ?? recipe.pattern;
    const depth = (recipe.weaves ?? []).length;
    return depth === 0 ? name : `${name} · ${depth + 1} склейки`;
  }, [recipe.pattern, recipe.weaves]);

  /**
   * Сборка проигрывается на открытии и по кнопке, но НЕ на каждую правку
   * ручки: иначе доска дёргается на каждом нажатии в поле ширины, и приём,
   * который должен впечатлять, начинает мешать работать.
   */
  const replay = useCallback(() => setAssemblyKey((k) => k + 1), []);

  /**
   * Новый узор поверх той же доски: размеры, пропил и заготовка остаются
   * пользовательскими (`GOAL.md` acceptance №2), меняется seed.
   */
  const generate = useCallback(() => {
    setRecipe((prev) => generateRecipe(prev.seed + 1, prev));
    replay();
  }, [setRecipe, replay]);

  const openVariant = useCallback(
    (variant: Recipe) => {
      setRecipe(variant);
      setGalleryFrom(null);
      setFamily(null);
      replay();
    },
    [setRecipe, replay],
  );
  useEffect(() => {
    replay();
  }, [recipe.pattern, replay]);

  /**
   * Объём существует только на экране. На время сборки PDF он снимается: в
   * документ уходит чертёж с размерами, а не снимок canvas — растрировать
   * повёрнутую деталь вместо листа значило бы отдать мастеру картинку вместо
   * инструкции.
   */
  const showSolid = solid && !pdfBusy;

  const filename = `doska-${project?.boardWMm ?? 0}x${project?.boardLMm ?? 0}`;

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

  /**
   * PDF собирается из тех же листов, что видно на экране (#D-18). Страницы
   * растрируются: векторный текст в PDF требует встроенного TTF, а в проекте
   * лежат woff2 — не встал бы шрифт, и вместо инструкции получились бы пустые
   * прямоугольники.
   */
  const handlePdf = async () => {
    setPdfBusy(true);
    // Страницы растрируются с экрана, поэтому на время сборки тёмная тема
    // выключается принудительно: иначе из принтера выйдет чёрная бумага.
    document.documentElement.classList.add("paper");
    try {
      // Кадр на то, чтобы React показал скрытые листы в экспортном боксе, а
      // ResizeObserver пересчитал раскладку штампа под пропорции страницы.
      await new Promise((done) => requestAnimationFrame(() => done(null)));
      await new Promise((done) => setTimeout(done, 120));

      // Библиотеки PDF грузятся по нажатию, а не при открытии страницы: они
      // весят больше всего остального приложения вместе взятого, а нужны
      // одному действию из десяти. Первый экран важнее.
      const { exportPdf } = await import("./render/pdf.ts");

      await exportPdf(
        {
          drawing: svgRef.current,
          cutSheet: cutSheetRef.current,
          assembly: assemblyRef.current,
          serializeSvg: serialize,
        },
        filename,
      );
    } finally {
      document.documentElement.classList.remove("paper");
      setPdfBusy(false);
    }
  };

  /**
   * Ссылка на доску. Хеш и так обновляется на каждую правку — кнопка нужна,
   * чтобы человек не гадал, ту ли строку копировать из адресной строки.
   */
  const handleShare = async () => {
    const url = shareUrl(recipe);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен (нет разрешения, http) — показываем ссылку, чтобы
      // скопировать руками, а не молчим.
      window.prompt("Ссылка на эту доску:", url);
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
          <h1 className="masthead__title">Торцевая доска</h1>
          <p className="masthead__sub">
            Узор собирается как на верстаке — склейка, рез, переклейка. Что
            нельзя изготовить, здесь не рисуется.
          </p>
        </div>

        <dl className="masthead__meta">
          <div className="masthead__field">
            <dt>Лист</dt>
            <dd className="num">
              {sheet === "drawing" ? "01" : sheet === "cutlist" ? "02" : "03"}
            </dd>
          </div>
          <div className="masthead__field">
            <dt>Единицы</dt>
            <dd className="num">{recipe.units === "mm" ? "мм" : "дюймы"}</dd>
          </div>
          <div className="masthead__field">
            <dt>Плашек</dt>
            <dd className="num">{rows}</dd>
          </div>
          <div className="masthead__field">
            <dt>Ширина</dt>
            <dd className="num">
              {project ? formatLength(project.boardWMm, recipe.units) : "—"}
            </dd>
          </div>
        </dl>
      </header>

      <main className="app__main">
        <aside className="rail" aria-label="Параметры доски">
          <Controls recipe={recipe} patch={patch} onReset={reset} />

          {/*
            Файловые действия переехали сюда с панели над листом: с приходом
            второго листа (#D-17) кнопки перестали помещаться в строку и
            сползали во вторую, отнимая высоту у чертежа (#D-13). Здесь они и
            по смыслу на месте — это работа с проектом, а не с изображением.
          */}
          <section className="rail__files">
            <h2 className="label">Файл</h2>
            <div className="rail__buttons">
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
              <button type="button" className="btn" onClick={handleShare}>
                {copied ? "Скопировано" : "Ссылка"}
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
          </section>
        </aside>

        <section className="stage">
          <div className="stage__bar">
            <button
              type="button"
              className="btn btn--accent"
              onClick={generate}
            >
              Сгенерировать
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setGalleryFrom(recipe.seed + 1)}
            >
              Варианты
            </button>
            <button type="button" className="btn" onClick={replay}>
              Собрать заново
            </button>
            <button
              type="button"
              className="btn"
              onClick={handlePdf}
              disabled={pdfBusy}
            >
              {pdfBusy ? "Собираю" : "PDF"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.print()}
            >
              Печать
            </button>

            <div className="stage__sheets" role="radiogroup" aria-label="Лист">
              <button
                type="button"
                role="radio"
                aria-checked={sheet === "drawing"}
                className="stage__sheet"
                onClick={() => setSheet("drawing")}
              >
                01 Чертёж
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sheet === "cutlist"}
                className="stage__sheet"
                onClick={() => setSheet("cutlist")}
              >
                02 Раскрой
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={sheet === "assembly"}
                className="stage__sheet"
                onClick={() => setSheet("assembly")}
              >
                03 Сборка
              </button>
            </div>
          </div>

          {/*
            Оба листа держатся в DOM всегда: скрытый прячется классом, а на
            печать уходят оба подряд (#D-14 печатал один). Мастеру нужен
            комплект — чертёж и раскрой, — а не тот лист, который он забыл
            переключить перед печатью.
          */}
          <div
            className={`${
              sheet === "drawing" ? "plate" : "plate plate--offscreen"
            }${showSolid ? " plate--solid" : ""}`}
            ref={plateRef}
          >
            {face ? (
              <>
                {/*
                  Чертёж остаётся смонтированным и в объёмном режиме: из него
                  собирается PDF и он же уходит на бумагу. Показ снимается
                  классом, а не размонтированием — `svgRef` должен оставаться
                  живым, иначе кнопка PDF в 3D печатала бы пустую страницу.
                */}
                <div
                  className={
                    showSolid ? "plate__flat plate__flat--off" : "plate__flat"
                  }
                >
                  <BoardSvg
                    ref={svgRef}
                    face={face}
                    thicknessMm={recipe.boardHMm}
                    lamellaWidths={lamellaWidths}
                    patternName={patternName}
                    kerfMm={recipe.kerfMm}
                    seed={recipe.seed}
                    boxAspect={boxAspect}
                    assemblyKey={assemblyKey}
                  />
                </div>

                {showSolid && (
                  <div className="plate__solid">
                    <Suspense
                      fallback={
                        <p className="plate__loading label">
                          Собираю доску в объёме…
                        </p>
                      }
                    >
                      <Board3d
                        face={face}
                        thicknessMm={recipe.boardHMm}
                        view={view}
                      />
                    </Suspense>
                  </div>
                )}

                {/*
                  Переключатель живёт на самом листе, а не в панели действий:
                  мастер переключает представление по ходу правки размеров, и
                  ходить за этим наверх — лишний путь. В экспорт он не попадает
                  (`pdfBusy`) и не печатается: это орган управления, а не часть
                  документа.
                */}
                {!pdfBusy && (
                  <div className="plate__controls">
                    <div
                      className="seg"
                      role="radiogroup"
                      aria-label="Представление листа"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!showSolid}
                        className="seg__item"
                        onClick={() => setSolid(false)}
                      >
                        2D
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={showSolid}
                        className="seg__item"
                        onClick={() => setSolid(true)}
                      >
                        3D
                      </button>
                    </div>

                    {showSolid && (
                      <div
                        className="seg seg--stack"
                        role="radiogroup"
                        aria-label="Вид детали"
                      >
                        {VIEWS.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={view === v.id}
                            className="seg__item"
                            onClick={() => setView(v.id)}
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="plate__blocked">
                <p className="label">Так доска не собирается</p>
                <p className="plate__blocked-text">{error}</p>
              </div>
            )}
          </div>

          <div
            ref={cutSheetRef}
            className={`plate--paper ${plateClass(sheet === "cutlist", pdfBusy)}`}
          >
            {face ? (
              <CutSheet recipe={recipe} />
            ) : (
              <div className="plate__blocked">
                <p className="label">Считать нечего</p>
                <p className="plate__blocked-text">{error}</p>
              </div>
            )}
          </div>

          <div className={plateClass(sheet === "assembly", pdfBusy)}>
            {face ? (
              <AssemblySvg ref={assemblyRef} recipe={recipe} />
            ) : (
              <div className="plate__blocked">
                <p className="label">Собирать нечего</p>
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

      {galleryFrom !== null && (
        <Gallery
          base={recipe}
          startSeed={galleryFrom}
          favourites={favourites.seeds}
          family={family}
          onPick={openVariant}
          onToggleFavourite={favourites.toggle}
          onFamily={setFamily}
          onMore={() => setGalleryFrom((from) => (from ?? recipe.seed) + 12)}
          onClose={() => {
            setGalleryFrom(null);
            setFamily(null);
          }}
        />
      )}
    </div>
  );
}
