"use client";

import { useState } from "react";

/**
 * Square food picture. It uses the stored or source image first, then asks the
 * server image endpoint to find one by name, and finally falls back to a simple
 * letter tile so a row is never left with an empty box.
 */
export function FoodThumb({
  name,
  imageUrl,
  size = 40,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const remote = imageUrl?.trim() || null;
  // `v` busts previously cached fallback tiles when the lookup improves.
  const searchSrc = `/api/food-image?q=${encodeURIComponent(name)}&v=2`;

  // Failures are remembered by src so a new food resets the state without an
  // effect. `primary` is the stored/API photo, `search` is the lookup endpoint.
  const [failedPrimary, setFailedPrimary] = useState<string | null>(null);
  const [failedSearch, setFailedSearch] = useState<string | null>(null);

  const usePrimary = Boolean(remote) && failedPrimary !== remote;
  const src = usePrimary ? (remote as string) : searchSrc;
  const showLetter = !usePrimary && failedSearch === searchSrc;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={`food-thumb${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showLetter ? (
        <span className="food-thumb-letter">{initial}</span>
      ) : (
        // Remote hosts vary, so a plain img with an explicit fallback is safer
        // than the image optimizer for user-generated food photos.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (usePrimary) setFailedPrimary(remote);
            else setFailedSearch(searchSrc);
          }}
        />
      )}
    </span>
  );
}
