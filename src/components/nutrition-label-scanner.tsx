"use client";

import { useRef, useState } from "react";
import { getTranslator } from "@/i18n";
import { parseNutritionLabel, type LabelScanResult } from "@/lib/label";
import type { Language } from "@/lib/types";
import { Icon } from "./icons";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1800;

async function fileToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image"));
      image.src = objectUrl;
    });
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(image.width, image.height),
    );
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function NutritionLabelScanner({
  language,
  onExtracted,
}: {
  language: Language;
  onExtracted: (result: LabelScanResult) => void;
}) {
  const t = getTranslator(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<LabelScanResult | null>(null);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function scan(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setRawText("");
    if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
      setError(t("foods.labelScanError"));
      return;
    }

    setBusy(true);
    setProgress(0);
    let worker: Awaited<
      ReturnType<typeof import("tesseract.js")["createWorker"]>
    > | null = null;

    try {
      const image = await fileToDataUrl(file);
      setPreview(image);

      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        logger: (message) => {
          if (message.status === "recognizing text") {
            setProgress(Math.round(message.progress * 100));
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      const { data } = await worker.recognize(image);
      const parsed = parseNutritionLabel(data.text);
      setRawText(data.text);
      setResult(parsed);
      onExtracted(parsed);
    } catch {
      setError(t("foods.labelScanError"));
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // OCR failure must not block manual nutrition entry.
        }
      }
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="form-section label-scan">
      <div className="label-scan-head">
        <div>
          <h3 className="form-section-title">{t("foods.labelScanTitle")}</h3>
          <p className="field-hint">{t("foods.labelScanHint")}</p>
        </div>
        <button
          type="button"
          className="button secondary small"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Icon name="camera" size={16} />
          {busy
            ? t("foods.labelScanBusy")
            : t("foods.labelScanButton")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void scan(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {preview ? (
        <img
          className="label-scan-preview"
          src={preview}
          alt={t("foods.labelScanPreview")}
        />
      ) : null}

      <div aria-live="polite">
        {busy ? (
          <div className="notice" role="status">
            <span className="spinner" aria-hidden="true" />
            <span>
              {t("foods.labelScanBusy")}{" "}
              {progress > 0 ? t("foods.labelScanProgress", { percent: progress }) : ""}
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="notice error" role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </p>
        ) : null}
        {!busy && result ? (
          <p
            className={result.matchedKeys.length > 0 ? "notice success" : "notice warning"}
            role="status"
          >
            <Icon
              name={result.matchedKeys.length > 0 ? "check" : "info"}
              size={17}
            />
            <span>
              {result.matchedKeys.length > 0
                ? t("foods.labelScanSuccess", {
                    count: result.matchedKeys.length,
                  })
                : t("foods.labelScanEmpty")}
            </span>
          </p>
        ) : null}
      </div>

      {rawText ? (
        <details className="label-scan-text">
          <summary>{t("foods.labelScanText")}</summary>
          <pre>{rawText}</pre>
        </details>
      ) : null}

      <p className="source-note">{t("foods.labelScanPrivacy")}</p>
    </div>
  );
}
