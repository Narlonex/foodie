import "server-only";

const WIKI_ENDPOINTS = [
  "https://en.wikipedia.org/w/api.php",
  "https://sk.wikipedia.org/w/api.php",
];
const COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "Foodie/1.0 (nutrition tracker; food thumbnails)";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// A miss is retried sooner than a hit: the photo may simply be rate-limited.
const MISS_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 800;

interface CacheEntry {
  url: string | null;
  expiresAt: number;
}

interface WikiPage {
  title?: unknown;
  thumbnail?: { source?: unknown };
}

const cache = new Map<string, CacheEntry>();

function cached(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function remember(key: string, url: string | null): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, {
    url,
    expiresAt: Date.now() + (url ? CACHE_TTL_MS : MISS_TTL_MS),
  });
}

// Wikimedia asks clients to stop after a 429. A short pause is not enough for
// an anonymous IP, so lookups stay off for a while and the UI shows its tiles.
const RATE_LIMIT_PAUSE_MS = 10 * 60 * 1000;
let blockedUntil = 0;

function noteRateLimit(response: Response): boolean {
  if (response.status === 429) {
    blockedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
    return true;
  }
  return false;
}

function usableUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const host = new URL(value).hostname;
    return /(^|\.)(wikimedia|wikipedia)\.org$/.test(host) ? value : null;
  } catch {
    return null;
  }
}

/** Shortens noisy product/USDA names to something a wiki can recognise. */
function candidates(query: string): string[] {
  const cleaned = query.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  const first = cleaned.split(/[,;|]/)[0]?.trim() ?? cleaned;
  return [...new Set([cleaned, words.slice(0, 3).join(" "), first])].filter(
    (value) => value.length >= 2,
  );
}

function pagesFrom(payload: unknown): WikiPage[] {
  const pages =
    payload && typeof payload === "object"
      ? (payload as { query?: { pages?: unknown } }).query?.pages
      : undefined;
  return Array.isArray(pages) ? (pages as WikiPage[]) : [];
}

// Wikimedia answers with 429 when a burst of thumbnails is requested at once,
// so lookups share a small pool instead of firing every request in parallel.
const MAX_CONCURRENT = 1;
let activeLookups = 0;
const waiting: (() => void)[] = [];

async function withLookupSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeLookups >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeLookups += 1;
  try {
    return await task();
  } finally {
    activeLookups -= 1;
    waiting.shift()?.();
  }
}

function overlapScore(title: string, query: string): number {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  const titleWords = new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  let score = 0;
  for (const word of new Set(words)) if (titleWords.has(word)) score += 1;
  return score;
}

/**
 * Exact-title lookup through the REST summary endpoint. It is a single, cheap
 * request and covers most whole foods ("Apple", "Rice", "Oat") without a
 * search round trip.
 */
async function summaryImage(
  language: "en" | "sk",
  phrase: string,
): Promise<string | null> {
  const title = encodeURIComponent(phrase.trim().replace(/\s+/g, "_"));
  const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
      redirect: "follow",
    });
    if (noteRateLimit(response) || !response.ok) return null;
    const payload = (await response.json()) as {
      type?: unknown;
      thumbnail?: { source?: unknown };
    };
    if (payload.type === "disambiguation") return null;
    return usableUrl(payload.thumbnail?.source);
  } catch {
    return null;
  }
}

/**
 * Looks a free-text food phrase up on Wikipedia and returns the lead image of
 * the most on-topic article (highest title/query word overlap).
 */
async function wikiSearchImage(
  endpoint: string,
  query: string,
): Promise<string | null> {
  const url = new URL(endpoint);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "4");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "480");
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (noteRateLimit(response) || !response.ok) return null;
    const wanted = query.trim().toLowerCase();
    const pages = pagesFrom(await response.json())
      .filter((page) => !/disambiguation/i.test(String(page.title ?? "")))
      .map((page) => ({
        title: typeof page.title === "string" ? page.title : "",
        url: usableUrl(page.thumbnail?.source),
      }))
      .filter((page): page is { title: string; url: string } =>
        Boolean(page.url),
      );

    // An article whose title is the query is the most specific match ("Apple"
    // is the fruit, not the company); otherwise keep Wikipedia's own ranking
    // and only accept a result that shares a word with the food name.
    const exact = pages.find(
      (page) => page.title.trim().toLowerCase() === wanted,
    );
    if (exact) return exact.url;
    const related = pages.find(
      (page) => overlapScore(page.title, query) >= 1,
    );
    return related?.url ?? null;
  } catch {
    return null;
  }
}

