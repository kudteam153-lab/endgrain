import { describe, expect, it } from 'vitest'
import { glueUp, shiftX } from './geometry.ts'
import { simulate, shortfall } from './simulate.ts'
import { renderAscii } from './testing.ts'
import type { Face, Project, Strip, Transform } from './types.ts'

/**
 * Проверка гипотезы дня 1 (DECISIONS.md #D-01): узор торцевой доски выражается
 * стеком столярных операций. Пять канонических узоров — полоса, шахматка,
 * кирпич, ромб, плед. Не выразился хоть один — правится модель, а не тест.
 *
 * Узор сравнивается по ASCII-сетке: сдвинутый ряд виден глазом, а список из
 * сорока прямоугольников при падении не сообщает ничего.
 */

const KERF = 3.2 // FACTS.md #F-01
const SLICE = 46 // толщина доски 40 + 2 × 3 припуска на выравнивание, #F-02

const strip = (speciesId: string, widthMm: number, thicknessMm: number): Strip => ({
  speciesId,
  widthMm,
  thicknessMm,
  lengthMm: 600,
})

/** Двухуровневая доска: склейка ламелей → поперечный рез → склейка плашек. */
const twoLevel = (strips: Strip[], rows: number, transforms: Transform[]): Project => ({
  species: [],
  levels: [
    {
      source: { from: 'lumber', strips },
      cut: { kind: 'crosscut', angleDeg: 90, sliceWidthMm: SLICE, kerfMm: KERF },
      pieceCount: rows,
      transforms,
    },
  ],
  boardWMm: strips.reduce((s, x) => s + x.widthMm, 0),
  boardLMm: rows * (strips[0]?.thicknessMm ?? 0),
  boardHMm: 40,
  units: 'mm',
  seed: 1,
})

describe('узор 1 — полоса', () => {
  it('даёт вертикальные полосы пород в порядке склейки', () => {
    const face = simulate(
      twoLevel([strip('oak', 40, 20), strip('maple', 40, 20), strip('walnut', 40, 20)], 5, []),
    )

    expect(renderAscii(face)).toBe(
      ['omw', 'omw', 'omw', 'omw', 'omw'].join('\n'),
    )
    expect(face.wMm).toBe(120)
    expect(face.hMm).toBe(100)
  })
})

describe('узор 2 — шахматка', () => {
  it('собирается сдвигом каждого второго ряда на одну ламель', () => {
    const strips = [
      strip('oak', 40, 40),
      strip('maple', 40, 40),
      strip('oak', 40, 40),
      strip('maple', 40, 40),
    ]
    const face = simulate(twoLevel(strips, 4, [{ op: 'none' }, { op: 'offset', steps: 1 }]))

    expect(renderAscii(face)).toBe(
      ['omom', 'momo', 'omom', 'momo'].join('\n'),
    )
  })
})

describe('узор 3 — кирпич', () => {
  it('сдвигает ряд на половину ламели и сам рождает крайние полуплашки', () => {
    // FACTS.md #F-07: кирпичный офсет требует крайнего элемента половинной
    // ширины. В модели он не задаётся — он возникает: то, что уехало за правый
    // край склейки, заходит слева. Если бы не возникал, модель была бы неполна.
    const strips = [
      strip('oak', 40, 20),
      strip('maple', 40, 20),
      strip('oak', 40, 20),
      strip('maple', 40, 20),
    ]
    const face = simulate(twoLevel(strips, 4, [{ op: 'none' }, { op: 'halfWidth' }]))

    expect(renderAscii(face)).toBe(
      ['oommoomm', 'moommoom', 'oommoomm', 'moommoom'].join('\n'),
    )

    // Крайние элементы сдвинутого ряда — ровно половинной ширины.
    const shifted = face.cells.filter((c) => Math.abs(c.yMm - 20) < 1e-6)
    expect(shifted.some((c) => c.xMm === 0 && c.wMm === 20)).toBe(true)
    expect(shifted.some((c) => Math.abs(c.xMm + c.wMm - face.wMm) < 1e-6 && c.wMm === 20)).toBe(true)
  })
})

