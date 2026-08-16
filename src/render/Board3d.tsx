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
import { cameraAxis, fitDistance } from "./fit.ts";
import { VIEWS } from "./views.ts";
import type { ViewId } from "./views.ts";
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

/**
 * Наклон ограничен почти-полюсами. На самом полюсе камера смотрит вдоль своей
 * же оси «вверх», и картинка срывается в неуправляемый переворот. Снизу обзор
 * оставлен намеренно: тыльная сторона доски — тоже торец, и мастер имеет право
 * посмотреть, что там за узор.
 */
const PITCH_LIMIT = 1.53;

/** Матовое дерево: блик по всей плоскости выглядит пластиком, а не доской. */
const MATERIAL = new MeshLambertMaterial({ vertexColors: false });

interface Props {
  face: Face;
  thicknessMm: number;
  view: ViewId;
}

export function Board3d({ face, thicknessMm, view }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  /**
   * Мост из React в сцену. Сцена живёт в замыкании эффекта и пересобирается
   * только при смене доски; смена вида не должна ронять и собирать её заново —
   * это лишние полсекунды и потерянный угол поворота.
   */
  const applyView = useRef<((id: ViewId) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || face.cells.length === 0) return;

    const scene = new Scene();
    scene.background = new Color(readToken("--table", "#e8e8e4"));

    const FOV = 38;
    const camera = new PerspectiveCamera(FOV, 1, 1, 5000);
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

    /** Полугабариты детали. Постановка камеры считается по ним (`fit.ts`). */
    const half = {
      x: face.wMm / 2,
      y: Math.max(thicknessMm, 1) / 2,
      z: face.hMm / 2,
    };

    let yaw: number = VIEWS[0].yaw;
    let pitch: number = VIEWS[0].pitch;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const place = () => {
      const distance = fitDistance(half, camera.aspect, yaw, pitch, FOV);
      const [ax, ay, az] = cameraAxis(yaw, pitch);
      camera.position.set(ax * distance, ay * distance, az * distance);
      camera.lookAt(0, 0, 0);
    };

    const draw = () => {
      place();
      renderer.render(scene, camera);
    };

    const resize = () => {
      const box = host.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      renderer.setSize(box.width, box.height, false);
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    applyView.current = (id) => {
      const preset = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
      yaw = preset.yaw;
      pitch = preset.pitch;
      draw();
    };

    /**
     * Вращение мышью и пальцем по двум осям. Своё, а не OrbitControls: нужны
     * поворот и наклон вокруг центра детали, без панорамирования и зума —
     * увести деталь из кадра здесь нечем, и это сделано намеренно.
     */
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.01;
      pitch = clamp(
        pitch + (e.clientY - lastY) * 0.01,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
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
      applyView.current = null;
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

  useEffect(() => {
    applyView.current?.(view);
  }, [view]);

  return (
    <div
      ref={hostRef}
      className="board-3d"
      role="img"
      aria-label="Доска в объёме, поворачивается перетаскиванием"
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Цвет из токена дизайн-системы: three.js про CSS-переменные не знает. */
function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}
