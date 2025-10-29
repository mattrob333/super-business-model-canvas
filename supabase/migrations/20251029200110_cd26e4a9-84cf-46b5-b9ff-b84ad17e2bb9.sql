-- Drop indexes explicitly first
DROP INDEX IF EXISTS public.idx_frameworks_shortcut CASCADE;
DROP INDEX IF EXISTS public.idx_frameworks_category CASCADE;
DROP INDEX IF EXISTS public.idx_frameworks_status CASCADE;
DROP INDEX IF EXISTS public.idx_frameworks_tags CASCADE;
DROP INDEX IF EXISTS public.idx_framework_executions_framework_id CASCADE;
DROP INDEX IF EXISTS public.idx_framework_executions_user_id CASCADE;

-- Drop existing tables and types
DROP TABLE IF EXISTS public.framework_executions CASCADE;
DROP TABLE IF EXISTS public.frameworks CASCADE;
DROP TYPE IF EXISTS framework_status CASCADE;

-- Create enum for framework status
CREATE TYPE framework_status AS ENUM ('draft', 'active', 'archived');

-- Create frameworks table
CREATE TABLE public.frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  title VARCHAR(255) NOT NULL,
  shortcut VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(100),
  tags TEXT[],
  status framework_status DEFAULT 'draft',
  
  -- Strategic Context
  stages TEXT[],
  departments TEXT[],
  goal_alignment TEXT[],
  when_to_use TEXT,
  
  -- Relationships
  upstream_frameworks UUID[],
  downstream_frameworks UUID[],
  
  -- AI Configuration
  ai_model VARCHAR(100) DEFAULT 'google/gemini-2.5-flash',
  system_prompt TEXT,
  analysis_prompt TEXT NOT NULL,
  response_schema JSONB,
  max_tokens INTEGER DEFAULT 4000,
  temperature DECIMAL(2,1) DEFAULT 0.7,
  estimated_time INTEGER DEFAULT 15,
  
  -- Output Configuration
  template_type VARCHAR(50) DEFAULT 'html',
  layout_style VARCHAR(50),
  output_template TEXT NOT NULL,
  custom_css TEXT,
  
  -- Settings
  requires_business_context BOOLEAN DEFAULT true,
  validate_json BOOLEAN DEFAULT true,
  required_upstream UUID[],
  show_in_playbooks BOOLEAN DEFAULT true,
  allow_manual_edit BOOLEAN DEFAULT true,
  allow_pdf_export BOOLEAN DEFAULT true,
  icon VARCHAR(50),
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0,
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_version UUID REFERENCES public.frameworks(id)
);

-- Create framework_executions table
CREATE TABLE public.framework_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID REFERENCES public.frameworks(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.saved_analyses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Input
  input_data JSONB,
  
  -- Execution
  ai_model VARCHAR(100),
  prompt_used TEXT,
  tokens_used INTEGER,
  execution_time INTEGER,
  
  -- Output
  raw_response JSONB,
  rendered_html TEXT,
  validation_passed BOOLEAN,
  validation_errors JSONB,
  
  -- Status
  status VARCHAR(50),
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- User Actions
  manually_edited BOOLEAN DEFAULT false,
  exported_to_pdf BOOLEAN DEFAULT false
);

-- Create indexes
CREATE INDEX idx_frameworks_shortcut ON public.frameworks(shortcut);
CREATE INDEX idx_frameworks_category ON public.frameworks(category);
CREATE INDEX idx_frameworks_status ON public.frameworks(status);
CREATE INDEX idx_frameworks_tags ON public.frameworks USING GIN(tags);
CREATE INDEX idx_framework_executions_framework_id ON public.framework_executions(framework_id);
CREATE INDEX idx_framework_executions_user_id ON public.framework_executions(user_id);

-- Enable RLS
ALTER TABLE public.frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for frameworks
CREATE POLICY "Anyone can view active frameworks"
  ON public.frameworks
  FOR SELECT
  USING (status = 'active' OR auth.uid() = created_by);

CREATE POLICY "Admins can insert frameworks"
  ON public.frameworks
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update frameworks"
  ON public.frameworks
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete frameworks"
  ON public.frameworks
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for framework_executions
CREATE POLICY "Users can view own executions"
  ON public.framework_executions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own executions"
  ON public.framework_executions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all executions"
  ON public.framework_executions
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_frameworks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_frameworks_updated_at
  BEFORE UPDATE ON public.frameworks
  FOR EACH ROW
  EXECUTE FUNCTION update_frameworks_updated_at();