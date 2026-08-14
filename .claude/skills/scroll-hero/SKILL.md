---
name: scroll-hero
description: Build Apple-style scroll-driven hero sections — the effect where scrolling animates a product/visual frame-by-frame on a pinned canvas (like Apple's AirPods/iPhone pages). Use this whenever the user wants a "стоп-скролл" / scroll animation / scrollytelling / Apple-style landing / pinned sticky hero / scroll-triggered reveal, or mentions animating a product on scroll, a frame sequence on canvas, or a premium hero that "comes alive" as you scroll — even if they don't name the technique explicitly. Covers two paths — a lightweight CSS-transform hero (no assets needed, ships today) and the full canvas frame-sequence pipeline (video to ffmpeg frames to canvas) for maximum polish.
---

# Scroll Hero

Build the "stop-scroll" effect: as the user scrolls, a pinned section stays fixed while a visual animates — either real frame-by-frame footage drawn on `<canvas>`, or product elements transformed with CSS. This is what Apple does for product pages. It is **not** a `<video>` element and **not** a CSS keyframe loop — the animation position is driven directly by scroll progress.

## Decide the path first

Two implementations. Pick before writing code; ask the user if unclear.

**Path A — CSS-transform hero (default starting point).**
No image assets required. Product elements (cards, layers, device parts) are real DOM nodes animated via `transform` tied to scroll progress. Ships immediately, looks premium, trivial to edit copy/colors. Best when: there's no rendered footage yet, the "product" decomposes into a few elements (a deck of cards fanning, layers separating, a logo assembling), or you want a working result in one pass. Start here unless the user has frames/video.

**Path B — Canvas frame sequence (maximum fidelity).**
A real video (filmed or AI-generated) is cut into 60–240 WebP frames; scroll progress selects which frame to `drawImage` on a canvas. Best when: the user has or will produce footage, or the motion is photographic (a real object rotating, liquid pouring, a complex 3D reveal) that CSS can't fake. Heavier (frame loading, preload screen), but frame-perfect.

You can ship A now and migrate to B later without changing the page structure — both use the same `#scrolltrack` + `sticky #stage` skeleton.

## Core mechanics (both paths)

The skeleton never changes:

```html
<section id="scrolltrack">      <!-- tall: defines scroll length, e.g. height: 360vh -->
  <div id="stage">                <!-- position: sticky; top:0; height:100vh -->
    <!-- canvas OR animated DOM elements live here -->
    <!-- copy overlay on top -->
  </div>
</section>
```

- `#scrolltrack` is tall (300–800vh) — this is the scroll "runway".
- `#stage` is `position: sticky; top: 0; height: 100vh` — it pins to the viewport while the runway scrolls past.
- A `getProgress()` function maps the runway position to a `0→1` number.
- **Split scroll handler from render.** The scroll listener (passive) only *stores* progress; a `requestAnimationFrame` loop does the actual drawing/transforming and only when something changed. Calling `drawImage`/heavy work directly inside the scroll handler causes jank — scroll fires hundreds of times/sec on trackpads.

```js
let progress = 0, applied = -1;
function getProgress() {
  const r = document.getElementById('scrolltrack').getBoundingClientRect();
  return Math.max(0, Math.min(1, -r.top / (r.height - innerHeight)));
}
addEventListener('scroll', () => { progress = getProgress(); }, { passive: true });
function tick() {
  if (progress !== applied) { render(progress); applied = progress; }
  requestAnimationFrame(tick);
}
progress = getProgress(); tick();
```

`render(progress)` is the only part that differs between Path A and Path B.

## Non-negotiables (both paths)

These separate "looks Apple" from "looks broken":

- **`prefers-reduced-motion`**: always provide a static fallback. Scroll-driven motion triggers vestibular issues for some users. Render the final/open state statically, drop the runway height to `auto`, make `#stage` static. Apple always ships this.
- **Mobile**: tune element sizes / frame counts down. Path B: half the frames (e.g. 120 vs 240) and smaller WebP. Path A: usually just responsive `clamp()` sizing.
- **One frame = one meaning**: don't pile copy on top of the focal visual. Separate the zones (e.g. text top, product bottom) so each reads. This is the most common failure.
- **Top progress bar** is a cheap, high-value polish signal — a 3px fixed bar whose width = `progress * 100%`.

## Path A — CSS-transform hero

Use the bundled starter: **`assets/hero-starter.html`** — a complete, self-contained, working hero (deck-of-cards fan reveal, gold rays, staged copy, progress bar, reduced-motion fallback). It's the proven base; copy it and adapt rather than building from scratch.

Workflow:
1. Read `assets/hero-starter.html` to understand its structure.
2. Brief the design from the subject (palette, type, the signature element). Read `references/design-direction.md` for how to ground it and avoid generic AI-landing defaults.
3. Replace tokens in `:root`, the headline/copy, and the animated elements. For a deck: swap the `.card-art-*` gradient placeholders for real `background-image` arts.
4. Tune the `fan` array (final angles/offsets of each element) and the phase thresholds in `apply(p)`.
5. Verify with screenshots at progress 0.0 / 0.3 / 0.6 / 0.95 — see "Verify" below.

The render function transforms elements by eased progress:
```js
function render(p) {
  const open = easeOut(Math.min(1, p / 0.55));   // phase 1: reveal
  elements.forEach((el, i) => {
    const f = fan[i];
    el.style.transform = `translate(${f.x*open}%, ${f.y*open}%) rotate(${f.rot*open}deg)`;
  });
  // phase 2 (p > 0.45): subtle dolly-in, copy reveal, etc.
}
```

## Path B — Canvas frame sequence

Full pipeline (generate visual → assemble video → cut to frames → canvas playback) is in **`references/frame-pipeline.md`**. Read it when the user chooses Path B or has footage. It covers: Higgsfield MCP generation prompts, ffmpeg concat/cut commands, exact frame counts, batched preload with a loader screen, DPR-aware canvas sizing, and cover-fit drawing.

Quick shape of the render function for Path B:
```js
function render(p) {
  currentFrame = Math.min(Math.floor(p * TOTAL), TOTAL - 1);
  // tick() calls drawCover(frames[currentFrame]) only when frame changed
}
```

Key reminders (details in the reference): preload **all** frames before starting (white flashes otherwise), show a progress loader (240 WebP ≈ 3–6s on 4G), use canvas not `<video>` (Safari/iOS jank), batch preloads ~20 at a time.

## Verify before declaring done

If a browser/screenshot tool is available, capture the hero at several scroll positions and actually look:

```python
# playwright: scroll to fractions of the runway and screenshot
total = page.evaluate("document.getElementById('scrolltrack').getBoundingClientRect().height - innerHeight")
for frac in [0.0, 0.3, 0.6, 0.95]:
    page.evaluate(f"window.scrollTo(0,{total*frac})"); page.wait_for_timeout(450)
    page.screenshot(path=f"shot-{frac}.png")
```

Check: zones don't overlap, the reveal reads, copy is legible over the visual, nothing clips off-screen. Also shoot one mobile viewport (e.g. 390×844). Fix composition issues (element positions, copy placement) before delivering.

## Common mistakes

- Drawing inside the scroll handler → jank. Always split handler/rAF.
- Forgetting `prefers-reduced-motion` → ships an inaccessible page.
- Copy stacked on the focal point → unreadable mush; separate zones.
- Path B with too few preloaded frames → white flashes mid-scroll.
- `transform-origin` wrong on fanning elements → they pivot from the wrong point. For a deck fanning up from a pile, origin near the bottom (`50% 115%`).
- Runway too short → animation feels rushed; 300–800vh gives room.
