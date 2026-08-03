# AGENT.md — AI Coding Agent Guidelines

This document describes the architecture, conventions, and rules for AI agents working on this repository.

---

## 1. Project Overview

**rag-neon-nvidia-demo** is a full-stack RAG (Retrieval-Augmented Generation) application.

- **Frontend:** Angular 19 SPA
- **Backend:** Vercel Serverless Functions (`api/ask.ts`, `api/ingest.ts`)
- **Vector database:** Neon Postgres + pgvector
- **AI:** NVIDIA NIM APIs (embeddings + LLM)

The `supabase/` directory contains legacy migrations and edge functions kept for reference. **Do not modify them.** The active runtime is `api/`.

---

## 2. Repository Structure

```
rag-neon-nvidia-demo/
├── api/
│   ├── ask.ts              # POST /api/ask — embed question, similarity search, LLM answer
│   └── ingest.ts           # POST /api/ingest — chunk, embed, insert into Neon
├── scripts/
│   ├── apply-neon-migrations.js
│   └── migrate-from-supabase.js
├── src/app/
│   ├── components/
│   │   ├── chat-input/     # Input bar (ask / ingest modes, file/url/text sources)
│   │   ├── chat-main/      # Conversation view, orchestrates RagService calls
│   │   ├── chat-message/   # Renders a single message (markdown, source matches)
│   │   └── sidebar/        # Conversation list panel
│   └── services/
│       └── rag.service.ts  # HTTP client — wraps /api/ask and /api/ingest
├── supabase/               # Legacy reference only — do not modify
├── .env.example
├── vercel.json
└── package.json
```

---

## 3. Key Constants

| Constant | Value |
|---|---|
| Embedding model | `nvidia/nemotron-3-embed-1b` |
| Embedding dimensions | `2048` |
| LLM model | `poolside/laguna-xs-2.1` |
| Chunk size | `~2000 chars` (500 tokens × 4 chars/token) |
| Default `top_k` | `6` |
| Max file size (frontend) | `5 MB` |

---

## 4. Environment Variables

Required at runtime (Vercel serverless functions):

```
DATABASE_URL              # Neon Postgres connection string (injected by Vercel–Neon integration)
NVIDIA_EMBEDDINGS_API_KEY # nvapi-...
NVIDIA_LLM_API_KEY        # nvapi-...
```

Optional (have defaults in code):

```
NVIDIA_EMBEDDINGS_MODEL       # default: nvidia/nemotron-3-embed-1b
NVIDIA_EMBEDDINGS_INVOKE_URL  # default: https://integrate.api.nvidia.com/v1/embeddings
NVIDIA_LLM_MODEL              # default: poolside/laguna-xs-2.1
NVIDIA_LLM_INVOKE_URL         # default: https://integrate.api.nvidia.com/v1/chat/completions
```

---

## 5. Development Commands

```bash
npm install           # Install dependencies
npx vercel dev        # Full stack local dev (Angular + API on port 3000)
npm start             # Angular only (port 4200, no API)
npm run build         # Production Angular build → dist/rag-supabase-nvidia-demo/browser
npm run migrate:neon  # Apply SQL schema to Neon
npm run migrate:db    # Migrate data from Supabase to Neon
npx vercel --prod     # Deploy to production
```

---

## 6. Coding Standards

### Angular
- All components are **standalone** (`standalone: true`). Never generate NgModules.
- Keep HTTP calls inside `RagService`. Components only call service methods.
- Use explicit TypeScript types. Avoid `any` except in API boundary parsing code.
- SCSS for all styles.

### Vercel API functions (`api/*.ts`)
- Each file exports a single `default async function handler(req, res)`.
- Read all config from `process.env` at module level. Throw at startup if required vars are missing.
- Return JSON via the local `sendJson(res, payload, status)` helper — never use `res.json()`.
- Parse request body with the local `parseJsonBody(req)` helper (handles both pre-parsed and raw stream).
- On NVIDIA or DB errors, return `502` with `{ error: string, details: unknown }`.
- Always call `pool.end()` in the `finally` block.

### Security rules
- Never hardcode API keys or connection strings.
- URL ingestion must validate protocol and block loopback addresses (already implemented in `ingest.ts`).
- Do not expose `DATABASE_URL` to the frontend.

---

## 7. Database Schema

```sql
-- Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table
CREATE TABLE public.documents (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content   TEXT NOT NULL,
  embedding VECTOR(2048),
  owner     UUID
);

-- Similarity search function
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

---

## 8. Safety Rules

- **Never commit** `.env`, `.env.local`, or any file containing real API keys.
- **Never modify** `supabase/` files — they are reference-only.
- Before editing `api/ask.ts` or `api/ingest.ts`, verify the NVIDIA model names and embedding dimensions are consistent with the DB schema (`vector(2048)`).
- After changing API functions, redeploy with `npx vercel --prod` and verify the live endpoint responds correctly.
