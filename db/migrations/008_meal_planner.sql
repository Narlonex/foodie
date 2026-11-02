-- Additive migration: weekly meal plan, generated shopping list and pantry.
-- Plan rows keep a nutrition snapshot, so editing a recipe later never rewrites
-- a planned day or what was logged from it.

CREATE TABLE meal_plan_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_date    date NOT NULL,
  meal         text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  saved_meal_id uuid REFERENCES saved_meals (id) ON DELETE SET NULL,
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  amount       numeric(10, 3) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  amount_unit  text NOT NULL CHECK (amount_unit IN ('g', 'serving')),
  basis_type   text NOT NULL CHECK (basis_type IN ('100g', 'serving')),
  serving_size numeric(10, 3) CHECK (serving_size IS NULL OR serving_size > 0),
  nutrients    jsonb NOT NULL,
  ingredients  jsonb NOT NULL DEFAULT '[]'::jsonb,
  logged_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meal_plan_items_user_date_idx
  ON meal_plan_items (user_id, plan_date);

CREATE TABLE shopping_list_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  name_key   text NOT NULL,
  quantity   numeric(12, 3) CHECK (quantity IS NULL OR quantity > 0),
  unit       text NOT NULL CHECK (unit IN ('g', 'ml', 'pcs', 'serving')),
  checked    boolean NOT NULL DEFAULT false,
  source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'plan')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shopping_list_items_key_uq
  ON shopping_list_items (user_id, name_key, unit);
CREATE INDEX shopping_list_items_user_idx
  ON shopping_list_items (user_id, checked);

CREATE TABLE pantry_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  name_key   text NOT NULL,
  quantity   numeric(12, 3) NOT NULL CHECK (quantity > 0 AND quantity <= 1000000),
  unit       text NOT NULL CHECK (unit IN ('g', 'ml', 'pcs')),
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pantry_items_user_idx ON pantry_items (user_id);
CREATE INDEX pantry_items_expiry_idx ON pantry_items (user_id, expires_on);
