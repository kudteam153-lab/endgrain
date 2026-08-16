import { forwardRef, useMemo } from "react";
import { PATTERNS, buildProject } from "../core/recipe.ts";
import type { Recipe } from "../core/recipe.ts";
import { panelAt, simulate } from "../core/simulate.ts";
import { speciesById } from "../core/species.ts";
import { formatLength } from "../core/units.ts";
import type { Face } from "../core/types.ts";
import "./AssemblySvg.css";

/**
 * Лист 03 — схема склеек по шагам (`GOAL.md` acceptance №3).
 *
 * Таблица размеров говорит, что отрезать. Схема говорит, что должно получиться
 * после каждой склейки, — без неё столяр узнаёт об ошибке в раскладке, когда
 * доска уже в струбцинах и клей схватился.
 *
 * Рисуется из тех же уровней модели, что и чертёж: панель перед резом берётся
 * у симулятора (`panelAt`), линии реза — из параметров того же реза. Никакой
 * второй геометрии здесь нет, иначе схема разошлась бы с раскроем.
 */

interface Props {
  recipe: Recipe;
}

/** Ширина миниатюры в единицах viewBox. Высота считается по пропорции. */
const THUMB = 100;
const GAP = 12;
const LABEL = 12;

/** Высота полосы «вид сбоку» — заготовка в длину с намеченными плашками. */
const SIDE_H = 10;

/**
 * Карта заправки (`#D-22`).
 *
 * Нотация ткацкого стана: сверху — из чего склеен щит слева направо, справа —
 * в каком порядке отрезаны ломти, в середине — что из этого выйдет. Ткачи
 * записывают так узор и план одной диаграммой двести лет, и задача у них та
 * же: связать «из чего», «в каком порядке» и «что получится».
 *
 * Карта не заменяет шаги, она стоит перед ними. Шаги отвечают «что делать
 * сейчас», карта — «где я в плане целиком»; на одном листе нужны обе, иначе
 * мастер держит вторую в голове.
 */
const MAP_H = 52;
const BAND = 5.5;
const BAND_GAP = 1.6;

