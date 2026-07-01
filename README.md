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

Append `?stats` to the URL for an FPS / cube-count overlay.

## Use your own photo

The active photo is `public/photo.png` (set by `CONFIG.photo` in `src/main.js`). Replace
that file with your own image and reload. The image is **cover-cropped** to the screen
aspect ratio, so any photo fills the screen without stretching — a portrait-orientation
shot works well. To use a different filename or format, just update `CONFIG.photo`.

`npm run placeholder` regenerates a stand-in portrait at `public/photo.jpg` if you ever
need one.

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

### Tuning

All knobs live in `CONFIG` at the top of `src/main.js`:

- **`cols`** — grid density (cube count). `200` ≈ 40k cubes. Lower it if the framerate drops.
- **`physics.stiffness` / `damping`** — how snappy vs. floaty the reform feels.
- **`physics.noiseAmp` / `noiseScale` / `noiseSpeed` / `noiseDepth`** — ambient drift character.
- **`scatter.strength` / `minInterval` / `maxInterval`** — how hard and how often the photo
  dissolves and reforms.

## Performance

One shared geometry + material and one `InstancedMesh` mean a single draw call. Physics
state is stored in flat `Float32Array`s (structure-of-arrays) and the hot loop reuses
scratch `Matrix4` / `Vector3` / `Quaternion` objects, so there are no per-frame
allocations. Pixel ratio is capped at 2.
