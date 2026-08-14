import { applyTransform, crosscut, glueUp, mm, rip, sliceYield } from './geometry.ts'
import type { Face, Piece, Project, Strip, Transform } from './types.ts'

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
  if (project.levels.length === 0) throw new Error('Проект без уровней')

  let pieces: Piece[] = []

  for (const [i, level] of project.levels.entries()) {
    const input: Piece[] =
      level.source.from === 'lumber' ? level.source.strips.map(stripToPiece) : pieces

    if (input.length === 0) {
      throw new Error(`Уровень ${i + 1}: склеивать нечего — предыдущий рез не дал плашек`)
    }

    const panel = glueUp(input)

    if (level.cut.angleDeg !== 90) {
      // Угловой рез — шеврон и ёлочка, день 5 (PLAN.md). Молча отдать
      // ортогональ было бы хуже отказа: узор на превью разошёлся бы с
      // раскроем в PDF, и заметили бы это в мастерской.
      throw new Error(
        `Угловой рез (${level.cut.angleDeg}°) ещё не поддержан — в MVP только ортогональ`,
      )
    }

    pieces =
      level.cut.kind === 'crosscut'
        ? crosscut(panel, level.cut.sliceWidthMm, level.pieceCount)
        : rip(panel, level.cut.sliceWidthMm, level.cut.kerfMm, level.pieceCount)

    pieces = pieces.map((p, idx) => applyTransform(p, transformAt(level.transforms, idx)))
  }

  return glueUp(pieces).face
}

/**
 * Трансформ на плашку по индексу. Список короче числа плашек — повторяется
 * циклом: узор задаётся периодом, а не перечислением всех рядов.
 */
export function transformAt(transforms: Transform[], index: number): Transform {
  if (transforms.length === 0) return { op: 'none' }
  return transforms[index % transforms.length]!
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
    grain: 'long',
  }
}

/**
 * Хватает ли заготовки на задуманное число плашек.
 *
 * Возвращает недостачу в штуках, 0 — хватает. Питает предупреждение
 * «не хватает длины заготовки» (PLAN.md §День 4); здесь заведено сразу,
 * потому что проверять это должна модель, а не интерфейс.
 */
export function shortfall(project: Project): number {
  let worst = 0
  let pieces: Piece[] = []

  for (const level of project.levels) {
    const input: Piece[] =
      level.source.from === 'lumber' ? level.source.strips.map(stripToPiece) : pieces
    if (input.length === 0) break

    const panel = glueUp(input)
    if (level.cut.kind === 'crosscut') {
      const available = sliceYield(panel.lengthMm, level.cut.sliceWidthMm, level.cut.kerfMm)
      worst = Math.max(worst, level.pieceCount - available)
    }

    pieces =
      level.cut.kind === 'crosscut'
        ? crosscut(panel, level.cut.sliceWidthMm, level.pieceCount)
        : rip(panel, level.cut.sliceWidthMm, level.cut.kerfMm, level.pieceCount)
    pieces = pieces.map((p, idx) => applyTransform(p, transformAt(level.transforms, idx)))
  }

  return Math.max(0, worst)
}