function acceptable(info: Record<string, unknown>): string | null {
  const mime = typeof info.mime === "string" ? info.mime : "";
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return null;
  const width = typeof info.thumbwidth === "number" ? info.thumbwidth : 0;
  const height = typeof info.thumbheight === "number" ? info.thumbheight : 0;
  if (width < 80 || height < 80) return null;
  const ratio = width / height;
  if (ratio < 0.4 || ratio > 2.5) return null;
  return usableUrl(info.thumburl);
}

async function commonsImage(title: string): Promise<string | null> {
  const url = new URL(COMMONS_ENDPOINT);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `filetype:bitmap ${title}`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "6");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size");
  url.searchParams.set("iiurlwidth", "480");
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (noteRateLimit(response) || !response.ok) return null;
    for (const page of pagesFrom(await response.json())) {
      const infos = (page as { imageinfo?: unknown }).imageinfo;
      if (!Array.isArray(infos) || !infos[0]) continue;
      const found = acceptable(infos[0] as Record<string, unknown>);
      if (found) return found;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Finds one representative photo for a food name. Wikipedia's article images
 * are the most accurate source for whole foods, exact articles are preferred,
 * and Wikimedia Commons is the last network attempt before the generated tile.
 */
export async function findFoodImageUrl(query: string): Promise<string | null> {
  const key = query.trim().toLowerCase().slice(0, 120);
  if (key.length < 2) return null;
  const hit = cached(key);
  if (hit) return hit.url;
  if (Date.now() < blockedUntil) return null;

  // Progressive phrases: the full name first, then the head of the name and
  // the part before the first comma ("Apples, fuji, raw" -> "Apples").
  const phrases = candidates(key)
    .map((candidate) =>
      candidate
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 4)
        .join(" "),
    )
    .filter(
      (phrase, index, all) => phrase.length >= 2 && all.indexOf(phrase) === index,
    )
    .slice(0, 3);

  function save(url: string): string {
    remember(key, url);
    return url;
  }

  // 1) Exact article titles, English first and Slovak as a fallback. One request
  //    each, which is all most whole foods need.
  for (const phrase of phrases.slice(0, 2)) {
    for (const language of ["en", "sk"] as const) {
      const exact = await withLookupSlot(() => summaryImage(language, phrase));
      if (exact) return save(exact);
      if (Date.now() < blockedUntil) return null;
    }
  }

  // 2) Full-text search, again English first.
  for (const phrase of phrases.slice(0, 2)) {
    for (const endpoint of WIKI_ENDPOINTS) {
      const search = await withLookupSlot(() => wikiSearchImage(endpoint, phrase));
      if (search) return save(search);
      if (Date.now() < blockedUntil) return null;
    }
  }

  // 3) Wikimedia Commons files as the last network attempt.
  const commons = await withLookupSlot(() => commonsImage(phrases[0] ?? key));
  if (commons) return save(commons);

  remember(key, null);
  return null;
}

const TILE_COLORS = [
  ["#123d2b", "#3fae74"],
  ["#123a3d", "#42b3a3"],
  ["#2c3418", "#8aae4d"],
  ["#3a2a12", "#c08a42"],
  ["#2b1d3a", "#9a76c4"],
  ["#3a1c22", "#c4666f"],
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A deterministic gradient tile with the food's initial, used as a last resort. */
export function fallbackFoodImage(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  const [from, to] = TILE_COLORS[hash % TILE_COLORS.length] ?? TILE_COLORS[0];
  const initial = escapeXml(name.trim().charAt(0).toUpperCase() || "?");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#g)"/>
  <text x="160" y="160" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="140"
    font-weight="600" fill="rgba(255,255,255,0.82)">${initial}</text>
</svg>`;
}
