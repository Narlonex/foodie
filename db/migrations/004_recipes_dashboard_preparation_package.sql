-- Additive migration: recipes, dashboard preferences, preparation state and
-- package data. Every column is nullable or has a backwards-compatible default,
-- so existing foods, diary entries and preferences keep their current meaning.

-- 1. Recipe fields on the existing saved-meal entity. A saved meal without a
--    final weight stays exactly what it was before: a reusable ingredient list.
ALTER TABLE saved_meals
  ADD COLUMN final_weight_g numeric(12, 3)
    CHECK (final_weight_g IS NULL OR (final_weight_g > 0 AND final_weight_g <= 100000));
ALTER TABLE saved_meals
  ADD COLUMN servings numeric(10, 3)
    CHECK (servings IS NULL OR (servings > 0 AND servings <= 1000));

-- 2. How a food was prepared. Nothing is inferred for existing rows: they are
--    explicitly "unspecified" so no label is guessed on historic data.
ALTER TABLE foods
  ADD COLUMN preparation text NOT NULL DEFAULT 'unspecified'
    CHECK (preparation IN ('raw', 'cooked', 'unspecified'));

ALTER TABLE diary_entries
  ADD COLUMN preparation text NOT NULL DEFAULT 'unspecified'
    CHECK (preparation IN ('raw', 'cooked', 'unspecified'));

-- 3. Package data used by the package calculator. Net quantity and drained
--    weight are separate columns: they answer different questions.
ALTER TABLE foods
  ADD COLUMN package_quantity numeric(12, 3)
    CHECK (package_quantity IS NULL OR (package_quantity > 0 AND package_quantity <= 100000));
ALTER TABLE foods
  ADD COLUMN package_unit text
    CHECK (package_unit IS NULL OR package_unit IN ('g', 'ml'));
ALTER TABLE foods
  ADD COLUMN drained_weight numeric(12, 3)
    CHECK (drained_weight IS NULL OR (drained_weight > 0 AND drained_weight <= 100000));

ALTER TABLE foods
  ADD CONSTRAINT foods_package_pair_check CHECK (
    (package_quantity IS NULL AND package_unit IS NULL)
    OR (package_quantity IS NOT NULL AND package_unit IS NOT NULL)
  );

-- 4. Which nutrient cards the dashboard shows. Calories stay visible by
--    design, so the default lists every supported nutrient.
ALTER TABLE profiles
  ADD COLUMN dashboard_nutrients text[] NOT NULL
    DEFAULT ARRAY['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugars', 'salt']::text[];