describe('узор 4 — ромб', () => {
  it('нарастающий сдвиг ряда за рядом даёт диагонали', () => {
    const strips = [
      strip('oak', 40, 40),
      strip('maple', 40, 40),
      strip('walnut', 40, 40),
      strip('padauk', 40, 40),
    ]
    const face = simulate(
      twoLevel(strips, 4, [
        { op: 'offset', steps: 0 },
        { op: 'offset', steps: 1 },
        { op: 'offset', steps: 2 },
        { op: 'offset', steps: 3 },
      ]),
    )

    expect(renderAscii(face)).toBe(
      ['omwp', 'pomw', 'wpom', 'mwpo'].join('\n'),
    )
  })
})

describe('узор 5 — плед, три склейки', () => {
  /**
   * Три склейки, а не три «уровня» в массиве: склеек всегда на одну больше,
   * чем резов. Первая собирает ламели, продольный рез даёт полосы, поворот на
   * 90° ставит рисунок вертикально, вторая склейка собирает из них панель уже
   * с двумерным рисунком, поперечный рез даёт плашки, третья склейка — доска.
   */
  const plaid: Project = {
    species: [],
    levels: [
      {
        source: {
          from: 'lumber',
          strips: [strip('oak', 60, 20), strip('maple', 60, 20)],
        },
        cut: { kind: 'rip', angleDeg: 90, sliceWidthMm: 25, kerfMm: KERF },
        pieceCount: 4,
        transforms: [{ op: 'rot90', dir: 'cw' }],
      },
      {
        source: { from: 'previous' },
        cut: { kind: 'crosscut', angleDeg: 90, sliceWidthMm: SLICE, kerfMm: KERF },
        pieceCount: 4,
        transforms: [{ op: 'none' }, { op: 'offset', steps: 1 }],
      },
    ],
    boardWMm: 80,
    boardLMm: 100,
    boardHMm: 40,
    units: 'mm',
    seed: 1,
  }

  it('собирается без ошибок и даёт рисунок, поделённый по обеим осям', () => {
    const face = simulate(plaid)

    expect(face.wMm).toBe(80)
    expect(face.hMm).toBe(100)

    // Двумерность: в лице есть и вертикальные, и горизонтальные границы
    // внутри рядов — иначе это полоса или шахматка, а не плед.
    const xEdges = new Set(face.cells.map((c) => c.xMm))
    const yEdges = new Set(face.cells.map((c) => c.yMm))
    expect(xEdges.size).toBeGreaterThan(2)
    expect(yEdges.size).toBeGreaterThan(2)
  })

  it('продольный рез уносит пропил: полосы съезжают относительно ламелей', () => {
    // Полоса i начинается на i × (25 + 3.2), а не на i × 25. Именно поэтому
    // третья полоса захватывает обе породы: 56.4…81.4 переходит границу на 60.
    const face = simulate(plaid)
    expect(renderAscii(face)).toMatchSnapshot()
  })
})

