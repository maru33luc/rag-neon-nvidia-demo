-- Enable extensions required
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Usá pgvector en Supabase para embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table with 2048-dimension vectors for Nemotron embeddings
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(2048) NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now()
);

-- Optional but recommended: index for faster owner filtering
CREATE INDEX IF NOT EXISTS documents_owner_idx ON public.documents(owner);

-- Semantic search function
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector,
  limit_count int DEFAULT 5
)
RETURNS TABLE(id uuid, content text, distance float) AS $$
  SELECT
    d.id,
    d.content,
    (d.embedding <=> query_embedding) AS distance
  FROM public.documents d
  ORDER BY distance
  LIMIT limit_count;
$$ LANGUAGE sql STABLE;