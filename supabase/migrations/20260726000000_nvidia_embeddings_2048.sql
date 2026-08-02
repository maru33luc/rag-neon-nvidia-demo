ALTER TABLE public.documents ALTER COLUMN embedding TYPE vector(2048);

CREATE OR REPLACE FUNCTION public.match_documents(query_embedding vector, limit_count int DEFAULT 5)
RETURNS TABLE(id uuid, content text, distance float) AS $$
  SELECT id, content, (embedding <=> query_embedding) AS distance
  FROM public.documents
  ORDER BY distance
  LIMIT limit_count;
$$ LANGUAGE sql STABLE;
