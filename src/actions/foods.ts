"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  createCustomFood,
  deleteFood,
  foodInputToDraft,
  getOwnedFood,
  saveExternalFoodAsFavorite,
  setFoodFavorite,
  updateCustomFood,
} from "@/lib/repositories/foods";
import { logExternalFood, logFoodById } from "@/lib/repositories/diary";
import {
  amountUnitSchema,
  customFoodSchema,
  foodInputSchema,
  isoDateSchema,
  mealSchema,
  positiveAmountSchema,
} from "@/lib/validation";
import { errorFromZod, type ActionResult, type FormState } from "./types";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/foods");
  revalidatePath("/history");
}

const addCandidateSchema = z.object({
  food: foodInputSchema,
  date: isoDateSchema,
  meal: mealSchema,
  amount: positiveAmountSchema,
  amountUnit: amountUnitSchema,
});

const addSavedFoodSchema = z.object({
  foodId: z.string().uuid("food.saveFailed"),
  date: isoDateSchema,
  meal: mealSchema,
  amount: positiveAmountSchema,
  amountUnit: amountUnitSchema,
});

export async function addExternalFoodAction(
  input: unknown,
): Promise<ActionResult<{ entryId: string }>> {
  const viewer = await requireViewer();
  const parsed = addCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "food.saveFailed",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  const { food, date, meal, amount, amountUnit } = parsed.data;
  if (food.source === "custom") {
    return { ok: false, error: "food.saveFailed" };
  }
  try {
    const entry = await logExternalFood(
      viewer.user.id,
      foodInputToDraft(food),
      date,
      meal,
      amount,
      amountUnit,
    );
    revalidateAll();
    return { ok: true, data: { entryId: entry.id }, message: "search.added" };
  } catch {
    return { ok: false, error: "food.saveFailed" };
  }
}

export async function addSavedFoodAction(
  input: unknown,
): Promise<ActionResult<{ entryId: string }>> {
  const viewer = await requireViewer();
  const parsed = addSavedFoodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "food.saveFailed" };
  }
  try {
    const entry = await logFoodById(
      viewer.user.id,
      parsed.data.foodId,
      parsed.data.date,
      parsed.data.meal,
      parsed.data.amount,
      parsed.data.amountUnit,
    );
    revalidateAll();
    return { ok: true, data: { entryId: entry.id }, message: "search.added" };
  } catch {
    return { ok: false, error: "food.saveFailed" };
  }
}

export async function saveFavoriteFoodAction(
  food: unknown,
): Promise<ActionResult<{ foodId: string }>> {
  const viewer = await requireViewer();
  const parsed = foodInputSchema.safeParse(food);
  if (!parsed.success || parsed.data.source === "custom") {
    return { ok: false, error: "search.favoriteError" };
  }
  try {
    const saved = await saveExternalFoodAsFavorite(viewer.user.id, parsed.data);
    revalidatePath("/foods");
    return {
      ok: true,
      message: "search.favorited",
      data: { foodId: saved.id ?? "" },
    };
  } catch {
    return { ok: false, error: "search.favoriteError" };
  }
}

export async function toggleFavoriteAction(
  foodId: string,
  favorite: boolean,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const zId = z.string().uuid().safeParse(foodId);
  if (!zId.success) return { ok: false, error: "foods.notFound" };
  try {
    const value = await setFoodFavorite(viewer.user.id, foodId, favorite);
    if (!value && favorite) return { ok: false, error: "foods.notFound" };
    revalidatePath("/foods");
    return { ok: true, message: favorite ? "foods.favorited" : "foods.unfavorited" };
  } catch {
    return { ok: false, error: "common.error" };
  }
}

function nullableNumber(formData: FormData, key: string): number | null {
  const raw = formData.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : Number.NaN;
}

const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function parsePhoto(value: string | null | undefined): {
  imageData: Buffer;
  imageMime: string;
} | null {
  if (!value) return null;
  const match = PHOTO_DATA_URL.exec(value);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (!mime || !base64) return null;
  const imageData = Buffer.from(base64, "base64");
  if (imageData.length === 0 || imageData.length > 2_000_000) return null;
  return { imageData, imageMime: mime };
}

