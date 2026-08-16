import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { speciesById } from "../core/species.ts";
import type { Face } from "../core/types.ts";
import "./Board3d.css";

/**
 * Доска в объёме (`#D-04`).
 *
 * Геометрия берётся из того же лица, что и чертёж: каждая ячейка узора —
 * брусок высотой в толщину доски. Второй модели доски здесь нет, иначе
 * объём однажды разошёлся бы с чертежом и с раскроем, и заметил бы это
 * человек, который уже отпилил (`CORE_PRINCIPLES.md §2.2`).
 *
 * `InstancedMesh` вместо отдельных мешей — митигация риска, записанного в
 * `#D-04` заранее: на доске из 400 плашек это одна отрисовка вместо четырёх
 * сотен. Плоские цвета пород, никакой текстуры волокна: она стоила бы кадров
 * ровно там, где жюри крутит доску мышью.
 */

interface Props {
  face: Face;
  thicknessMm: number;
}

/** Матовое дерево: блик по всей плоскости выглядит пластиком, а не доской. */
const MATERIAL = new MeshLambertMaterial({ vertexColors: false });

export function Board3d({ face, thicknessMm }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || face.cells.length === 0) return;

    const scene = new Scene();
    scene.background = new Color(readToken("--table", "#e8e8e4"));

    const camera = new PerspectiveCamera(38, 1, 1, 5000);
    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.append(renderer.domElement);

    // Свет сверху-сбоку плюс мягкая заливка снизу: торцевая доска читается
    // фасками между плашками, а в лоб освещённая превращается в плоский ковёр.
    scene.add(new HemisphereLight(0xffffff, 0x6b6b63, 1.5));
    const key = new DirectionalLight(0xffffff, 1.9);
    key.position.set(-0.6, 1, 0.75);
    scene.add(key);

    const geometry = new BoxGeometry(1, 1, 1);
    const mesh = new InstancedMesh(geometry, MATERIAL, face.cells.length);
    const matrix = new Matrix4();
    const color = new Color();

    // Фаска: каждый брусок чуть меньше своей ячейки, и между плашками
    // остаётся тень. Без неё соседи одного тона сливаются в пятно.
    const GAP = 0.35;

    for (const [i, cell] of face.cells.entries()) {
      const w = Math.max(0.2, cell.wMm - GAP);
      const h = Math.max(0.2, cell.hMm - GAP);
      matrix.makeScale(w, thicknessMm, h);
      matrix.setPosition(
        cell.xMm + cell.wMm / 2 - face.wMm / 2,
        0,
        cell.yMm + cell.hMm / 2 - face.hMm / 2,
      );
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(speciesById(cell.speciesId).color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    // Камера смотрит на доску сверху-сбоку — так видно и узор, и толщину.
    const span = Math.max(face.wMm, face.hMm);
    let angle = -0.5;
    let dragging = false;
    let lastX = 0;

    const place = () => {
      // Расстояние от длинной стороны доски, а не фиксированное: маленькая
      // доска не должна теряться в кадре, большая — вылезать за него.
      const distance = span * 1.25;
      camera.position.set(
        Math.sin(angle) * distance,
        distance * 0.62,
        Math.cos(angle) * distance,
      );
      camera.lookAt(0, 0, 0);
    };

    const resize = () => {
      const box = host.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      renderer.setSize(box.width, box.height, false);
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
      place();
      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    /** Вращение мышью и пальцем. Своё, а не OrbitControls: нужна одна ось. */
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      angle -= (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
      place();
      renderer.render(scene, camera);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      host.releasePointerCapture(e.pointerId);
    };

    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);

    return () => {
      observer.disconnect();
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      geometry.dispose();
      mesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [face, thicknessMm]);

  return (
    <div
      ref={hostRef}
      className="board-3d"
      role="img"
      aria-label="Доска в объёме, вращается перетаскиванием"
    />
  );
}

/** Цвет из токена дизайн-системы: three.js про CSS-переменные не знает. */
function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}
