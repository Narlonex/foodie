-- Food photos, body metrics and first-login onboarding state.

ALTER TABLE foods
  ADD COLUMN image_url text,
  ADD COLUMN image_data bytea,
  ADD COLUMN image_mime text;

ALTER TABLE foods
  ADD CONSTRAINT foods_image_size_check
    CHECK (image_data IS NULL OR octet_length(image_data) <= 2000000),
  ADD CONSTRAINT foods_image_pair_check
    CHECK ((image_data IS NULL) = (image_mime IS NULL));

ALTER TABLE diary_entries
  ADD COLUMN image_url text;

ALTER TABLE profiles
  ADD COLUMN height_cm numeric(5, 1) CHECK (height_cm IS NULL OR (height_cm >= 50 AND height_cm <= 300)),
  ADD COLUMN weight_kg numeric(5, 1) CHECK (weight_kg IS NULL OR (weight_kg >= 20 AND weight_kg <= 500)),
  ADD COLUMN age smallint CHECK (age IS NULL OR (age >= 13 AND age <= 120)),
  ADD COLUMN sex text CHECK (sex IS NULL OR sex IN ('female', 'male', 'other')),
  ADD COLUMN activity_level text CHECK (
    activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')
  ),
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
