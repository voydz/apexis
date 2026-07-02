/**
 * Builds all app icon / splash assets from the master artwork.
 * Usage: node scripts/make-assets.js <path-to-master.png>
 *
 * Extracts the lime mark from the master via color-keying (so the AI-rendered
 * background is replaced with the exact brand color everywhere), then composes:
 *   icon.png                    1024x1024 opaque brand background (iOS + base)
 *   android-icon-background.png 1024x1024 solid brand background
 *   android-icon-foreground.png 1024x1024 transparent, mark in adaptive safe zone
 *   android-icon-monochrome.png 1024x1024 transparent, white mark (themed icons)
 *   splash-icon.png             1024x1024 transparent mark (shown on brand bg)
 *   favicon.png                 48x48
 */
const sharp = require('sharp');
const path = require('path');

const MASTER = process.argv[2];
if (!MASTER) {
  console.error('Usage: node scripts/make-assets.js <master.png>');
  process.exit(1);
}

const OUT = path.join(__dirname, '..', 'assets');
const BRAND_BG = { r: 10, g: 12, b: 16, alpha: 1 }; // #0A0C10
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Replace the (near-uniform dark) background with transparency. */
async function extractMark() {
  const { data, info } = await sharp(MASTER)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sample the background color from the top-left corner
  const bg = [data[0], data[1], data[2]];
  const SOFT_MIN = 40;
  const SOFT_MAX = 130;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const a = Math.max(0, Math.min(1, (dist - SOFT_MIN) / (SOFT_MAX - SOFT_MIN)));
    data[i + 3] = Math.round(a * 255);
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: TRANSPARENT, threshold: 10 })
    .png()
    .toBuffer();
}

async function whiten(markBuf) {
  const { data, info } = await sharp(markBuf).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function compose({ markBuf, size, markScale, background, file }) {
  const canvas = sharp({ create: { width: size, height: size, channels: 4, background } });
  if (markScale > 0) {
    const target = Math.round(size * markScale);
    const mark = await sharp(markBuf)
      .resize(target, target, { fit: 'inside' })
      .png()
      .toBuffer();
    canvas.composite([{ input: mark, gravity: 'center' }]);
  }
  await canvas.png().toFile(path.join(OUT, file));
  console.log('wrote', file);
}

(async () => {
  const mark = await extractMark();
  const whiteMark = await whiten(mark);

  await compose({ markBuf: mark, size: 1024, markScale: 0.7, background: BRAND_BG, file: 'icon.png' });
  await compose({ markBuf: mark, size: 1024, markScale: 0, background: BRAND_BG, file: 'android-icon-background.png' });
  // Adaptive icon safe zone is the inner 66% circle — keep the mark inside it
  await compose({ markBuf: mark, size: 1024, markScale: 0.52, background: TRANSPARENT, file: 'android-icon-foreground.png' });
  await compose({ markBuf: whiteMark, size: 1024, markScale: 0.52, background: TRANSPARENT, file: 'android-icon-monochrome.png' });
  await compose({ markBuf: mark, size: 1024, markScale: 0.5, background: TRANSPARENT, file: 'splash-icon.png' });

  await sharp(path.join(OUT, 'icon.png')).resize(48, 48).png().toFile(path.join(OUT, 'favicon.png'));
  console.log('wrote favicon.png');
})();
