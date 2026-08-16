import { describe, expect, it } from "vitest";
import { fitDistance, frameFill } from "./fit.ts";
import { VIEWS } from "./views.ts";

/**
 * Требование к объёмному режиму — «деталь видна целиком с разных сторон».
 * Проверяется прямым проецированием восьми углов габаритной коробки: при
 * найденной дистанции ни один угол не выходит за кадр, а стоит подвинуть
 * камеру ближе — выходит. Второе условие важнее первого: без него тест
 * проходила бы и камера, улетевшая на километр.
 */

const FOV = 38;

/** Доски разной формы: квадратная, длинная, узкая, тонкая, толстая. */
const BOARDS = [
  { name: "квадрат 320×320×40", x: 160, y: 20, z: 160 },
  { name: "длинная 250×600×40", x: 125, y: 20, z: 300 },
  { name: "узкая 120×400×40", x: 60, y: 20, z: 200 },
  { name: "тонкая 320×400×12", x: 160, y: 6, z: 200 },
  { name: "толстая 200×250×90", x: 100, y: 45, z: 125 },
];

/** Пропорции окна: широкое, почти квадратное, вертикальное (телефон). */
const ASPECTS = [2.1, 1.4, 1.0, 0.55];

/** Углы обзора: четыре кнопки плюс произвольные промежуточные. */
const ANGLES = [
  ...VIEWS.map((v) => ({ name: v.name, yaw: v.yaw, pitch: v.pitch })),
  { name: "снизу", yaw: 2.2, pitch: -1.1 },
  { name: "через угол", yaw: 0.78, pitch: 0.35 },
  { name: "почти полюс", yaw: -1.9, pitch: 1.52 },
];

describe("кадр детали в объёме", () => {
  for (const board of BOARDS) {
    for (const aspect of ASPECTS) {
      for (const angle of ANGLES) {
        it(`${board.name}, окно ${aspect}, вид «${angle.name}» — деталь целиком`, () => {
          const half = { x: board.x, y: board.y, z: board.z };
          const distance = fitDistance(
            half,
            aspect,
            angle.yaw,
            angle.pitch,
            FOV,
          );
          const fill = frameFill(
            half,
            aspect,
            angle.yaw,
            angle.pitch,
            FOV,
            distance,
          );

          expect(fill.x).toBeLessThanOrEqual(1);
          expect(fill.y).toBeLessThanOrEqual(1);
        });
      }
    }
  }

  it("кадр плотный: хотя бы одна ось упирается в поля", () => {
    // Иначе «влезла» выполняется и для камеры, отъехавшей на километр.
    for (const board of BOARDS) {
      for (const aspect of ASPECTS) {
        for (const angle of ANGLES) {
          const half = { x: board.x, y: board.y, z: board.z };
          const distance = fitDistance(
            half,
            aspect,
            angle.yaw,
            angle.pitch,
            FOV,
          );
          const fill = frameFill(
            half,
            aspect,
            angle.yaw,
            angle.pitch,
            FOV,
            distance,
          );
          // Поля — 7 %, значит заполнение по одной из осей близко к 1/1.07.
          expect(Math.max(fill.x, fill.y)).toBeGreaterThan(0.9);
        }
      }
    }
  });

  it("ближе нельзя: на 10 % ближе деталь вылезает за край", () => {
    for (const board of BOARDS) {
      const half = { x: board.x, y: board.y, z: board.z };
      const distance = fitDistance(half, 1.4, -0.5, 0.62, FOV);
      const fill = frameFill(half, 1.4, -0.5, 0.62, FOV, distance * 0.9);
      expect(Math.max(fill.x, fill.y)).toBeGreaterThan(1);
    }
  });

  it("камера стоит снаружи детали", () => {
    // Дистанция меньше полугабарита означала бы камеру внутри доски.
    for (const board of BOARDS) {
      const half = { x: board.x, y: board.y, z: board.z };
      for (const angle of ANGLES) {
        const distance = fitDistance(half, 1.4, angle.yaw, angle.pitch, FOV);
        expect(distance).toBeGreaterThan(Math.max(half.x, half.y, half.z));
      }
    }
  });
});
