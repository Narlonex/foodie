-- Foodie initial schema (PostgreSQL 14+, compatible with Neon).
-- Every private row belongs to a user; application queries always scope by user_id.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE day_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  kcal            numeric(8, 2) NOT NULL CHECK (kcal > 0 AND kcal <= 20000),
  protein_g       numeric(8, 2) NOT NULL CHECK (protein_g >= 0 AND protein_g <= 2000),
  carbs_g         numeric(8, 2) NOT NULL CHECK (carbs_g >= 0 AND carbs_g <= 2000),
  fat_g           numeric(8, 2) NOT NULL CHECK (fat_g >= 0 AND fat_g <= 1000),
  adjustment_mode text NOT NULL CHECK (adjustment_mode IN ('carbs', 'fats', 'proteins', 'all')),
  protein_pct     numeric(6, 2) NOT NULL CHECK (protein_pct >= 0 AND protein_pct <= 100),
  carbs_pct       numeric(6, 2) NOT NULL CHECK (carbs_pct >= 0 AND carbs_pct <= 100),
  fat_pct         numeric(6, 2) NOT NULL CHECK (fat_pct >= 0 AND fat_pct <= 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX day_types_user_name_uq ON day_types (user_id, lower(btrim(name)));
CREATE INDEX day_types_user_idx ON day_types (user_id);

CREATE TABLE profiles (
  user_id              uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  language             text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sk')),
  theme                text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  unit_system          text NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric', 'imperial')),
  goal_mode            text NOT NULL DEFAULT 'maintenance' CHECK (goal_mode IN ('cut', 'maintenance', 'bulk')),
  maintenance_calories numeric(7, 1) CHECK (maintenance_calories IS NULL OR (maintenance_calories >= 500 AND maintenance_calories <= 20000)),
  default_day_type_id  uuid REFERENCES day_types (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_default_day_type_idx ON profiles (default_day_type_id);

CREATE TABLE day_assignments (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date        date NOT NULL,
  day_type_id uuid NOT NULL REFERENCES day_types (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX day_assignments_day_type_idx ON day_assignments (day_type_id);
CREATE INDEX day_assignments_user_type_idx ON day_assignments (user_id, day_type_id);

CREATE TABLE foods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source       text NOT NULL CHECK (source IN ('off', 'usda', 'custom')),
  external_id  text,
  barcode      text CHECK (barcode IS NULL OR barcode ~ '^[0-9]{6,20}$'),
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  brand        text CHECK (brand IS NULL OR char_length(brand) <= 200),
  basis_type   text NOT NULL CHECK (basis_type IN ('100g', '100ml', 'serving')),
  serving_size numeric(10, 3) CHECK (serving_size IS NULL OR (serving_size > 0 AND serving_size <= 100000)),
  serving_unit text CHECK (serving_unit IN ('g', 'ml')),
  kcal         numeric(12, 4) CHECK (kcal IS NULL OR kcal >= 0),
  kj           numeric(12, 4) CHECK (kj IS NULL OR kj >= 0),
  protein_g    numeric(12, 4) CHECK (protein_g IS NULL OR protein_g >= 0),
  carbs_g      numeric(12, 4) CHECK (carbs_g IS NULL OR carbs_g >= 0),
  sugars_g     numeric(12, 4) CHECK (sugars_g IS NULL OR sugars_g >= 0),
  fat_g        numeric(12, 4) CHECK (fat_g IS NULL OR fat_g >= 0),
  sat_fat_g    numeric(12, 4) CHECK (sat_fat_g IS NULL OR sat_fat_g >= 0),
  fiber_g      numeric(12, 4) CHECK (fiber_g IS NULL OR fiber_g >= 0),
  salt_g       numeric(12, 4) CHECK (salt_g IS NULL OR salt_g >= 0),
  energy_source text NOT NULL DEFAULT 'unknown' CHECK (energy_source IN ('provided', 'calculated', 'unknown')),
  is_favorite  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foods_basis_serving_check CHECK (
    (basis_type = 'serving' AND serving_size IS NOT NULL)
    OR basis_type IN ('100g', '100ml')
  )
);

CREATE UNIQUE INDEX foods_user_source_external_uq
  ON foods (user_id, source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX foods_user_idx ON foods (user_id);
CREATE INDEX foods_user_favorite_idx ON foods (user_id, is_favorite);
CREATE INDEX foods_user_source_idx ON foods (user_id, source);

CREATE TABLE diary_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date         date NOT NULL,
  meal         text NOT NULL CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_id      uuid REFERENCES foods (id) ON DELETE SET NULL,
  source       text NOT NULL CHECK (source IN ('off', 'usda', 'custom')),
  name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  brand        text,
  barcode      text,
  basis_type   text NOT NULL CHECK (basis_type IN ('100g', '100ml', 'serving')),
  serving_size numeric(10, 3),
  serving_unit text,
  kcal         numeric(12, 4),
  kj           numeric(12, 4),
  protein_g    numeric(12, 4),
  carbs_g      numeric(12, 4),
  sugars_g     numeric(12, 4),
  fat_g        numeric(12, 4),
  sat_fat_g    numeric(12, 4),
  fiber_g      numeric(12, 4),
  salt_g       numeric(12, 4),
  energy_source text NOT NULL DEFAULT 'unknown' CHECK (energy_source IN ('provided', 'calculated', 'unknown')),
  amount       numeric(12, 3) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  amount_unit  text NOT NULL CHECK (amount_unit IN ('g', 'ml', 'serving')),
  logged_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_entries_unit_basis_check CHECK (
    (basis_type = '100g' AND amount_unit = 'g')
    OR (basis_type = '100ml' AND amount_unit = 'ml')
    OR (basis_type = 'serving' AND amount_unit = 'serving')
  ),
  CONSTRAINT diary_entries_energy_nonnegative CHECK (
    (kcal IS NULL OR kcal >= 0) AND (kj IS NULL OR kj >= 0)
  )
);

CREATE INDEX diary_entries_user_date_idx ON diary_entries (user_id, date);
CREATE INDEX diary_entries_user_logged_idx ON diary_entries (user_id, logged_at DESC);
CREATE INDEX diary_entries_user_food_idx ON diary_entries (user_id, food_id);

CREATE TABLE saved_meals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX saved_meals_user_name_uq ON saved_meals (user_id, lower(btrim(name)));
CREATE INDEX saved_meals_user_idx ON saved_meals (user_id);

CREATE TABLE saved_meal_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_meal_id uuid NOT NULL REFERENCES saved_meals (id) ON DELETE CASCADE,
  food_id       uuid NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  amount        numeric(12, 3) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  amount_unit   text NOT NULL CHECK (amount_unit IN ('g', 'ml', 'serving')),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saved_meal_id, food_id)
);

CREATE INDEX saved_meal_items_meal_idx ON saved_meal_items (saved_meal_id);
CREATE INDEX saved_meal_items_food_idx ON saved_meal_items (food_id);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER day_types_set_updated_at BEFORE UPDATE ON day_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER foods_set_updated_at BEFORE UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER diary_entries_set_updated_at BEFORE UPDATE ON diary_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER saved_meals_set_updated_at BEFORE UPDATE ON saved_meals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
