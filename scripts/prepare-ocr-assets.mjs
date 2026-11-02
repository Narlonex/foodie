import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    "core/tesseract-core-lstm.wasm.js",
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "core/tesseract-core-simd-lstm.wasm.js",
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "core/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "lang/eng.traineddata.gz",
  ],
  ["node_modules/tesseract.js/LICENSE.md", "LICENSE-tesseract.txt"],
  ["node_modules/tesseract.js-core/LICENSE", "LICENSE-tesseract-core.txt"],
];

const root = "public/tesseract";
await mkdir(join(root, "core"), { recursive: true });
await mkdir(join(root, "lang"), { recursive: true });

for (const [source, target] of files) {
  await mkdir(dirname(join(root, target)), { recursive: true });
  await copyFile(source, join(root, target));
  console.log(`${source} -> ${join(root, target)}`);
}
