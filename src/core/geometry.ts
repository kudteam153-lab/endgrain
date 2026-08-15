import type { Cell, Face, Grain, Piece, Transform } from "./types.ts";

/**
 * Геометрия лица: склейка, рез, трансформы.
 *
 * Всё считается в миллиметрах и округляется до микрона перед сравнением:
 * ширины ламелей складываются десятками раз, и без округления два одинаковых
 * узора расходятся в двенадцатом знаке. Тест на детерминированность ловил бы
 * это как разные доски.
 */

const MICRON = 1e-3;

/** Округление до микрона. Столярная точность — десятая миллиметра, запас есть. */
export const mm = (v: number): number => Math.round(v / MICRON) * MICRON;

const cell = (
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  speciesId: string,
): Cell => ({
  xMm: mm(xMm),
  yMm: mm(yMm),
  wMm: mm(wMm),
  hMm: mm(hMm),
  speciesId,
});

/** Ячейки в устойчивом порядке: сверху вниз, слева направо. */
const sortCells = (cells: Cell[]): Cell[] =>
  [...cells].sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);

const face = (wMm: number, hMm: number, cells: Cell[]): Face => ({
  wMm: mm(wMm),
  hMm: mm(hMm),
  cells: sortCells(cells),
});

/**
 * Склейка заготовок.
 *
 * Ось не параметр, а следствие направления волокна (см. `Grain`): ламели
 * клеятся кромка к кромке и лицо растёт по X, плашки торцом вверх ложатся
 * рядом и лицо растёт по Y. Склеить заготовки с разным волокном нельзя —
 * это не ограничение модели, это то, что не собирается на верстаке.
 */
export function glueUp(pieces: Piece[]): Piece {
  if (pieces.length === 0) throw new Error("Склейка без заготовок");

  const grain = pieces[0]!.grain;
  const mixed = pieces.find((p) => p.grain !== grain);
  if (mixed) {
    throw new Error(
      `Склейка заготовок с разным волокном (${grain} и ${mixed.grain}) — так доска не собирается`,
    );
  }

  const cells: Cell[] = [];
  let wMm = 0;
  let hMm = 0;

  if (grain === "long") {
    for (const p of pieces) {
      for (const c of p.face.cells) {
        cells.push(cell(wMm + c.xMm, c.yMm, c.wMm, c.hMm, c.speciesId));
      }
      wMm += p.face.wMm;
      hMm = Math.max(hMm, p.face.hMm);
    }
  } else {
    for (const p of pieces) {
      for (const c of p.face.cells) {
        cells.push(cell(c.xMm, hMm + c.yMm, c.wMm, c.hMm, c.speciesId));
      }
      hMm += p.face.hMm;
      wMm = Math.max(wMm, p.face.wMm);
    }
  }

  return {
    face: face(wMm, hMm, cells),
    // Длину панели задаёт самая короткая заготовка: длиннее её склейка не будет.
    lengthMm: Math.min(...pieces.map((p) => p.lengthMm)),
    grain,
  };
}

/**
 * Поперечный рез: панель разваливается на плашки, у каждой лицо родителя,
 * а волокно разворачивается в торец. Именно этот рез делает доску торцевой.
 *
 * `count` — сколько плашек берём, а не сколько выйдет. Сколько выйдет,
 * считает `sliceYield` — расхождение между ними это отход (FACTS.md #F-03).
 */
export function crosscut(
  panel: Piece,
  sliceWidthMm: number,
  count: number,
): Piece[] {
  if (count < 1) throw new Error("Поперечный рез без плашек");
  return Array.from({ length: count }, () => ({
    face: face(
      panel.face.wMm,
      panel.face.hMm,
      panel.face.cells.map((c) => ({ ...c })),
    ),
    lengthMm: mm(sliceWidthMm),
    grain: "end" as Grain,
  }));
}

/**
 * Сколько плашек выйдет из заготовки. Последний кусок в счёт не идёт:
 * короткий остаток нельзя безопасно подать на пилу (FACTS.md #F-03).
 */
export function sliceYield(
  panelLengthMm: number,
  sliceWidthMm: number,
  kerfMm: number,
): number {
  const step = sliceWidthMm + kerfMm;
  if (step <= 0) return 0;
  return Math.max(0, Math.floor(panelLengthMm / step));
}

/**
 * Продольный рез: панель режется на полосы по X, волокно не трогается.
 * Ячейки, попавшие под диск, обрезаются по границе полосы.
 *
 * Ширина пропила уносит материал: полоса `i` начинается на
 * `i * (sliceWidthMm + kerfMm)`, а не на `i * sliceWidthMm`. Считать без
 * пропила значит получить узор, который на верстаке уедет на 3.2 мм за полосу.
 */
