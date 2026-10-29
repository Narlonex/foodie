-- Czech interface language.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_language_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_language_check
  CHECK (language IN ('en', 'sk', 'cs'));
