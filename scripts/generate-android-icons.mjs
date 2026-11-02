import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const source = path.join("public", "brand", "foodie-mark.png");
const res = path.join("android", "app", "src", "main", "res");
const background = "#161613";

const densities = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const foregroundSizes = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

async function mark(size, ratio, opaque) {
  const logoSize = Math.round(size * ratio);
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "inside" })
    .png()
    .toBuffer();

  const canvas = {
    width: size,
    height: size,
    channels: 4,
    background: opaque
      ? background
      : { r: 0, g: 0, b: 0, alpha: 0 },
  };

  return sharp({ create: canvas })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const [density, size] of Object.entries(densities)) {
  const directory = path.join(res, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const legacy = await mark(size, 0.8, true);
  await sharp(legacy).toFile(path.join(directory, "ic_launcher.png"));
  await sharp(legacy).toFile(path.join(directory, "ic_launcher_round.png"));
  console.log(`Generated ${density} launcher icons`);
}

for (const [density, size] of Object.entries(foregroundSizes)) {
  const directory = path.join(res, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const foreground = await mark(size, 0.62, false);
  await sharp(foreground).toFile(
    path.join(directory, "ic_launcher_foreground.png"),
  );
  console.log(`Generated ${density} adaptive foreground`);
}

async function findSplashes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findSplashes(entryPath)));
    } else if (entry.name === "splash.png") {
      files.push(entryPath);
    }
  }
  return files;
}

for (const file of await findSplashes(res)) {
  const metadata = await sharp(file).metadata();
  const width = metadata.width ?? 1080;
  const height = metadata.height ?? 1920;
  const logoSize = Math.max(96, Math.round(Math.min(width, height) * 0.28));
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "inside" })
    .png()
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(file);

  console.log(`Generated splash ${path.relative(res, file)}`);
}
