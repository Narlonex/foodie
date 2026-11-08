-- A shared, read-only food catalog. Rows are imported from Open Food Facts
-- and USDA; a user's diary still stores its own snapshot in `foods`.
CREATE TABLE catalog_foods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('off', 'usda')),
  external_id       text NOT NULL,
  barcode           text,
  name              text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  normalized_name   text NOT NULL,
  search_text       text NOT NULL,
  brand             text,
  category          text NOT NULL DEFAULT 'other',
  image_url         text,
  basis_type        text NOT NULL DEFAULT '100g' CHECK (basis_type IN ('100g', '100ml', 'serving')),
  serving_size      numeric(10, 3) CHECK (serving_size IS NULL OR (serving_size > 0 AND serving_size <= 100000)),
  serving_unit      text CHECK (serving_unit IN ('g', 'ml')),
  kcal              numeric(12, 4) CHECK (kcal IS NULL OR kcal >= 0),
  kj                numeric(12, 4) CHECK (kj IS NULL OR kj >= 0),
  protein_g         numeric(12, 4) CHECK (protein_g IS NULL OR protein_g >= 0),
  carbs_g           numeric(12, 4) CHECK (carbs_g IS NULL OR carbs_g >= 0),
  sugars_g          numeric(12, 4) CHECK (sugars_g IS NULL OR sugars_g >= 0),
  fat_g             numeric(12, 4) CHECK (fat_g IS NULL OR fat_g >= 0),
  sat_fat_g         numeric(12, 4) CHECK (sat_fat_g IS NULL OR sat_fat_g >= 0),
  fiber_g           numeric(12, 4) CHECK (fiber_g IS NULL OR fiber_g >= 0),
  salt_g            numeric(12, 4) CHECK (salt_g IS NULL OR salt_g >= 0),
  energy_source     text NOT NULL DEFAULT 'unknown' CHECK (energy_source IN ('provided', 'calculated', 'unknown')),
  preparation       text NOT NULL DEFAULT 'unspecified' CHECK (preparation IN ('raw', 'cooked', 'unspecified')),
  package_quantity  numeric(12, 3) CHECK (package_quantity IS NULL OR package_quantity > 0),
  package_unit      text CHECK (package_unit IN ('g', 'ml')),
  drained_weight    numeric(12, 3) CHECK (drained_weight IS NULL OR drained_weight > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_foods_basis_serving_check CHECK (
    (basis_type = 'serving' AND serving_size IS NOT NULL)
    OR basis_type IN ('100g', '100ml')
  )
);

CREATE UNIQUE INDEX catalog_foods_source_external_uq
  ON catalog_foods (source, external_id);
CREATE INDEX catalog_foods_normalized_name_idx
  ON catalog_foods (normalized_name);
CREATE INDEX catalog_foods_category_idx
  ON catalog_foods (category);
CREATE INDEX catalog_foods_barcode_idx
  ON catalog_foods (barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX catalog_foods_search_text_idx
  ON catalog_foods (search_text);
