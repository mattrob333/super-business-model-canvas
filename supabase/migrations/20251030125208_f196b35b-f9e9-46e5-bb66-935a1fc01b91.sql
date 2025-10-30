-- Add foreign key constraint to link reports to saved analyses
-- (only if it doesn't exist already)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_generated_reports_analysis'
  ) THEN
    ALTER TABLE generated_reports
    ADD CONSTRAINT fk_generated_reports_analysis
    FOREIGN KEY (company_id) REFERENCES saved_analyses(id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add index for user + framework queries (if doesn't exist)
CREATE INDEX IF NOT EXISTS idx_generated_reports_user_framework 
ON generated_reports(user_id, framework_id);