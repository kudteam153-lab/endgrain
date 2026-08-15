import {
  applyTransform,
  crosscut,
  glueUp,
  mm,
  rip,
  sliceYield,
} from "./geometry.ts";
import type { Face, Level, Piece, Project, Strip, Transform } from "./types.ts";

/**
 * Прогон стека столярных операций (DECISIONS.md #D-01).
 *
 * Каждый уровень: склеить → отрезать → развернуть плашки. Последняя склейка
 * происходит после всех уровней — это и есть готовая доска. Отсюда правило:
 * склеек всегда на одну больше, чем резов, ровно как на верстаке.
 *
 * Функция чистая и детерминированная: один `Project` — одно лицо, всегда.
 * На этом стоит шаринг ссылкой (#D-03) и «дай ещё 12 вариантов» (#D-02).
 */
export function simulate(project: Project): Face {
  if (project.levels.length === 0) throw new Error("Проект без уровней");

  let pieces: Piece[] = [];

  for (const [i, level] of project.levels.entries()) {
    pieces = cutAndTransform(level, glueUp(inputOf(level, pieces, i)));
  }

  return glueUp(pieces).face;
}

/**
 * Склейка, которая ложится под рез уровня `index`.
 *
 * Нужна, чтобы посчитать число плашек: длина доски задаётся в миллиметрах, а
 * режется плашками высотой в панель, и эту высоту меняет каждая переклейка.
 * Считать её формулой рядом с симулятором значит завести второй способ узнать
 * то же самое (`CORE_PRINCIPLES.md §2.2`) — он и разойдётся первым.
 */
export function panelAt(levels: Level[], index: number): Piece {
  if (index < 0 || index >= levels.length)
    throw new Error("Уровня нет в проекте");

  let pieces: Piece[] = [];
  for (let i = 0; i <= index; i++) {
    const level = levels[i]!;
    const panel = glueUp(inputOf(level, pieces, i));
    if (i === index) return panel;
    pieces = cutAndTransform(level, panel);
  }

  throw new Error("Уровня нет в проекте");
}

/** Что идёт в склейку уровня: сырьё или плашки предыдущего реза. */
function inputOf(level: Level, previous: Piece[], index: number): Piece[] {
  const input: Piece[] =
    level.source.from === "lumber"
      ? level.source.strips.map(stripToPiece)
      : previous;

  if (input.length === 0) {
    throw new Error(
      `Уровень ${index + 1}: склеивать нечего — предыдущий рез не дал плашек`,
    );
  }
  return input;
}

/** Рез панели и разворот плашек — вторая половина уровня. */
function cutAndTransform(level: Level, panel: Piece): Piece[] {
  if (level.cut.angleDeg !== 90) {
    // Угловой рез — шеврон и ёлочка, день 5 (PLAN.md). Молча отдать
    // ортогональ было бы хуже отказа: узор на превью разошёлся бы с
    // раскроем в PDF, и заметили бы это в мастерской.
    throw new Error(
      `Угловой рез (${level.cut.angleDeg}°) ещё не поддержан — в MVP только ортогональ`,
    );
  }

  const pieces =
    level.cut.kind === "crosscut"
      ? crosscut(panel, level.cut.sliceWidthMm, level.pieceCount)
      : rip(panel, level.cut.sliceWidthMm, level.cut.kerfMm, level.pieceCount);

  return pieces.map((p, idx) =>
    applyTransform(p, transformAt(level.transforms, idx)),
  );
}

/**
 * Трансформ на плашку по индексу. Список короче числа плашек — повторяется
 * циклом: узор задаётся периодом, а не перечислением всех рядов.
 */
export function transformAt(transforms: Transform[], index: number): Transform {
  if (transforms.length === 0) return { op: "none" };
  return transforms[index % transforms.length]!;
}

/** Ламель как заготовка на верстаке: лицо в торце, волокно вдоль длины. */
function stripToPiece(s: Strip): Piece {
  return {
    face: {
      wMm: mm(s.widthMm),
      hMm: mm(s.thicknessMm),
      cells: [
        {
          xMm: 0,
          yMm: 0,
          wMm: mm(s.widthMm),
          hMm: mm(s.thicknessMm),
          speciesId: s.speciesId,
        },
      ],
    },
    lengthMm: mm(s.lengthMm),
    grain: "long",
  };
}

/**
 * Хватает ли заготовки на задуманное число плашек.
 *
 * Возвращает недостачу в штуках, 0 — хватает. Питает предупреждение
 * «не хватает длины заготовки» (PLAN.md §День 4); здесь заведено сразу,
 * потому что проверять это должна модель, а не интерфейс.
 */
export function shortfall(project: Project): number {
  let worst = 0;
  let pieces: Piece[] = [];

  for (const [i, level] of project.levels.entries()) {
    const panel = glueUp(inputOf(level, pieces, i));

    // Поперечный рез ограничен длиной панели, продольный — её шириной.
    // До переклеек второй случай не встречался: рез был ровно один.
    const available =
      level.cut.kind === "crosscut"
        ? sliceYield(panel.lengthMm, level.cut.sliceWidthMm, level.cut.kerfMm)
        : sliceYield(panel.face.wMm, level.cut.sliceWidthMm, level.cut.kerfMm);
    worst = Math.max(worst, level.pieceCount - available);

    pieces = cutAndTransform(level, panel);
  }

  return Math.max(0, worst);
}
