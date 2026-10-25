import { z } from "zod";
import { isValidIsoDate } from "./dates";
import { MEALS, NUTRIENT_KEYS } from "./types";

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email("validation.email")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "validation.passwordLength")
  .max(200, "validation.passwordLength");

export const languageSchema = z.enum(["en", "sk"]);
export const themeSchema = z.enum(["dark", "light"]);
export const unitSystemSchema = z.enum(["metric", "imperial"]);
export const goalModeSchema = z.enum(["cut", "maintenance", "bulk"]);
export const adjustmentModeSchema = z.enum(["carbs", "fats", "proteins", "all"]);
export const mealSchema = z.enum(MEALS);
export const basisTypeSchema = z.enum(["100g", "100ml", "serving"]);
export const amountUnitSchema = z.enum(["g", "ml", "serving"]);
export const displayAmountUnitSchema = z.enum([
  "g",
  "ml",
  "oz",
  "floz",
  "serving",
]);
export const foodSourceSchema = z.enum(["off", "usda", "custom"]);
export const sexSchema = z.enum(["female", "male", "other"]);
export const activityLevelSchema = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);

export const bodyMetricsSchema = z.object({
  heightCm: z.number().finite("validation.height").min(50, "validation.height").max(300, "validation.height").nullable(),
  weightKg: z.number().finite("validation.weight").min(20, "validation.weight").max(500, "validation.weight").nullable(),
  age: z.number().int("validation.age").min(13, "validation.age").max(120, "validation.age").nullable(),
  sex: sexSchema.nullable(),
  activityLevel: activityLevelSchema.nullable(),
  goalMode: goalModeSchema,
});

export const isoDateSchema = z
  .string()
  .refine((value) => isValidIsoDate(value), "validation.date");

export const positiveAmountSchema = z
  .number()
  .finite("validation.amount")
  .positive("validation.amount")
  .max(100_000, "validation.amount");

const nullableNutrientSchema = z
  .number()
  .finite("validation.nutrient")
  .nonnegative("validation.nutrient")
  .max(1_000_000, "validation.nutrient")
  .nullable();

export const nutrientsSchema = z.object(
  Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [key, nullableNutrientSchema]),
  ) as Record<(typeof NUTRIENT_KEYS)[number], typeof nullableNutrientSchema>,
);

export const foodInputSchema = z
  .object({
    source: foodSourceSchema,
    externalId: z.string().trim().max(200).nullable(),
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9]{6,20}$/, "validation.barcode")
      .nullable(),
    name: z.string().trim().min(1, "validation.foodName").max(200, "validation.foodName"),
    brand: z.string().trim().max(200, "validation.brand").nullable(),
    basisType: basisTypeSchema,
    servingSize: z.number().finite().positive("validation.servingSize").max(100_000).nullable(),
    servingUnit: z.enum(["g", "ml"]).nullable(),
    nutrients: nutrientsSchema,
    imageUrl: z.string().trim().max(2048).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.basisType === "serving" && value.servingSize === null) {
      context.addIssue({
        code: "custom",
        path: ["servingSize"],
        message: "validation.servingSize",
      });
    }
    if (value.basisType !== "serving" && value.servingSize !== null) {
      context.addIssue({
        code: "custom",
        path: ["servingSize"],
        message: "validation.servingSize",
      });
    }
  });

export const customFoodSchema = z
  .object({
    name: z.string().trim().min(1, "validation.foodName").max(200, "validation.foodName"),
    brand: z.string().trim().max(200, "validation.brand").optional().default(""),
    barcode: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^[0-9]{6,20}$/.test(value),
        "validation.barcode",
      )
      .optional()
      .default(""),
    basisType: basisTypeSchema,
    servingSize: z.number().finite().positive("validation.servingSize").max(100_000).nullable(),
    servingUnit: z.enum(["g", "ml"]).nullable(),
    nutrients: nutrientsSchema,
    /** Optional data URL (client-downscaled JPEG/PNG/WebP) for a custom photo. */
    photo: z.string().max(3_000_000).optional().default(""),
  })
  .superRefine((value, context) => {
    if (value.basisType === "serving" && value.servingSize === null) {
      context.addIssue({
        code: "custom",
        path: ["servingSize"],
        message: "validation.servingSize",
      });
    }
    if (value.basisType !== "serving" && value.servingSize !== null) {
      context.addIssue({
        code: "custom",
        path: ["servingSize"],
        message: "validation.servingSize",
      });
    }
  });

export const dayTypeFormSchema = z.object({
  name: z.string().trim().min(1, "validation.dayTypeName").max(60, "validation.dayTypeName"),
  kcal: z.coerce.number().finite("validation.calories").positive("validation.calories").max(20_000, "validation.calories"),
  protein: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(2_000, "validation.macro"),
  carbs: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(2_000, "validation.macro"),
  fat: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(1_000, "validation.macro"),
  adjustmentMode: adjustmentModeSchema,
  proteinPct: z.coerce.number().finite("validation.percent").min(0, "validation.percent").max(100, "validation.percent"),
  carbsPct: z.coerce.number().finite("validation.percent").min(0, "validation.percent").max(100, "validation.percent"),
  fatPct: z.coerce.number().finite("validation.percent").min(0, "validation.percent").max(100, "validation.percent"),
});

export const manualTargetsSchema = z.object({
  kcal: z.coerce.number().finite("validation.calories").positive("validation.calories").max(20_000, "validation.calories"),
  protein: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(2_000, "validation.macro"),
  carbs: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(2_000, "validation.macro"),
  fat: z.coerce.number().finite("validation.macro").nonnegative("validation.macro").max(1_000, "validation.macro"),
});

export const savedMealNameSchema = z
  .string()
  .trim()
  .min(1, "validation.savedMealName")
  .max(80, "validation.savedMealName");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.required"),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  language: languageSchema.default("en"),
});

export type FoodInput = z.infer<typeof foodInputSchema>;
export type BodyMetricsInput = z.infer<typeof bodyMetricsSchema>;
export type DayTypeFormInput = z.infer<typeof dayTypeFormSchema>;
export type ManualTargetsInput = z.infer<typeof manualTargetsSchema>;
