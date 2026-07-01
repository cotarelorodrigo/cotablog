# cotablog — cube-portrait landing page

A full-screen [three.js](https://threejs.org/) landing page that renders a personal photo
as tens of thousands of cubes. Each sampled pixel becomes a cube in a single
`InstancedMesh`; a spring-based physics system makes the cubes drift, jitter, and
periodically scatter and reform back into the photo.

## Run

```bash
npm install
npm run placeholder   # generates public/photo.jpg (a placeholder portrait)
npm run dev           # start Vite, open the printed localhost URL
```

**Move your mouse over the scene** to reveal the photo locally — only the cubes the pointer
passes over settle onto their home pixels (a "reveal brush"), while the rest keep drifting.
Each touched cube stays calm for ~5s after the pointer leaves it, then rejoins the drift.

URL flags: `?stats` (FPS / cube-count overlay), `?hold=<seconds>` (override the hold-to-view
duration), `?debug` (exposes `window.__cv` for tuning).

## Use your own photo

The active photo is `public/photo.png` (set by `CONFIG.photo` in `src/main.js`). Replace
that file with your own image and reload. The image is **cover-cropped** to the screen
aspect ratio, so any photo fills the screen without stretching — a portrait-orientation
shot works well. To use a different filename or format, just update `CONFIG.photo`.

`npm run placeholder` regenerates a stand-in portrait at `public/photo.jpg` if you ever
need one.

## CV console

The left side is a terminal that cycles through your CV. Each entry types a "command"
(`whoami`, `cat experience/…`, `skills`, `contact`) and prints an output block, then fades
to the next and loops. Edit the list in **`src/cv.js`** — each entry is `{ cmd, out, url }`:

```js
{
  cmd: 'cat experience/bluerabbit',
  out: ['CTO & Co-founder · 2021 → 2024', 'Gamified community app → 30k users'],
  url: 'https://…',   // optional: makes the card clickable + shows a ↗ in the header
},
```

Cards with a `url` open in a new tab. The console respects `prefers-reduced-motion`
(shows text instantly instead of typing).

## Build

```bash
npm run build     # outputs dist/
npm run preview   # serve the production build locally
```

## How it works

| File | Responsibility |
|------|----------------|
| `src/imageLoader.js` | Load the photo, cover-crop to screen aspect, sample into a `cols × rows` grid of colors + home positions. |
| `src/physics.js` | Pure spring simulation over typed arrays: Hooke spring toward home + damping + simplex-noise drift + `scatter()` impulses. No inter-cube collisions. |
| `src/CubePortrait.js` | Builds the `InstancedMesh`, sets per-instance colors, writes per-instance matrices each frame from the physics state. |
| `src/main.js` | Renderer, orthographic camera, lights, resize handling, scatter scheduling, the RAF loop, and all tunables (`CONFIG`). |
| `src/cv.js` / `src/console.js` | CV data and the typewriter terminal overlay on the left. |

### Tuning

All knobs live in `CONFIG` at the top of `src/main.js`:

- **`cols`** — grid density (cube count). `200` ≈ 40k cubes. Lower it if the framerate drops.
- **`physics.stiffness` / `damping`** — how snappy vs. floaty the reform feels.
- **`physics.noiseAmp` / `noiseScale` / `noiseSpeed` / `noiseDepth`** — ambient drift character.
- **`scatter.strength` / `minInterval` / `maxInterval`** — how hard and how often the photo
  dissolves and reforms.
- **`holdToViewSeconds`** — how long a touched cube stays calm after the pointer leaves it.
- **`holdRadius`** — reveal-brush radius (in cubes) around the pointer.
- **`physics.calmDamping` / `calmStiffnessMul`** — how firmly/quickly the cubes snap into the
  clear photo while holding to view.

## Performance

One shared geometry + material and one `InstancedMesh` mean a single draw call. Physics
state is stored in flat `Float32Array`s (structure-of-arrays) and the hot loop reuses
scratch `Matrix4` / `Vector3` / `Quaternion` objects, so there are no per-frame
allocations. Pixel ratio is capped at 2.
