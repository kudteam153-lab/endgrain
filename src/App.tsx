import { simulate } from './core/simulate.ts'
import { speciesById } from './core/species.ts'
import type { Project } from './core/types.ts'

/**
 * День 1. Экрана ещё нет — ручки и генератор это день 2 и 3 (PLAN.md).
 * Здесь стоит одна зашитая доска: правило недели требует, чтобы к концу дня
 * приложение открывалось по ссылке и что-то показывало, а ядро уже работает.
 */

const DEMO: Project = {
  species: [],
  levels: [
    {
      source: {
        from: 'lumber',
        strips: [
          { speciesId: 'oak', widthMm: 40, thicknessMm: 40, lengthMm: 700 },
          { speciesId: 'maple', widthMm: 40, thicknessMm: 40, lengthMm: 700 },
          { speciesId: 'walnut', widthMm: 40, thicknessMm: 40, lengthMm: 700 },
          { speciesId: 'padauk', widthMm: 40, thicknessMm: 40, lengthMm: 700 },
        ],
      },
      cut: { kind: 'crosscut', angleDeg: 90, sliceWidthMm: 46, kerfMm: 3.2 },
      pieceCount: 6,
      transforms: [
        { op: 'offset', steps: 0 },
        { op: 'offset', steps: 1 },
        { op: 'offset', steps: 2 },
        { op: 'offset', steps: 3 },
      ],
    },
  ],
  boardWMm: 160,
  boardLMm: 240,
  boardHMm: 40,
  units: 'mm',
  seed: 1,
}

export function App() {
  const face = simulate(DEMO)

  return (
    <main className="shell">
      <h1>Генератор узоров торцевых разделочных досок</h1>

      <div className="board">
        <svg viewBox={`0 0 ${face.wMm} ${face.hMm}`} role="img" aria-label="Узор доски">
          {face.cells.map((c, i) => (
            <rect
              key={i}
              x={c.xMm}
              y={c.yMm}
              width={c.wMm}
              height={c.hMm}
              fill={speciesById(c.speciesId).color}
            />
          ))}
        </svg>
      </div>

      <p className="note">
        День 1 из 7: работает ядро — модель столярных операций и расчёт геометрии.
        Узор выше не нарисован, а собран: склейка ламелей, поперечный рез на плашки
        с пропилом 3.2 мм, сдвиг каждого ряда на одну ламель. Ручки, генератор,
        раскрой и PDF — дальше по плану.
      </p>
    </main>
  )
}
