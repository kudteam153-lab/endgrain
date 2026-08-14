import type { Face } from './types.ts'

/**
 * Отрисовка лица в ASCII — для тестов.
 *
 * Узор проверяется глазами, а не сравнением списка координат: список из сорока
 * прямоугольников при падении теста ничего не сообщает, а сдвинутый ряд в
 * ASCII виден сразу. Каждая порода — своя буква (первая буква `id`).
 *
 * Сетка строится по фактическим границам ячеек, а не по фиксированному шагу:
 * кирпичное смещение даёт полуширинные элементы, и сетка обязана их показать.
 */
export function renderAscii(face: Face): string {
  const EPS = 1e-6
  const bounds = (values: number[]): number[] =>
    [...new Set(values.map((v) => Math.round(v * 1e3) / 1e3))].sort((a, b) => a - b)

  const xs = bounds([...face.cells.flatMap((c) => [c.xMm, c.xMm + c.wMm]), 0, face.wMm])
  const ys = bounds([...face.cells.flatMap((c) => [c.yMm, c.yMm + c.hMm]), 0, face.hMm])

  const rows: string[] = []
  for (let r = 0; r < ys.length - 1; r++) {
    const my = (ys[r]! + ys[r + 1]!) / 2
    let row = ''
    for (let c = 0; c < xs.length - 1; c++) {
      const mx = (xs[c]! + xs[c + 1]!) / 2
      const hit = face.cells.find(
        (cell) =>
          mx > cell.xMm - EPS &&
          mx < cell.xMm + cell.wMm + EPS &&
          my > cell.yMm - EPS &&
          my < cell.yMm + cell.hMm + EPS,
      )
      row += hit ? hit.speciesId[0] : '·'
    }
    rows.push(row)
  }
  return rows.join('\n')
}

/** Все породы, встречающиеся на лице. Для проверки палитры узора. */
export function speciesOnFace(face: Face): string[] {
  return [...new Set(face.cells.map((c) => c.speciesId))].sort()
}
