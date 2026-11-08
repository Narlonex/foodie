-- Foodie network layer: scalable catalog search, missing-food radar,
-- verified user submissions, shared households and coach clients.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE catalog_foods
  ADD COLUMN country text CHECK (country IS NULL OR char_length(country) <= 80),
  ADD COLUMN verified boolean NOT NULL DEFAULT false,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN completeness smallint GENERATED ALWAYS AS (
    (
      (kcal IS NOT NULL)::int +
      (kj IS NOT NULL)::int +
      (protein_g IS NOT NULL)::int +
      (carbs_g IS NOT NULL)::int +
      (sugars_g IS NOT NULL)::int +
      (fat_g IS NOT NULL)::int +
      (sat_fat_g IS NOT NULL)::int +
      (fiber_g IS NOT NULL)::int +
      (salt_g IS NOT NULL)::int
    )::smallint
  ) STORED,
  ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || search_text
    )
  ) STORED;

CREATE INDEX catalog_foods_search_vector_idx
  ON catalog_foods USING gin (search_vector);
CREATE INDEX catalog_foods_search_trgm_idx
  ON catalog_foods USING gin (search_text gin_trgm_ops);
CREATE INDEX catalog_foods_verified_idx
  ON catalog_foods (verified, category);
CREATE INDEX catalog_foods_country_idx
  ON catalog_foods (country)
  WHERE country IS NOT NULL;

-- Structured aliases replace relying on one flat search string. They are
-- populated by the importer and by approved local submissions.
CREATE TABLE catalog_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_food_id uuid NOT NULL REFERENCES catalog_foods (id) ON DELETE CASCADE,
  alias           text NOT NULL CHECK (char_length(btrim(alias)) BETWEEN 1 AND 200),
  normalized_alias text NOT NULL,
  language        text CHECK (language IS NULL OR language IN ('en', 'sk', 'cs')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_food_id, normalized_alias)
);

CREATE INDEX catalog_aliases_normalized_idx
  ON catalog_aliases (normalized_alias);

-- Zero-result searches are aggregated without a user id. This is the input
-- for targeted imports and the "missing food" admin view.
CREATE TABLE catalog_search_misses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query            text NOT NULL CHECK (char_length(btrim(query)) BETWEEN 2 AND 80),
  normalized_query text NOT NULL UNIQUE,
  results_count    integer NOT NULL DEFAULT 0 CHECK (results_count >= 0),
  hits             integer NOT NULL DEFAULT 1 CHECK (hits > 0),
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_search_misses_last_seen_idx
  ON catalog_search_misses (last_seen_at DESC);

CREATE TABLE catalog_import_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  fetched        integer NOT NULL DEFAULT 0 CHECK (fetched >= 0),
  written        integer NOT NULL DEFAULT 0 CHECK (written >= 0),
  failed_queries integer NOT NULL DEFAULT 0 CHECK (failed_queries >= 0),
  notes          text
);

CREATE INDEX catalog_import_runs_started_idx
  ON catalog_import_runs (started_at DESC);

-- User-created foods can be submitted to the shared catalog. An admin reviews
-- them before they become visible to everyone as verified rows.
CREATE TABLE food_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  brand           text CHECK (brand IS NULL OR char_length(brand) <= 200),
  barcode         text CHECK (barcode IS NULL OR barcode ~ '^[0-9]{6,20}$'),
  category        text NOT NULL DEFAULT 'other' CHECK (char_length(category) <= 40),
  basis_type      text NOT NULL CHECK (basis_type IN ('100g', '100ml', 'serving')),
  serving_size    numeric(10, 3) CHECK (serving_size IS NULL OR serving_size > 0),
  serving_unit    text CHECK (serving_unit IS NULL OR serving_unit IN ('g', 'ml')),
  nutrients       jsonb NOT NULL,
  notes           text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  review_note     text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  catalog_food_id uuid REFERENCES catalog_foods (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT food_submissions_basis_check CHECK (
    (basis_type = 'serving' AND serving_size IS NOT NULL)
    OR basis_type IN ('100g', '100ml')
  )
);

CREATE INDEX food_submissions_status_idx
  ON food_submissions (status, created_at DESC);
CREATE INDEX food_submissions_user_idx
  ON food_submissions (user_id, created_at DESC);

ALTER TABLE profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- On a fresh deployment the first registered account is the owner/operator.
-- This runs once; later admins can be granted directly in SQL.
UPDATE profiles
   SET is_admin = true
 WHERE user_id = (
   SELECT id FROM users ORDER BY created_at, id LIMIT 1
 );

CREATE TABLE households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE CHECK (char_length(invite_code) BETWEEN 6 AND 16),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  UNIQUE (user_id)
);

CREATE INDEX household_members_household_idx
  ON household_members (household_id);

CREATE TABLE coach_clients (
  coach_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, client_id),
  CHECK (coach_id <> client_id)
);

CREATE INDEX coach_clients_client_idx
  ON coach_clients (client_id, status);

CREATE TABLE coach_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 6 AND 16),
  coach_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coach_invites_coach_idx
  ON coach_invites (coach_id, created_at DESC);
