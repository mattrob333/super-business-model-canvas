-- Add new columns to generated_reports table for HTML report support
ALTER TABLE generated_reports 
ADD COLUMN IF NOT EXISTS report_format VARCHAR(20) DEFAULT 'markdown',
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_content TEXT;

-- Create index for faster company report queries
CREATE INDEX IF NOT EXISTS idx_generated_reports_company_id ON generated_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_user_company ON generated_reports(user_id, company_id);