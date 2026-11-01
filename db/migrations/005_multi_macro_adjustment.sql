-- Day types can recalculate any combination of macros (for example carbs and
-- fats together). Existing single-mode and "all" rows stay valid, so this is a
-- pure constraint change with no data rewrite.
ALTER TABLE day_types
  DROP CONSTRAINT IF EXISTS day_types_adjustment_mode_check;

ALTER TABLE day_types
  ADD CONSTRAINT day_types_adjustment_mode_check CHECK (
    adjustment_mode IN (
      'all',
      'carbs',
      'fats',
      'proteins',
      'carbs,fats',
      'carbs,proteins',
      'fats,proteins',
      'carbs,fats,proteins'
    )
  );
