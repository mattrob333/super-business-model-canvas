-- Create strategy coaching sessions table
CREATE TABLE strategy_coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  company_id uuid REFERENCES saved_analyses,
  company_name text,
  initial_prompt text,
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE strategy_coaching_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own coaching sessions"
  ON strategy_coaching_sessions FOR SELECT
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own coaching sessions"
  ON strategy_coaching_sessions FOR INSERT
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own coaching sessions"
  ON strategy_coaching_sessions FOR UPDATE
  TO authenticated 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own coaching sessions"
  ON strategy_coaching_sessions FOR DELETE
  TO authenticated 
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_strategy_coaching_sessions_user_id ON strategy_coaching_sessions(user_id);
CREATE INDEX idx_strategy_coaching_sessions_company_id ON strategy_coaching_sessions(company_id);