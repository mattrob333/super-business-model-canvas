-- Add UPDATE policy to profiles table so users can update their own profile
CREATE POLICY "Users can update own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);