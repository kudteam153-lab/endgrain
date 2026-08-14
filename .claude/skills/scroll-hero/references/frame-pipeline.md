# Frame Pipeline (Path B)

Producing a canvas frame sequence: visual → video → frames → canvas playback. Read when the user has footage or wants maximum photographic fidelity.

## Table of contents
1. Source the motion (film vs generate)
2. Generate frames with Higgsfield MCP (optional)
3. Assemble video & cut to frames (ffmpeg)
4. Canvas playback (preload, draw, loader)
5. Frame-count & sizing reference

---

## 1. Source the motion

You need **one continuous 3–4 second motion**, not many separate shots. It must read forward when scrolling down and reverse cleanly scrolling up. Design the last frame as a static focal point (not mid-motion) so the reversed scroll lands somewhere meaningful.

**Filming (often better for physical products):** lock the camera on a tripod, move only the subject. Soft directional light. Shoot 4K 60fps for headroom. Real footage reads as more honest/tactile than AI for tangible products — and avoids the consistency problems below.

**AI generation:** good for abstract/impossible motion. Weakness: AI struggles to keep fine detail consistent frame-to-frame (small text, intricate artwork on cards will "swim"). If the subject has fine detail that must stay stable, film it instead.

## 2. Generate frames with Higgsfield MCP (optional)

Only if generating rather than filming. When the Higgsfield MCP is connected, image/video tools are available. Strategy for a consistent look across all frames:

- Create ONE reference-style image first; reuse it as a Reference Element so every generation shares the visual language. Inconsistent style across frames = visual mush.
- Keep a single style seed string identical across all generations, e.g. `cinematic, soft natural light, 35mm film grain, warm tones, shallow depth of field, photo-realistic`.
- Generate key frames, then use motion/interpolation between two key frames to produce a short video (the dense frames come from cutting that video, step 3 — you don't generate 240 stills by hand).

The MCP tool names and parameters change over time — inspect the currently available Higgsfield tools rather than assuming a fixed API. Generate landscape 16:9 (e.g. 1920×1080) unless the design needs otherwise.

## 3. Assemble video & cut to frames (ffmpeg)

If you produced several video segments, concat them:
```bash
# list.txt contains:  file 'seg-01.mp4'  /  file 'seg-02.mp4' ...
ffmpeg -f concat -safe 0 -i list.txt -c copy final.mp4
```

Cut the final video into frames. Desktop and mobile get separate sets:
```bash
# desktop
mkdir -p public/frames
ffmpeg -i final.mp4 -vf "fps=20,scale=1600:-2" -quality 80 public/frames/frame_%04d.webp

# mobile — fewer frames, smaller
mkdir -p public/frames-mobile
ffmpeg -i final.mp4 -vf "fps=10,scale=900:-2" -quality 70 public/frames-mobile/frame_%04d.webp
```
`fps` × video length = frame count. Aim for the counts in section 5.

## 4. Canvas playback

Frames must all be loaded before animation starts, or scrolling shows white gaps. Show a loader with a progress bar (240 WebP ≈ 3–6s on good 4G).

```js
const TOTAL = innerWidth < 768 ? 120 : 240;
const FRAMES_PATH = innerWidth < 768 ? '/frames-mobile' : '/frames';
const frames = new Array(TOTAL);
const canvas = document.getElementById('seq');
const ctx = canvas.getContext('2d');
let currentFrame = 0, drawnFrame = -1;

function resize() {                       // DPR-aware, avoids blur on Retina
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawnFrame = -1;
}
addEventListener('resize', resize); resize();

function loadFrame(i) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.src = `${FRAMES_PATH}/frame_${String(i+1).padStart(4,'0')}.webp`;
    img.onload = () => { frames[i] = img; res(); }; img.onerror = rej;
  });
}
async function preload(onProgress) {       // batch ~20 (browser caps ~6 conns/host)
  const BATCH = 20;
  for (let i = 0; i < TOTAL; i += BATCH) {
    const b = [];
    for (let j = i; j < Math.min(i+BATCH, TOTAL); j++) b.push(loadFrame(j));
    await Promise.all(b);
    onProgress(Math.min(i+BATCH, TOTAL) / TOTAL);
  }
}
function drawCover(img) {                   // background-size: cover, centered
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
  let w, h; if (ir > cr) { h = ch; w = ch*ir; } else { w = cw; h = cw/ir; }
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(img, (cw-w)/2, (ch-h)/2, w, h);
}
function getProgress() {
  const r = document.getElementById('scrolltrack').getBoundingClientRect();
  return Math.max(0, Math.min(1, -r.top / (r.height - innerHeight)));
}
addEventListener('scroll', () => {
  currentFrame = Math.min(Math.floor(getProgress()*TOTAL), TOTAL-1);
}, { passive: true });
function tick() {
  if (currentFrame !== drawnFrame && frames[currentFrame]) {
    drawCover(frames[currentFrame]); drawnFrame = currentFrame;
  }
  requestAnimationFrame(tick);
}

if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.body.classList.add('reduced-motion');   // show static version, skip animation
} else {
  preload(p => { document.querySelector('#progressbar').style.width = `${p*100}%`; })
    .then(() => { document.getElementById('loader').remove(); tick(); });
}
```

CSS skeleton: `#scrolltrack { height: 800vh }`, `#stage { position: sticky; top:0; height:100vh; overflow:hidden }`, `#seq { position:absolute; inset:0; width:100%; height:100% }`. Optional polish: radial mask on `#seq` for soft edges, a subtle `rotate()` on the canvas tied to progress for fake-3D, glassmorphic copy cards.

## 5. Frame-count & sizing reference

| Use | Frames | fps cut | Width |
|---|---|---|---|
| Desktop, simple physical motion | 60–100 | 20 | 1600 |
| Desktop, complex/long reveal | 120–240 | 24–30 | 1600–1920 |
| Mobile | half of desktop | 10–12 | 900–960 |

For a physical product with one clear movement (a deck fanning, a box opening), 60–100 frames is plenty — don't over-produce. Reserve 200+ for genuinely long multi-beat sequences.
