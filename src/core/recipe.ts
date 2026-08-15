import { SPECIES } from './species.ts'
import type { Project, Strip, Transform } from './types.ts'

/**
 * Рецепт — то, чем крутит человек. Модель операций (`Project`, #D-01) остаётся
 * источником истины, но собирать стек склеек и резов руками столяру незачем:
 * он думает ламелями, размерами доски и узором.
 *
 * Односторонняя связь: рецепт → проект. Обратной нет намеренно. Иначе
 * появятся два способа описать одну доску, и однажды они разойдутся —
 * ровно то, что запрещает `CORE_PRINCIPLES.md §2.2`.
 */

/** Припуск на выравнивание, по 3 мм на сторону — FACTS.md #F-02. */
export const FLATTENING_ALLOWANCE_MM = 3

/** Ширина пропила по умолчанию — FACTS.md #F-01. */
export const DEFAULT_KERF_MM = 3.2

export type PatternId = 'stripe' | 'checker' | 'brick' | 'diamond' | 'mirror'

export interface Lamella {
  speciesId: string
  widthMm: number
}

export interface Recipe {
  /** Ламели первой склейки слева направо. Их сумма и есть ширина доски. */
  lamellas: Lamella[]
  /** Толщина ламели = высота ряда на готовой доске. */
  lamellaThicknessMm: number
  /** Длина исходной заготовки — из неё нарезаются плашки (#F-03). */
  blankLengthMm: number
  boardLMm: number
  boardHMm: number
  kerfMm: number
  pattern: PatternId
  units: 'mm' | 'in'
  seed: number
}

export const PATTERNS: ReadonlyArray<{ id: PatternId; name: string; hint: string }> = [
  { id: 'stripe', name: 'Полоса', hint: 'ряды не смещаются' },
  { id: 'checker', name: 'Шахматка', hint: 'каждый второй ряд на ламель' },
  { id: 'brick', name: 'Кирпич', hint: 'на половину ламели, с крайними полуплашками' },
  { id: 'diamond', name: 'Диагональ', hint: 'нарастающий сдвиг ряд за рядом' },
  { id: 'mirror', name: 'Зеркало', hint: 'каждый второй ряд отражён' },
]

/** Ширина доски — сумма ламелей. Это не настройка, а следствие раскладки. */
export const boardWidth = (r: Recipe): number =>
  r.lamellas.reduce((sum, l) => sum + l.widthMm, 0)

/** Сколько рядов плашек нужно на заданную длину доски. */
export const rowCount = (r: Recipe): number =>
  Math.max(1, Math.round(r.boardLMm / r.lamellaThicknessMm))

/**
 * Ширина реза плашки = финальная толщина + 2 × припуск (#F-02).
 * Считать от финальной толщины напрямую — получить доску тоньше заявленной
 * после шлифовки.
 */
export const sliceWidth = (r: Recipe): number => r.boardHMm + 2 * FLATTENING_ALLOWANCE_MM

/** Последовательность трансформов узора. Длина подстраивается под раскладку. */
export function patternTransforms(pattern: PatternId, lamellaCount: number): Transform[] {
  switch (pattern) {
    case 'stripe':
      return [{ op: 'none' }]
    case 'checker':
      return [{ op: 'none' }, { op: 'offset', steps: 1 }]
    case 'brick':
      return [{ op: 'none' }, { op: 'halfWidth' }]
    case 'mirror':
      return [{ op: 'none' }, { op: 'mirror' }]
    case 'diamond':
      // Сдвиг растёт на ламель в каждом ряду и замыкается на ширине доски —
      // отсюда диагональ, а не лесенка в никуда.
      return Array.from({ length: Math.max(2, lamellaCount) }, (_, i) => ({
        op: 'offset' as const,
        steps: i,
      }))
  }
}

/** Рецепт → стек столярных операций. */
export function buildProject(r: Recipe): Project {
  const strips: Strip[] = r.lamellas.map((l) => ({
    speciesId: l.speciesId,
    widthMm: l.widthMm,
    thicknessMm: r.lamellaThicknessMm,
    lengthMm: r.blankLengthMm,
  }))

  return {
    species: [...SPECIES],
    levels: [
      {
        source: { from: 'lumber', strips },
        cut: {
          kind: 'crosscut',
          angleDeg: 90,
          sliceWidthMm: sliceWidth(r),
          kerfMm: r.kerfMm,
        },
        pieceCount: rowCount(r),
        transforms: patternTransforms(r.pattern, r.lamellas.length),
      },
    ],
    boardWMm: boardWidth(r),
    boardLMm: rowCount(r) * r.lamellaThicknessMm,
    boardHMm: r.boardHMm,
    units: r.units,
    seed: r.seed,
  }
}

export const DEFAULT_RECIPE: Recipe = {
  lamellas: [
    { speciesId: 'oak', widthMm: 40 },
    { speciesId: 'maple', widthMm: 40 },
    { speciesId: 'walnut', widthMm: 40 },
    { speciesId: 'maple', widthMm: 40 },
    { speciesId: 'oak', widthMm: 40 },
    { speciesId: 'padauk', widthMm: 40 },
    { speciesId: 'maple', widthMm: 40 },
    { speciesId: 'walnut', widthMm: 40 },
  ],
  lamellaThicknessMm: 40,
  blankLengthMm: 800,
  boardLMm: 400,
  boardHMm: 40,
  kerfMm: DEFAULT_KERF_MM,
  pattern: 'diamond',
  units: 'mm',
  seed: 1,
}
