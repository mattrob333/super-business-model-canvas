-- Create strategic_frameworks table
CREATE TABLE strategic_frameworks (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  shortcut VARCHAR(10),
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  when_to_use TEXT[],
  departments TEXT[],
  company_stages TEXT[],
  goal_alignment TEXT[],
  estimated_time INT DEFAULT 45,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_frameworks_category ON strategic_frameworks(category);
CREATE INDEX idx_frameworks_status ON strategic_frameworks(status);

-- Create generated_reports table
CREATE TABLE generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES saved_analyses(id) ON DELETE CASCADE,
  framework_id VARCHAR(100) REFERENCES strategic_frameworks(id),
  company_name VARCHAR(255) NOT NULL,
  report_content TEXT NOT NULL,
  business_context JSONB NOT NULL,
  strategic_goal TEXT,
  version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_user ON generated_reports(user_id);
CREATE INDEX idx_reports_company ON generated_reports(company_id);
CREATE INDEX idx_reports_framework ON generated_reports(framework_id);

-- Create strategy_sessions table
CREATE TABLE strategy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES saved_analyses(id) ON DELETE SET NULL,
  company_name VARCHAR(255) NOT NULL,
  goal_input TEXT NOT NULL,
  recommended_frameworks JSONB DEFAULT '[]',
  insights JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON strategy_sessions(user_id);
CREATE INDEX idx_sessions_company ON strategy_sessions(company_id);

-- RLS Policies for generated_reports
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports" ON generated_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports" ON generated_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports" ON generated_reports
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports" ON generated_reports
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for strategy_sessions
ALTER TABLE strategy_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON strategy_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON strategy_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON strategy_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON strategy_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for strategic_frameworks (public read)
ALTER TABLE strategic_frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active frameworks" ON strategic_frameworks
  FOR SELECT USING (status = 'active');