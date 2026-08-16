/**
 * Кадр для детали в объёме.
 *
 * Вынесено из `Board3d.tsx` и не знает про three.js: постановка камеры — это
 * геометрия, а не рендер, и проверять её надо без WebGL. Иначе единственным
 * способом убедиться, что доска влезла в кадр, остаётся посмотреть глазами —
 * а смотреть придётся на каждый ракурс, каждый габарит и каждую пропорцию окна.
 */

/** Полугабариты детали: половина ширины, толщины и длины. */
export interface HalfExtents {
  x: number;
  y: number;
  z: number;
}

type Vec3 = readonly [number, number, number];

const WORLD_UP: Vec3 = [0, 1, 0];

/** Единичный вектор от центра детали к камере. */
export function cameraAxis(yaw: number, pitch: number): Vec3 {
  const flat = Math.cos(pitch);
  return [Math.sin(yaw) * flat, Math.sin(pitch), Math.cos(yaw) * flat];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Базис камеры для поворота — тот же, что построит `lookAt` на цель в нуле. */
export function cameraBasis(axis: Vec3): {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
} {
  const right = normalize(cross(WORLD_UP, axis));
  const up = cross(axis, right);
  const forward: Vec3 = [-axis[0], -axis[1], -axis[2]];
  return { right, up, forward };
}

/** Восемь углов габаритной коробки. */
export function boxCorners(half: HalfExtents): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        out.push([sx * half.x, sy * half.y, sz * half.z]);
  return out;
}

/**
 * Наименьшая дистанция, при которой в кадр попадают все восемь углов.
 *
 * Считается по углам коробки, а не по описанной сфере. Доска плоская: сфера
 * вокруг неё в разы больше самой доски, и при взгляде сбоку деталь оказывалась
 * спичкой посреди пустого поля. Для каждого угла смещение по горизонтали и по
 * вертикали не должно выходить за конус обзора на его собственной глубине;
 * ближний угол требует больше места, чем дальний, поэтому берётся максимум.
 *
 * `margin` сужает угол обзора, оставляя поля вокруг детали.
 */
export function fitDistance(
  half: HalfExtents,
  aspect: number,
  yaw: number,
  pitch: number,
  fovDeg: number,
  margin = 1.07,
): number {
  const axis = cameraAxis(yaw, pitch);
  const { right, up, forward } = cameraBasis(axis);
  const tanV = Math.tan((fovDeg * Math.PI) / 360) / margin;
  const tanH = tanV * aspect;

  let distance = 0;
  for (const p of boxCorners(half)) {
    const depth = dot(p, forward);
    distance = Math.max(
      distance,
      Math.abs(dot(p, right)) / tanH - depth,
      Math.abs(dot(p, up)) / tanV - depth,
    );
  }
  return distance;
}

/**
 * Проверка кадра: во сколько раз деталь заполняет полукадр по каждой оси.
 * Значение ≤ 1 означает «влезла», больше — вылезла за край. Считается прямым
 * проецированием углов, а не тем же выражением, из которого выведена
 * дистанция, — иначе проверка совпала бы с реализацией по построению.
 */
export function frameFill(
  half: HalfExtents,
  aspect: number,
  yaw: number,
  pitch: number,
  fovDeg: number,
  distance: number,
): { x: number; y: number } {
  const axis = cameraAxis(yaw, pitch);
  const { right, up, forward } = cameraBasis(axis);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  const eye: Vec3 = [
    axis[0] * distance,
    axis[1] * distance,
    axis[2] * distance,
  ];

  let x = 0;
  let y = 0;
  for (const p of boxCorners(half)) {
    const rel: Vec3 = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const depth = dot(rel, forward);
    if (depth <= 0) return { x: Infinity, y: Infinity };
    x = Math.max(x, Math.abs(dot(rel, right)) / (depth * tanH));
    y = Math.max(y, Math.abs(dot(rel, up)) / (depth * tanV));
  }
  return { x, y };
}
