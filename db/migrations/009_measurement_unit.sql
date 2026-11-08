ALTER TABLE profiles ADD COLUMN measurement_unit text;

UPDATE profiles
   SET measurement_unit = CASE
         WHEN unit_system = 'imperial' THEN 'in'
         ELSE 'cm'
       END;

ALTER TABLE profiles
  ALTER COLUMN measurement_unit SET DEFAULT 'cm',
  ALTER COLUMN measurement_unit SET NOT NULL;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_measurement_unit_check
  CHECK (measurement_unit IN ('cm', 'in'));
