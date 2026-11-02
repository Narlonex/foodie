import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const source = path.join("public", "brand", "foodie-mark.png");
const outputDirectory = path.join("public", "icons");
const background = "#161613";

const outputs = [
  { name: "icon-192.png", size: 192, logoRatio: 0.78 },
  { name: "icon-512.png", size: 512, logoRatio: 0.78 },
  { name: "icon-maskable-192.png", size: 192, logoRatio: 0.64 },
  { name: "icon-maskable-512.png", size: 512, logoRatio: 0.64 },
  { name: "apple-touch-icon.png", size: 180, logoRatio: 0.76 },
];

await mkdir(outputDirectory, { recursive: true });

for (const { name, size, logoRatio } of outputs) {
  const logoSize = Math.round(size * logoRatio);
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "inside" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDirectory, name));

  console.log(`Generated public/icons/${name}`);
}
