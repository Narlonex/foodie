-- Goal weight and pacing power the projection and the goal simulator.
ALTER TABLE profiles
  ADD COLUMN goal_weight_kg numeric(5, 1)
    CHECK (goal_weight_kg IS NULL OR (goal_weight_kg >= 20 AND goal_weight_kg <= 500)),
  ADD COLUMN goal_rate_kg_per_week numeric(4, 2)
    CHECK (
      goal_rate_kg_per_week IS NULL
      OR (goal_rate_kg_per_week >= 0.05 AND goal_rate_kg_per_week <= 2.00)
    );

-- Water, caffeine and alcohol are simple daily totals. One row per user/day.
CREATE TABLE daily_habits (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date         date NOT NULL,
  water_ml     integer NOT NULL DEFAULT 0 CHECK (water_ml >= 0 AND water_ml <= 20000),
  caffeine_mg  integer NOT NULL DEFAULT 0 CHECK (caffeine_mg >= 0 AND caffeine_mg <= 5000),
  alcohol_units numeric(5, 2) NOT NULL DEFAULT 0
               CHECK (alcohol_units >= 0 AND alcohol_units <= 100),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX daily_habits_user_date_idx ON daily_habits (user_id, date DESC);

CREATE TRIGGER daily_habits_set_updated_at BEFORE UPDATE ON daily_habits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tape measurements are stored separately from weight so either can be missing.
CREATE TABLE body_measurements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date        date NOT NULL,
  waist_cm    numeric(5, 1) CHECK (waist_cm IS NULL OR (waist_cm >= 20 AND waist_cm <= 300)),
  hips_cm     numeric(5, 1) CHECK (hips_cm IS NULL OR (hips_cm >= 20 AND hips_cm <= 300)),
  chest_cm    numeric(5, 1) CHECK (chest_cm IS NULL OR (chest_cm >= 20 AND chest_cm <= 300)),
  thigh_cm    numeric(5, 1) CHECK (thigh_cm IS NULL OR (thigh_cm >= 20 AND thigh_cm <= 300)),
  arm_cm      numeric(5, 1) CHECK (arm_cm IS NULL OR (arm_cm >= 20 AND arm_cm <= 300)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date),
  CONSTRAINT body_measurements_any_value CHECK (
    waist_cm IS NOT NULL OR hips_cm IS NOT NULL OR chest_cm IS NOT NULL
    OR thigh_cm IS NOT NULL OR arm_cm IS NOT NULL
  )
);

CREATE INDEX body_measurements_user_date_idx ON body_measurements (user_id, date DESC);

CREATE TRIGGER body_measurements_set_updated_at BEFORE UPDATE ON body_measurements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
