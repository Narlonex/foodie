-- Weight history powers the trend chart and the weekly adaptive check-in.
-- One entry per user per day; saving the same date again updates that day.
CREATE TABLE weight_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date       date NOT NULL,
  weight_kg  numeric(5, 1) NOT NULL
             CHECK (weight_kg >= 20 AND weight_kg <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX weight_logs_user_date_idx ON weight_logs (user_id, date DESC);

CREATE TRIGGER weight_logs_set_updated_at
  BEFORE UPDATE ON weight_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The profile already stores the current weight. Seed it as the first point so
-- the chart is not empty on an existing account.
INSERT INTO weight_logs (user_id, date, weight_kg)
SELECT user_id, CURRENT_DATE, weight_kg
  FROM profiles
 WHERE weight_kg IS NOT NULL
ON CONFLICT (user_id, date) DO NOTHING;
