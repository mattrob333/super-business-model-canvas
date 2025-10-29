-- First, drop the old foreign key constraint
ALTER TABLE public.generated_reports
DROP CONSTRAINT IF EXISTS generated_reports_framework_id_fkey;

-- Convert framework_id column from varchar to uuid
-- Note: This will clear any existing data in this column if it's not valid UUID format
ALTER TABLE public.generated_reports
ALTER COLUMN framework_id TYPE uuid USING 
  CASE 
    WHEN framework_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN framework_id::uuid 
    ELSE NULL 
  END;

-- Add new foreign key constraint pointing to frameworks table
ALTER TABLE public.generated_reports
ADD CONSTRAINT generated_reports_framework_id_fkey
FOREIGN KEY (framework_id) REFERENCES public.frameworks(id) ON DELETE CASCADE;