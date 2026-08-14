import type { Species } from './types.ts'

/**
 * Палитра пород под РФ — FACTS.md #F-09.
 *
 * Цвета здесь это данные предметной области, а не токены дизайн-системы:
 * они описывают древесину, а не интерфейс. Файл объявлен token-файлом в
 * `.claude/design-tokens.json`, чтобы порода задавалась в одном месте, а не
 * расползалась хексами по компонентам.
 *
 * Плотность и цена — ориентир для сметы. Цена пересматривается: это рынок,
 * а не константа. Генератор собирает палитру только отсюда — узор из породы,
 * которую негде купить, столяру бесполезен.
 */
export const SPECIES: readonly Species[] = [
  { id: 'oak', name: 'Дуб', color: '#b08c53', densityKgM3: 700, priceM3: 95000 },
  { id: 'ash', name: 'Ясень', color: '#d9c39a', densityKgM3: 680, priceM3: 85000 },
  { id: 'hornbeam', name: 'Граб', color: '#cbb894', densityKgM3: 800, priceM3: 90000 },
  { id: 'walnut', name: 'Орех', color: '#5b4436', densityKgM3: 640, priceM3: 190000 },
  { id: 'maple', name: 'Клён', color: '#e6d7b8', densityKgM3: 690, priceM3: 110000 },
  { id: 'beech', name: 'Бук', color: '#c99a72', densityKgM3: 710, priceM3: 78000 },

  // Экзотика — дороже и не всегда в наличии.
  { id: 'padauk', name: 'Падук', color: '#9c3d24', densityKgM3: 750, priceM3: 320000 },
  { id: 'sapele', name: 'Сапеле', color: '#7d4630', densityKgM3: 640, priceM3: 240000 },
  { id: 'purpleheart', name: 'Амарант', color: '#5e3a5e', densityKgM3: 880, priceM3: 350000 },
  { id: 'zebrawood', name: 'Зебрано', color: '#c2a061', densityKgM3: 800, priceM3: 380000 },
] as const

export const speciesById = (id: string): Species => {
  const found = SPECIES.find((s) => s.id === id)
  if (!found) throw new Error(`Неизвестная порода: ${id}`)
  return found
}