describe('инварианты модели', () => {
  it('детерминирован: один проект — одно лицо', () => {
    const p = twoLevel([strip('oak', 40, 20), strip('maple', 40, 20)], 4, [
      { op: 'none' },
      { op: 'halfWidth' },
    ])
    expect(JSON.stringify(simulate(p))).toBe(JSON.stringify(simulate(p)))
  })

  it('угловой рез отвергается, а не отдаётся ортогональю молча', () => {
    const p = twoLevel([strip('oak', 40, 20)], 2, [])
    p.levels[0]!.cut.angleDeg = 45
    expect(() => simulate(p)).toThrow(/только ортогональ/)
  })

  it('склейка заготовок с разным волокном невозможна', () => {
    // Плашка торцом вверх и длинная ламель рядом не склеиваются на верстаке —
    // и не должны склеиваться в модели (CORE_PRINCIPLES §2.1). Проверяется на
    // самой склейке, а не через simulate: собрать такой Project штатным путём
    // нельзя, и это ровно то свойство, которое хочется зафиксировать.
    const lamella = {
      face: { wMm: 40, hMm: 20, cells: [{ xMm: 0, yMm: 0, wMm: 40, hMm: 20, speciesId: 'oak' }] },
      lengthMm: 600,
      grain: 'long' as const,
    }
    const block = { ...lamella, grain: 'end' as const }

    expect(() => glueUp([lamella, block])).toThrow(/разным волокном/)
    expect(() => glueUp([lamella, lamella])).not.toThrow()
  })

  it('считает недостачу заготовки, а не молчит о ней', () => {
    // 600 мм при плашке 46 и пропиле 3.2 дают 12 штук (#F-03). Просим 20.
    const p = twoLevel([strip('oak', 40, 20)], 20, [])
    expect(shortfall(p)).toBe(8)
  })
})

describe('регрессия — сдвиг, кратный ширине ламели', () => {
  /**
   * Ловится только глазами на готовом узоре: модель отдавала верное число
   * ячеек, ASCII-сетка показывала правильную диагональ (она берёт первое
   * попадание в точку), а на экране ряд терял ламель — ячейка двойной ширины
   * ложилась поверх соседа и подменяла породу.
   *
   * Причина: начало не приводилось по модулю ширины, и у ячейки, уехавшей за
   * правый край целиком, «голова» уходила в минус. Такой сдвиг случается на
   * каждом ряду диагонали — то есть на самом заметном узоре из пяти.
   */
  const row: Face = {
    wMm: 320,
    hMm: 40,
    cells: Array.from({ length: 8 }, (_, i) => ({
      xMm: i * 40,
      yMm: 0,
      wMm: 40,
      hMm: 40,
      speciesId: `s${i}`,
    })),
  }

  it('сохраняет число ячеек и их ширины на любом сдвиге', () => {
    for (const dx of [0, 20, 40, 80, 120, 200, 280, 320, 360]) {
      const out = shiftX(row, dx)
      const total = out.cells.reduce((s, c) => s + c.wMm, 0)
      expect(total, `сумма ширин при dx=${dx}`).toBeCloseTo(row.wMm, 6)
      expect(out.cells.every((c) => c.wMm > 0), `положительные ширины при dx=${dx}`).toBe(true)
      expect(
        out.cells.every((c) => c.xMm >= 0 && c.xMm + c.wMm <= row.wMm + 1e-6),
        `ячейки внутри ширины при dx=${dx}`,
      ).toBe(true)
    }
  })

  it('не теряет ни одной породы на сдвиге в целую ламель', () => {
    for (const dx of [40, 80, 120, 200]) {
      const out = shiftX(row, dx)
      const species = new Set(out.cells.map((c) => c.speciesId))
      expect(species.size, `пород на месте при dx=${dx}`).toBe(8)
    }
  })

  it('диагональ на восьми ламелях не съедает ламели по краю', () => {
    const strips = ['oak', 'maple', 'walnut', 'maple', 'oak', 'padauk', 'maple', 'walnut'].map(
      (id) => strip(id, 40, 40),
    )
    const face = simulate(
      twoLevel(
        strips,
        8,
        Array.from({ length: 8 }, (_, i) => ({ op: 'offset' as const, steps: i })),
      ),
    )
    // Каждый ряд — та же последовательность, только провёрнутая. Значит в
    // любом ряду ровно столько же ячеек, сколько ламелей.
    for (let r = 0; r < 8; r++) {
      const inRow = face.cells.filter((c) => Math.abs(c.yMm - r * 40) < 1e-6)
      expect(inRow.length, `ячеек в ряду ${r}`).toBe(8)
    }
  })
})
