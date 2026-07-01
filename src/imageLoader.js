// Loads a photo, cover-crops it to a target aspect ratio, and samples it down to a
// cols x rows grid. Returns flat typed arrays the cube portrait can consume directly.

/**
 * Load an HTMLImageElement from a URL.
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Sample an image into a grid of cubes.
 *
 * The image is drawn onto an offscreen canvas sized cols x rows using
 * "cover" cropping (fills the target aspect, center-cropping the overflow), so the
 * grid never stretches the photo. Home positions are centered on the origin in world
 * units where one grid cell == `cellSize` units.
 *
 * @param {string} url            image URL
 * @param {number} cols           grid columns (density)
 * @param {number} aspect         target aspect ratio (screen width / height)
 * @param {number} cellSize       world size of one grid cell (cube pitch)
 * @returns {Promise<{cols:number, rows:number, count:number, cellSize:number,
 *                    colors:Float32Array, homes:Float32Array, width:number, height:number}>}
 */
export async function sampleImageToGrid(url, cols, aspect, cellSize) {
  const img = await loadImage(url);

  // Rows chosen so cells stay square in world space for the given screen aspect.
  const rows = Math.max(1, Math.round(cols / aspect));

  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // "cover" fit: scale the source so it fully covers cols x rows, then center-crop.
  const srcAspect = img.width / img.height;
  const dstAspect = cols / rows;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcAspect > dstAspect) {
    // Source is wider than target: crop the sides.
    sw = img.height * dstAspect;
    sx = (img.width - sw) / 2;
  } else {
    // Source is taller than target: crop top/bottom.
    sh = img.width / dstAspect;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);

  const { data } = ctx.getImageData(0, 0, cols, rows);
  const count = cols * rows;
  const colors = new Float32Array(count * 3);
  const homes = new Float32Array(count * 3);

  // Center the grid on the origin. World width/height in units.
  const width = cols * cellSize;
  const height = rows * cellSize;
  const x0 = -width / 2 + cellSize / 2;
  const y0 = height / 2 - cellSize / 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const gridIdx = row * cols + col;
      const px = gridIdx * 4; // RGBA in canvas data
      // sRGB 0..1; three.js color space conversion happens on the instanceColor buffer.
      colors[gridIdx * 3 + 0] = data[px + 0] / 255;
      colors[gridIdx * 3 + 1] = data[px + 1] / 255;
      colors[gridIdx * 3 + 2] = data[px + 2] / 255;

      homes[gridIdx * 3 + 0] = x0 + col * cellSize;
      homes[gridIdx * 3 + 1] = y0 - row * cellSize;
      homes[gridIdx * 3 + 2] = 0;
    }
  }

  return { cols, rows, count, cellSize, colors, homes, width, height };
}
