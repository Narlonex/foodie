import Image from "next/image";

/** Foodie mark. The transparent artwork sits on the current theme background. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image
        src="/brand/foodie-mark.png"
        alt=""
        width={512}
        height={512}
        priority
        style={{ width: "84%", height: "84%" }}
      />
    </span>
  );
}
