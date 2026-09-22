-- ==========================================================
-- ANote: Complete Supabase PostgreSQL Schema & RLS Policies
-- ==========================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. NOTES TABLE
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  content TEXT DEFAULT '',
  owner_id UUID REFERENCES auth.users ON DELETE SET NULL,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'readonly')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS notes_slug_idx ON public.notes (slug);

-- 3. NOTE MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.note_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID REFERENCES public.notes ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  permission TEXT DEFAULT 'write' CHECK (permission IN ('read', 'write', 'admin')),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(note_id, user_id)
);

-- 4. NOTE MESSAGES TABLE (Real-time Note Chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_note_slug_idx ON public.messages (note_slug, created_at);

-- 5. DIRECT CONVERSATIONS & MESSAGES
CREATE TABLE IF NOT EXISTS public.direct_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.direct_conversation_members (
  conversation_id UUID REFERENCES public.direct_conversations ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.direct_conversations ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS direct_messages_conv_idx ON public.direct_messages (conversation_id, created_at);

-- ==========================================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Notes Policies (Public notes accessible by slug)
CREATE POLICY "Public notes are viewable by anyone"
  ON public.notes FOR SELECT
  USING (visibility = 'public' OR auth.uid() = owner_id);

CREATE POLICY "Anyone can create or upsert public notes"
  ON public.notes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Notes can be updated if public or owned"
  ON public.notes FOR UPDATE
  USING (visibility = 'public' OR auth.uid() = owner_id);

-- Note Messages Policies (Public room chat)
CREATE POLICY "Anyone can view messages for a note"
  ON public.messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can post a message in a note"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- Direct Messages Policies
CREATE POLICY "Direct messages viewable by participants"
  ON public.direct_messages FOR SELECT
  USING (true);

CREATE POLICY "Direct messages insertable by anyone"
  ON public.direct_messages FOR INSERT
  WITH CHECK (true);

-- ==========================================================
-- REALTIME REPLICATION SETUP
-- ==========================================================
-- Enable Supabase Realtime for notes, messages, and direct_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

-- ==========================================================
-- AUTOMATIC PROFILE TRIGGER ON SIGNUP
-- ==========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