export const AssemblySvg = forwardRef<SVGSVGElement, Props>(
  function AssemblySvg({ recipe }, ref) {
    const steps = useMemo(() => buildSteps(recipe), [recipe]);
    const draft = useMemo(() => buildDraft(recipe), [recipe]);

    const rowHeights = steps.map(
      (s) => THUMB / Math.max(0.2, s.aspect) + (s.side ? SIDE_H + 6 : 0),
    );
    const stepsH = rowHeights.reduce((sum, h) => sum + h + GAP + LABEL, 0);

    /**
     * Карта стоит в правом поле, а не над шагами. Сверху она вытягивала лист в
     * узкую колонку: бокс листа альбомный, и всё содержимое сжималось до
     * нечитаемого, а поля по бокам пустовали. Сбоку высота не растёт вовсе.
     */
    const mapAspect = draft.face.wMm / Math.max(1, draft.face.hMm);
    const mapW = Math.min(THUMB, MAP_H * mapAspect);
    const mapH = mapW / mapAspect;
    const mapX = THUMB + 62;
    const mapTop = BAND + BAND_GAP + 8;
    const mapBlockH = mapTop + mapH + 14;
    const vbW = mapX + mapW + BAND + 20;

    let y = 0;

    return (
      <svg
        ref={ref}
        className="assembly-svg"
        viewBox={`-8 -12 ${vbW} ${Math.max(stepsH, mapBlockH) + 16}`}
        role="img"
        aria-label="Схема склеек по шагам и карта заправки"
      >
        <text className="assembly-svg__head" x={0} y={-2} fontSize={6}>
          СБОРКА ПО ШАГАМ
        </text>

        <text className="assembly-svg__head" x={mapX} y={-2} fontSize={6}>
          КАРТА ЗАПРАВКИ
        </text>

        <g transform={`translate(${mapX} ${mapTop})`}>
          <DraftMap
            columns={draft.columns}
            face={draft.face}
            slices={draft.slices}
            patternName={draft.patternName}
          />
        </g>

        {steps.map((step, i) => {
          const height = rowHeights[i] ?? THUMB;
          const top = y;
          y += height + GAP + LABEL;

          return (
            <g key={i} transform={`translate(0 ${top + LABEL})`}>
              <text className="assembly-svg__step" x={0} y={-5} fontSize={4.6}>
                {i + 1}. {step.title}
              </text>

              <g transform={`scale(${THUMB / step.face.wMm})`}>
                {step.face.cells.map((c, k) => (
                  <rect
                    key={k}
                    x={c.xMm}
                    y={c.yMm}
                    width={c.wMm}
                    height={c.hMm}
                    fill={speciesById(c.speciesId).color}
                  />
                ))}
                <g
                  className="assembly-svg__seams"
                  strokeWidth={step.face.wMm / THUMB / 3}
                >
                  {step.face.cells.map((c, k) => (
                    <rect
                      key={k}
                      x={c.xMm}
                      y={c.yMm}
                      width={c.wMm}
                      height={c.hMm}
                    />
                  ))}
                </g>

                {/* Линии реза — там, где пойдёт диск. Пунктир, потому что
                    это намерение, а не шов уже склеенного. */}
                <g
                  className="assembly-svg__cuts"
                  strokeWidth={step.face.wMm / THUMB / 2}
                  strokeDasharray={`${(step.face.wMm / THUMB) * 2} ${(step.face.wMm / THUMB) * 1.5}`}
                >
                  {step.cuts.map((pos, k) =>
                    step.cutAlong === "x" ? (
                      <line
                        key={k}
                        x1={pos}
                        y1={0}
                        x2={pos}
                        y2={step.face.hMm}
                      />
                    ) : (
                      <line
                        key={k}
                        x1={0}
                        y1={pos}
                        x2={step.face.wMm}
                        y2={pos}
                      />
                    ),
                  )}
                </g>
              </g>

              <rect
                className="assembly-svg__frame"
                x={0}
                y={0}
                width={THUMB}
                height={height - (step.side ? SIDE_H + 6 : 0)}
                strokeWidth={0.4}
              />

              {step.side && (
                <SideView
                  side={step.side}
                  top={height - SIDE_H}
                  units={recipe.units}
                />
              )}

              <text
                className="assembly-svg__size"
                x={THUMB + 4}
                y={(height - (step.side ? SIDE_H + 6 : 0)) / 2}
                fontSize={3.8}
              >
                {step.size}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);

interface SideViewProps {
  side: { lengthMm: number; sliceMm: number; kerfMm: number; count: number };
  top: number;
  units: "mm" | "in";
}

/**
 * Заготовка в длину с намеченными плашками — так рез виден по-настоящему.
 * Хвост справа это остаток: он остаётся целым и пойдёт на следующую доску.
 */
function SideView({ side, top, units }: SideViewProps) {
  const scale = THUMB / side.lengthMm;
  const step = (side.sliceMm + side.kerfMm) * scale;
  const used = Math.min(THUMB, side.count * step);

  return (
    <g transform={`translate(0 ${top})`}>
      <rect
        className="assembly-svg__blank"
        x={0}
        y={0}
        width={THUMB}
        height={SIDE_H}
        strokeWidth={0.4}
      />
      <rect
        className="assembly-svg__used"
        x={0}
        y={0}
        width={used}
        height={SIDE_H}
      />
      <g className="assembly-svg__cuts" strokeWidth={0.35}>
        {Array.from({ length: Math.max(0, side.count - 1) }, (_, k) => (
          <line
            key={k}
            x1={(k + 1) * step}
            y1={0}
            x2={(k + 1) * step}
            y2={SIDE_H}
          />
        ))}
      </g>
      <text
        className="assembly-svg__size"
        x={THUMB + 4}
        y={SIDE_H / 2}
        fontSize={3.4}
      >
        {side.count} × {formatLength(side.sliceMm, units)} из{" "}
        {formatLength(side.lengthMm, units)}
      </text>
    </g>
  );
}

interface DraftMapProps {
  /** Ламели первой склейки: из чего набран щит слева направо. */
  columns: Array<{ widthMm: number; color: string }>;
  /** Готовая доска — она же drawdown ткацкой заправки. */
  face: Face;
  /** Число ломтей последнего реза: по ним размечена правая лента. */
  slices: number;
  patternName: string;
}

/**
 * Верхняя лента — threading, правая — treadling, середина — drawdown.
 * Углового квадрата (tie-up) здесь нет: у ткача в нём матрица подъёма ремизок,
 * а у нас правило узора не матрица, и рисовать похожую клетчатую картинку
 * значило бы выдать украшение за данные. В углу стоит имя узора — то, чем
 * связаны лента сверху и лента справа.
 */
function DraftMap({ columns, face, slices, patternName }: DraftMapProps) {
  const aspect = face.wMm / Math.max(1, face.hMm);
  const mapW = Math.min(THUMB, MAP_H * aspect);
  const mapH = mapW / aspect;
  const scale = mapW / face.wMm;

  const totalCols = columns.reduce((s, c) => s + Math.max(1, c.widthMm), 0);
  const bandTop = -(BAND + BAND_GAP);
  const bandLeft = mapW + BAND_GAP;

  let x = 0;
  const threading = columns.map((c, i) => {
    const w = (Math.max(1, c.widthMm) / totalCols) * mapW;
    const cell = { key: i, x, w, color: c.color };
    x += w;
    return cell;
  });

  const rowH = mapH / Math.max(1, slices);

  return (
    <g className="assembly-svg__map">
      <text className="assembly-svg__step" x={0} y={bandTop - 3} fontSize={4.2}>
        Из чего склеен щит →
      </text>

      {threading.map((c) => (
        <rect
          key={c.key}
          className="assembly-svg__map-cell"
          x={c.x}
          y={bandTop}
          width={c.w}
          height={BAND}
          fill={c.color}
        />
      ))}

      {/* Drawdown: та же доска, что на чертеже, только мельче. */}
      <g transform={`scale(${scale})`}>
        {face.cells.map((c, k) => (
          <rect
            key={k}
            x={c.xMm}
            y={c.yMm}
            width={c.wMm}
            height={c.hMm}
            fill={speciesById(c.speciesId).color}
          />
        ))}
      </g>
      <rect
        className="assembly-svg__map-frame"
        x={0}
        y={0}
        width={mapW}
        height={mapH}
        strokeWidth={0.4}
      />

      {/* Правая лента — счёт ломтей. Каждый пятый подписан: у верстака важно
          не «какой по узору», а «какой по счёту» — их легко перепутать. */}
      {Array.from({ length: slices }, (_, i) => (
        <g key={i}>
          <rect
            className="assembly-svg__map-slice"
            x={bandLeft}
            y={i * rowH}
            width={BAND}
            height={rowH}
            fillOpacity={i % 2 === 0 ? 0.16 : 0.04}
            strokeWidth={0.2}
          />
          {(i + 1) % 5 === 0 && (
            <text
              className="assembly-svg__size"
              x={bandLeft + BAND + 1.6}
              y={i * rowH + rowH / 2}
              fontSize={3}
            >
              {i + 1}
            </text>
          )}
        </g>
      ))}
      <text
        className="assembly-svg__step"
        x={bandLeft}
        y={mapH + 4.5}
        fontSize={3.4}
      >
        {slices} ломтей ↓
      </text>

      <text
        className="assembly-svg__map-rule"
        x={bandLeft}
        y={bandTop + BAND - 1.2}
        fontSize={3.6}
      >
        {patternName}
      </text>
    </g>
  );
}

interface AssemblyStep {
  title: string;
  size: string;
  face: Face;
  aspect: number;
  /** По какой оси идут линии реза. */
  cutAlong: "x" | "y";
  cuts: number[];
  /**
   * Вид сбоку для поперечного реза.
   *
   * На лице панели поперечный рез не виден: он идёт вглубь, по длине
   * заготовки. Рисовать линии на лице значило бы показать рез, которого там
   * нет, — а по этой схеме будут пилить.
   */
  side?: { lengthMm: number; sliceMm: number; kerfMm: number; count: number };
}

/**
 * Данные карты заправки. Всё берётся из той же модели, что и шаги: колонки —
 * ламели первой склейки, доска — результат симуляции, число ломтей — из
 * последнего уровня. Второй геометрии нет, разойтись нечему.
 */
function buildDraft(recipe: Recipe): {
  columns: Array<{ widthMm: number; color: string }>;
  face: Face;
  slices: number;
  patternName: string;
} {
  const project = buildProject(recipe);
  const first = project.levels[0];
  const columns =
    first?.source.from === "lumber"
      ? first.source.strips.map((s) => ({
          widthMm: s.widthMm,
          color: speciesById(s.speciesId).color,
        }))
      : [];

  return {
    columns,
    face: simulate(project),
    slices: project.levels.at(-1)?.pieceCount ?? 0,
    patternName:
      PATTERNS.find((p) => p.id === recipe.pattern)?.name ?? recipe.pattern,
  };
}

/**
 * Шаги: перед каждым резом — панель, которую кладут на пилу, с намеченными
 * линиями. В конце — готовая доска.
 */
function buildSteps(recipe: Recipe): AssemblyStep[] {
  const project = buildProject(recipe);
  const units = recipe.units;
  const out: AssemblyStep[] = [];

  for (const [i, level] of project.levels.entries()) {
    const panel = panelAt(project.levels, i);
    const step = level.cut.sliceWidthMm + level.cut.kerfMm;

    // Рез идёт поперёк длины заготовки — на лице это горизонтальные линии для
    // поперечного реза и вертикальные для продольного.
    const along = level.cut.kind === "rip" ? "x" : "y";
    const limit = along === "x" ? panel.face.wMm : panel.face.hMm;

    const cuts: number[] = [];
    if (along === "x") {
      for (let k = 1; k < level.pieceCount && k * step < limit; k++) {
        cuts.push(k * step);
      }
    }

    const first = project.levels[0];
    out.push({
      title:
        i === 0
          ? `Склеить ${first?.source.from === "lumber" ? first.source.strips.length : 0} ламелей и разметить рез`
          : "Склеить полосы и разметить поперечный рез",
      size: `${formatLength(panel.face.wMm, units)} × ${formatLength(panel.face.hMm, units)}`,
      face: panel.face,
      aspect: panel.face.wMm / panel.face.hMm,
      cutAlong: along,
      cuts,
      ...(level.cut.kind === "crosscut"
        ? {
            side: {
              lengthMm: panel.lengthMm,
              sliceMm: level.cut.sliceWidthMm,
              kerfMm: level.cut.kerfMm,
              count: level.pieceCount,
            },
          }
        : {}),
    });
  }

  const board = simulate(project);
  out.push({
    title: "Собрать доску по узору и отшлифовать",
    size: `${formatLength(board.wMm, units)} × ${formatLength(board.hMm, units)}`,
    face: board,
    aspect: board.wMm / board.hMm,
    cutAlong: "y",
    cuts: [],
  });

  return out;
}
