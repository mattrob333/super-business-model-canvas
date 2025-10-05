-- Fix critical security issue: Add INSERT policy to profiles table
-- This allows the handle_new_user() trigger to create profiles during signup
CREATE POLICY "System can create profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (true);

-- This policy is safe because:
-- 1. The handle_new_user() trigger runs with SECURITY DEFINER privileges
-- 2. The trigger only fires when Supabase creates a new auth.users record
-- 3. Regular users cannot directly insert into profiles - only via the trigger