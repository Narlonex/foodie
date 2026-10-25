"use client";

import { useRef, useState } from "react";
import { getTranslator } from "@/i18n";
import type { Language } from "@/lib/types";
import { FoodThumb } from "./food-thumb";
import { Icon } from "./icons";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 720;

async function resizeToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image"));
      image.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.fillStyle = "#0d1712";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function FoodPhotoField({
  language,
  name,
  initialUrl,
}: {
  language: Language;
  name: string;
  initialUrl?: string | null;
}) {
  const t = getTranslator(language);
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(
    initialUrl?.startsWith("data:") ? initialUrl : null,
  );
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_FILE_BYTES) {
      setError(t("foods.photoError"));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      const data = await resizeToDataUrl(file);
      setPhoto(data);
      setPreview(data);
    } catch {
      setError(t("foods.photoError"));
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="photo-field">
      <input type="hidden" name="photo" value={photo ?? ""} />
      <FoodThumb name={name || "?"} imageUrl={preview} size={64} />
      <div className="photo-field-body">
        <span className="field-label">{t("foods.photo")}</span>
        <p className="field-hint">{t("foods.photoHint")}</p>
        <div className="row">
          <button
            type="button"
            className="button secondary small"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="camera" size={15} />
            {preview ? t("foods.photoReplace") : t("foods.photoChoose")}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
