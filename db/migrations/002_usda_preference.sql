-- Per-user switch for the optional USDA FoodData Central food source.
ALTER TABLE profiles
  ADD COLUMN usda_enabled boolean NOT NULL DEFAULT true;