function parseCustomFood(formData: FormData) {
  const basisType = String(formData.get("basisType") ?? "100g");
  const servingRaw = formData.get("servingSize");
  const servingSize =
    typeof servingRaw === "string" && servingRaw.trim() !== ""
      ? Number(servingRaw.replace(",", "."))
      : null;
  const servingUnitRaw = String(formData.get("servingUnit") ?? "g");
  const packageQuantity = nullableNumber(formData, "packageQuantity");
  const packageUnitRaw = String(formData.get("packageUnit") ?? "").trim();
  const packageUnit =
    packageQuantity === null || packageUnitRaw === ""
      ? null
      : packageUnitRaw === "ml"
        ? "ml"
        : "g";
  return customFoodSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    barcode: String(formData.get("barcode") ?? ""),
    basisType,
    servingSize: basisType === "serving" ? servingSize : null,
    servingUnit: basisType === "serving" ? servingUnitRaw : null,
    preparation: String(formData.get("preparation") ?? "unspecified"),
    packageQuantity,
    packageUnit,
    drainedWeight: nullableNumber(formData, "drainedWeight"),
    nutrients: {
      kcal: nullableNumber(formData, "kcal"),
      kj: nullableNumber(formData, "kj"),
      protein: nullableNumber(formData, "protein"),
      carbs: nullableNumber(formData, "carbs"),
      sugars: nullableNumber(formData, "sugars"),
      fat: nullableNumber(formData, "fat"),
      satFat: nullableNumber(formData, "satFat"),
      fiber: nullableNumber(formData, "fiber"),
      salt: nullableNumber(formData, "salt"),
    },
    photo: String(formData.get("photo") ?? ""),
  });
}

export async function createCustomFoodAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const parsed = parseCustomFood(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  try {
    await createCustomFood(viewer.user.id, {
      source: "custom",
      externalId: null,
      barcode: parsed.data.barcode || null,
      name: parsed.data.name,
      brand: parsed.data.brand || null,
      basisType: parsed.data.basisType,
      servingSize: parsed.data.servingSize,
      servingUnit: parsed.data.servingUnit,
      nutrients: parsed.data.nutrients,
      imageUrl: null,
      preparation: parsed.data.preparation,
      packageQuantity: parsed.data.packageQuantity,
      packageUnit: parsed.data.packageUnit,
      drainedWeight: parsed.data.drainedWeight,
      ...(parsePhoto(parsed.data.photo) ?? {}),
    });
    revalidatePath("/foods");
    return {
      status: "success",
      message: "foods.created",
    };
  } catch {
    return { status: "error", message: "foods.error" };
  }
}

export async function updateCustomFoodAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  const foodId = String(formData.get("foodId") ?? "");
  if (!foodId) return { status: "error", message: "foods.notFound" };
  const parsed = parseCustomFood(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "validation.errorSummary",
      fieldErrors: errorFromZod(parsed.error.issues),
    };
  }
  try {
    const food = await updateCustomFood(viewer.user.id, foodId, {
      source: "custom",
      externalId: null,
      barcode: parsed.data.barcode || null,
      name: parsed.data.name,
      brand: parsed.data.brand || null,
      basisType: parsed.data.basisType,
      servingSize: parsed.data.servingSize,
      servingUnit: parsed.data.servingUnit,
      nutrients: parsed.data.nutrients,
      imageUrl: null,
      preparation: parsed.data.preparation,
      packageQuantity: parsed.data.packageQuantity,
      packageUnit: parsed.data.packageUnit,
      drainedWeight: parsed.data.drainedWeight,
      ...(parsePhoto(parsed.data.photo) ?? {}),
    });
    if (!food) return { status: "error", message: "foods.notFound" };
    revalidatePath("/foods");
    return { status: "success", message: "foods.updated" };
  } catch {
    return { status: "error", message: "foods.error" };
  }
}

export async function deleteFoodAction(
  foodId: string,
): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(foodId);
  if (!parsed.success) return { ok: false, error: "foods.notFound" };
  const food = await getOwnedFood(viewer.user.id, foodId);
  if (!food) return { ok: false, error: "foods.notFound" };
  const deleted = await deleteFood(viewer.user.id, foodId);
  if (!deleted) return { ok: false, error: "foods.notFound" };
  revalidateAll();
  return { ok: true, message: "foods.deleted" };
}