export function rip(
  panel: Piece,
  sliceWidthMm: number,
  kerfMm: number,
  count: number,
): Piece[] {
  if (count < 1) throw new Error("Продольный рез без полос");
  const step = sliceWidthMm + kerfMm;
  const out: Piece[] = [];

  for (let i = 0; i < count; i++) {
    const x0 = i * step;
    const x1 = x0 + sliceWidthMm;
    const cells: Cell[] = [];

    for (const c of panel.face.cells) {
      const left = Math.max(c.xMm, x0);
      const right = Math.min(c.xMm + c.wMm, x1);
      if (right - left > MICRON) {
        cells.push(cell(left - x0, c.yMm, right - left, c.hMm, c.speciesId));
      }
    }

    out.push({
      face: face(sliceWidthMm, panel.face.hMm, cells),
      lengthMm: panel.lengthMm,
      grain: panel.grain,
    });
  }

  return out;
}

/**
 * Циклический сдвиг лица по X. То, что уехало за правый край, заходит слева.
 *
 * Это не трюк рендера, а честная геометрия ряда со смещением: физически
 * крайние элементы получаются обрезанными по месту склейки, и в кут-листе
 * они пойдут отдельными строками половинной ширины (FACTS.md #F-07).
 */
export function shiftX(f: Face, dxMm: number): Face {
  const w = f.wMm;
  if (w <= 0) return f;
  const dx = ((dxMm % w) + w) % w;
  if (dx < MICRON)
    return face(
      f.wMm,
      f.hMm,
      f.cells.map((c) => ({ ...c })),
    );

  const cells: Cell[] = [];
  for (const c of f.cells) {
    // Начало приводится по модулю ширины СРАЗУ. Без этого ячейка, уехавшая за
    // правый край целиком (start >= w — а так бывает на каждом сдвиге, кратном
    // ширине ламели), давала отрицательную «голову», и хвост получался шире
    // самой ячейки: он ложился поверх соседа и подменял его породу. На
    // диагонали это съедало по ламели в каждом ряду.
    const start = (c.xMm + dx) % w;
    const end = start + c.wMm;

    if (end <= w + MICRON) {
      cells.push(cell(start, c.yMm, c.wMm, c.hMm, c.speciesId));
      continue;
    }

    // Ячейка перешла через правый край — разрезаем по месту склейки.
    // start строго меньше w, поэтому обе части положительны по построению.
    const headW = w - start;
    if (headW > MICRON)
      cells.push(cell(start, c.yMm, headW, c.hMm, c.speciesId));
    const tailW = c.wMm - headW;
    if (tailW > MICRON) cells.push(cell(0, c.yMm, tailW, c.hMm, c.speciesId));
  }
  return face(f.wMm, f.hMm, cells);
}

/**
 * Верхний ряд ячеек, слева направо.
 *
 * Он же — период узора по ширине: на первой склейке это ламели, после
 * переклейки — колонки уже двумерного рисунка. Сдвиги считаются от него, и
 * поэтому «на одну ламель» продолжает означать «на одну колонку» и на
 * трёхуровневой доске.
 */
export function topRow(f: Face): Cell[] {
  const topY = Math.min(...f.cells.map((c) => c.yMm));
  return f.cells
    .filter((c) => Math.abs(c.yMm - topY) < MICRON)
    .sort((a, b) => a.xMm - b.xMm);
}

/** Сумма ширин первых `steps` ячеек верхнего ряда — шаг сдвига для шахматки. */
function stepWidth(f: Face, steps: number): number {
  const row = topRow(f);
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const c = row[i % row.length];
    if (c) sum += c.wMm;
  }
  return sum;
}

/** Первая ячейка верхнего ряда — от неё считается кирпичное смещение. */
function firstCellWidth(f: Face): number {
  return topRow(f)[0]?.wMm ?? 0;
}

export function applyTransform(piece: Piece, t: Transform): Piece {
  const f = piece.face;
  const { wMm, hMm } = f;

  switch (t.op) {
    case "none":
      return piece;

    case "flip180":
      return {
        ...piece,
        face: face(
          wMm,
          hMm,
          f.cells.map((c) =>
            cell(
              wMm - c.xMm - c.wMm,
              hMm - c.yMm - c.hMm,
              c.wMm,
              c.hMm,
              c.speciesId,
            ),
          ),
        ),
      };

    case "mirror":
      return {
        ...piece,
        face: face(
          wMm,
          hMm,
          f.cells.map((c) =>
            cell(wMm - c.xMm - c.wMm, c.yMm, c.wMm, c.hMm, c.speciesId),
          ),
        ),
      };

    case "rot90":
      return {
        ...piece,
        face: face(
          hMm,
          wMm,
          f.cells.map((c) =>
            t.dir === "cw"
              ? cell(hMm - c.yMm - c.hMm, c.xMm, c.hMm, c.wMm, c.speciesId)
              : cell(c.yMm, wMm - c.xMm - c.wMm, c.hMm, c.wMm, c.speciesId),
          ),
        ),
      };

    case "halfWidth":
      return { ...piece, face: shiftX(f, firstCellWidth(f) / 2) };

    case "offset":
      return { ...piece, face: shiftX(f, stepWidth(f, t.steps)) };
  }
}
