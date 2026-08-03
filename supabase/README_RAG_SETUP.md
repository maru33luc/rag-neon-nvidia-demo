# Legacy Supabase Setup — Reference Only

> **This directory is no longer the active runtime.**
> The production backend runs on Vercel Serverless Functions (`api/`) with Neon Postgres.
> This document is kept for historical reference and to document the original Supabase implementation.

---

## What This Directory Contains

| Path | Description |
|---|---|
| `migrations/` | SQL files that create the `documents` table, enable pgvector, and define `match_documents` |
| `functions/ingest/` | Deno Edge Function — chunks text, generates NVIDIA embeddings, inserts into Supabase |
| `functions/ask/` | Deno Edge Function — embeds query, runs similarity search, calls NVIDIA LLM |
| `config.toml` | Supabase project configuration |

---

## Original Architecture

```
[ Angular SPA ]
      │
      ▼
[ Supabase Edge Functions (Deno) ]
   /functions/v1/ingest  ──► NVIDIA Nemotron (2048d) ──► Supabase pgvector
   /functions/v1/ask     ──► NVIDIA Nemotron ──► match_documents RPC ──► NVIDIA Laguna
```

---

## SQL Schema (still valid for Neon)

The migrations in `migrations/` are reused by the Neon setup. The schema is identical:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.documents (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content   TEXT NOT NULL,
  embedding VECTOR(2048),
  owner     UUID
);

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding VECTOR(2048),
  match_count     INT DEFAULT 6
)
RETURNS TABLE (id UUID, content TEXT, distance FLOAT)
LANGUAGE SQL STABLE AS $$
  SELECT id, content, embedding <=> query_embedding AS distance
  FROM public.documents
  ORDER BY distance
  LIMIT match_count;
$$;
```

To apply this schema to Neon, use:

```bash
npm run migrate:neon
```

---

## Original Environment Variables (Supabase)

These were required for the Supabase Edge Functions deployment:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NVIDIA_EMBEDDINGS_API_KEY
NVIDIA_LLM_API_KEY
```

For the current Vercel + Neon deployment, see the root `.env.example` and `README.md`.

---

## Why We Migrated

| Concern | Supabase | Vercel + Neon |
|---|---|---|
| Runtime | Deno (Edge Functions) | Node.js (Serverless) |
| Cold starts | Higher on free tier | Lower on Vercel |
| Frontend hosting | Separate | Same project |
| DB connection | Supabase pooler | Neon serverless driver |
| Auth / RLS | Enabled (complex) | Removed (simplified) |

The migration script (`scripts/migrate-from-supabase.js`) exports `public.documents` from Supabase and restores it into Neon.
