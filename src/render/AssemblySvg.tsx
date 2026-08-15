import { forwardRef, useMemo } from "react";
import { buildProject } from "../core/recipe.ts";
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

export const AssemblySvg = forwardRef<SVGSVGElement, Props>(
  function AssemblySvg({ recipe }, ref) {
    const steps = useMemo(() => buildSteps(recipe), [recipe]);

    const rowHeights = steps.map(
      (s) => THUMB / Math.max(0.2, s.aspect) + (s.side ? SIDE_H + 6 : 0),
    );
    const totalH = rowHeights.reduce((sum, h) => sum + h + GAP + LABEL, 0);
    const vbW = THUMB + 60;

    let y = 0;

    return (
      <svg
        ref={ref}
        className="assembly-svg"
        viewBox={`-8 -12 ${vbW} ${totalH + 16}`}
        role="img"
        aria-label="Схема склеек по шагам"
      >
        <text className="assembly-svg__head" x={0} y={-2} fontSize={6}>
          СБОРКА ПО ШАГАМ
        </text>

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
