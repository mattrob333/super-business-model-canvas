-- Security Enhancement: Tighten profile creation policy
-- Replace the permissive policy with defense-in-depth check
DROP POLICY IF EXISTS "System can create profiles" ON public.profiles;

CREATE POLICY "System can create profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- This policy now enforces:
-- 1. Only authenticated users can create profiles
-- 2. Users can only create profiles for their own ID
-- 3. Works with handle_new_user() trigger (SECURITY DEFINER bypasses RLS)
-- 4. Adds defense-in-depth protection against application-layer bypasses

-- Security Enhancement: Enable auto-save functionality for analyses
-- Users can now update their saved analyses instead of delete/recreate
CREATE POLICY "Users can update own analyses" 
ON public.saved_analyses 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- This policy enables:
-- 1. Users to modify their existing saved analyses
-- 2. Auto-save feature in the Analysis page to work properly
-- 3. Maintains security: users can only update their own data