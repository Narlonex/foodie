"use server";

import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { parseRecipeHtml, type ImportedRecipe } from "@/lib/recipeImport";
import type { ActionResult } from "./types";

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1"
  ) {
    return true;
  }
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
    a === 0
  );
}

function httpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || isPrivateHost(url.hostname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function fetchPage(url: URL): Promise<Response | null> {
  let current = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Foodie/1.0 recipe import",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const next = httpUrl(new URL(location, current).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    if (!response.ok) return null;
    const finalUrl = httpUrl(response.url);
    if (!finalUrl) return null;
    return response;
  }
  return null;
}

export async function importRecipeAction(
  input: unknown,
): Promise<ActionResult<ImportedRecipe>> {
  await requireViewer();
  const parsed = z
    .object({ url: z.string().trim().min(1).max(2000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "recipeImport.invalidUrl" };
  const url = httpUrl(parsed.data.url);
  if (!url) return { ok: false, error: "recipeImport.invalidUrl" };

  try {
    const response = await fetchPage(url);
    if (!response) return { ok: false, error: "recipeImport.fetchError" };
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return { ok: false, error: "recipeImport.notHtml" };
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_HTML_BYTES) {
      return { ok: false, error: "recipeImport.tooLarge" };
    }
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) {
      return { ok: false, error: "recipeImport.tooLarge" };
    }
    const recipe = parseRecipeHtml(html, response.url || url.toString());
    if (!recipe) return { ok: false, error: "recipeImport.noRecipe" };
    return { ok: true, data: recipe };
  } catch {
    return { ok: false, error: "recipeImport.fetchError" };
  }
}
