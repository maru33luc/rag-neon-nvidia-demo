# Enterprise RAG Demo: Angular 19 + Neon pgvector + NVIDIA NIM on Vercel

[![Angular](https://img.shields.io/badge/Angular-19.2-dd0031.svg?logo=angular)](https://angular.dev/)
[![Neon](https://img.shields.io/badge/Neon-Postgres_+_pgvector-00B8E3.svg?logo=neon)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000.svg?logo=vercel)](https://vercel.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-API_Integrations-76B900.svg?logo=nvidia)](https://build.nvidia.com/)

A retrieval-augmented generation application built with **Angular 19** for the frontend, **Neon Serverless Postgres + pgvector** for semantic search, and **NVIDIA NIM** for embeddings and grounded answer generation.

> This repository migrates the original Supabase-based implementation to a Vercel + Neon deployment. The legacy `supabase/` directory remains for reference, but the active runtime is now the `api/` Vercel functions and the Angular static app.

---

## Architecture

```text
[ Angular SPA ] --> [ Vercel API (/api/ingest, /api/ask) ] --> [ Neon Postgres pgvector ]
                                          |
                                          v
                               [ NVIDIA NIM Embeddings + LLM APIs ]
```

### Core runtime flow
- `/ingest`: chunk raw text, create NVIDIA 2048-dim embeddings, store vectors in Neon `public.documents`. Supports ingesting text pasted in the chat, uploaded files, or remote documents fetched from a public URL.
- `/ask`: embed a question, call `public.match_documents()` to retrieve relevant chunks, and prompt NVIDIA LLM for a grounded response.

---

## Technology Stack

| Layer | Component |
|---|---|
| Frontend | Angular 19 SPA |
| Backend | Vercel Serverless Functions (`api/ask.ts`, `api/ingest.ts`) |
| Vector database | Neon Postgres + `pgvector` |
| Embeddings | NVIDIA NIM `nvidia/nemotron-3-embed-1b` |
| LLM | NVIDIA NIM `poolside/laguna-xs-2.1` |

---

## Repository Structure

```text
rag-supabase-nvidia-demo/
├── api/                          # Vercel backend endpoints
│   ├── ask.ts                    # Query embedding + similarity search + LLM generation
│   └── ingest.ts                 # Text chunking + embeddings + vector insert
├── scripts/                      # Helper scripts for migration and setup
│   └── migrate-from-supabase.js  # Data migration helper from Supabase to Neon
├── src/                          # Angular application
│   ├── app/
│   │   └── services/            # Angular service consuming the new backend
│   └── environments/            # Build-time environment configuration
├── vercel.json                   # Vercel build/routes for SPA + API
├── .env.example                  # Local / remote environment template
├── package.json                  # Node scripts and dependencies
└── supabase/                     # Legacy Supabase migrations and functions (reference only)
```

---

## Prerequisites

- Node.js `^20.x` or `^22.x`
- npm `^10.x`
- Angular CLI `^19.x`
- Vercel CLI logged in under your account
- Neon CLI logged in under your account
- Supabase CLI logged in and linked to the source project for migration
- NVIDIA API key with access to embeddings and chat completion services

---

## Environment Variables

Create a `.env` from `.env.example` and provide the following values:

```env
# Neon / Postgres
DATABASE_URL=postgresql://your-neon-connection-string
NEON_DATABASE_URL=postgresql://your-neon-connection-string
API_BASE_URL=/api

# Supabase source database connection (for migration only)
SUPABASE_DATABASE_URL=postgresql://your-supabase-postgres-connection-string

# NVIDIA
NVIDIA_EMBEDDINGS_API_KEY=your-nvidia-embeddings-key
NVIDIA_EMBEDDINGS_MODEL=nvidia/nemotron-3-embed-1b
NVIDIA_EMBEDDINGS_INVOKE_URL=https://integrate.api.nvidia.com/v1/embeddings
NVIDIA_LLM_API_KEY=your-nvidia-llm-key
NVIDIA_LLM_MODEL=poolside/laguna-xs-2.1
NVIDIA_LLM_INVOKE_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

### Vercel / Neon integration
- The Neon integration with Vercel automatically injects `DATABASE_URL` into the project environment.
- In local development, Vercel CLI creates `.env.local` and keeps it out of git.
- NVIDIA secrets and `SUPABASE_DATABASE_URL` must be added manually to the Vercel project environment if you want remote deploy/migration.

---

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run the Angular app locally:

```bash
npm start
```

3. Run Vercel locally for the API and static site together:

```bash
npx vercel dev
```

4. Open the browser at `http://127.0.0.1:3000` and use the app.

---

## Database Migration to Neon

### 1. Create a new Neon project
- In Vercel, add a new Neon project under your organization, e.g. `rag-nvidia-db`.
- Confirm the integration injects `DATABASE_URL` into the Vercel environment.

### 2. Apply Neon migrations
Use the SQL files in `supabase/migrations/` to create the `documents` table and the `match_documents` function in Neon.

```bash
npm run migrate:neon
```

This helper uses the injected `DATABASE_URL` from `.env.local` or the value from your local `.env`.

### 3. Migrate your Supabase data
If you are logged into Supabase CLI and the source project is linked, you can migrate directly from the source project without a separate dump file. Optionally, set `SUPABASE_DATABASE_URL` to use a direct connection string instead.

```bash
npm run migrate:db
```

If you already downloaded a Supabase backup file, set `DUMP_FILE` to a local `.json` or `.sql` export file and the script will restore that file directly into Neon.

This helper script exports `public.documents` from Supabase and restores it into Neon using the linked Supabase project or the direct `SUPABASE_DATABASE_URL`. If `NEON_DATABASE_URL` is omitted, it falls back to `DATABASE_URL` or reconstructs the Neon connection from `PGHOST`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`.

---

## Vercel Deployment

This repository is intended for a single Vercel project containing both the Angular static site and the API routes.

- Frontend is built by `npm run build` into `dist/rag-supabase-nvidia-demo`.
- API endpoints are served from `api/ask.ts` and `api/ingest.ts`.
- The route `*/api/*` is proxied to the Vercel functions, and the SPA fallback serves `index.html`.

### Quick preview deploy

```bash
npx vercel --prebuilt
```

If you want to create a production deployment after verifying the preview, run:

```bash
npx vercel --prod
```

### Recommended project setup

- Project name: `rag-nvidia-demo` (or similar)
- Organization: `maru33luc's projects`
- Framework: Other
- Build command: `npm run build`
- Output directory: `dist/rag-supabase-nvidia-demo`

---

## API Endpoints

### POST /api/ingest
- Request body: `{ "text"?: string, "url"?: string, "owner"?: string }`
- Splits text into chunks, generates embeddings, and inserts them into Neon.
- If `url` is provided, the backend downloads the remote resource and indexes its text content.

### POST /api/ask
- Request body: `{ "question": string, "top_k"?: number }`
- Generates a query embedding, retrieves top matches using `public.match_documents()`, and calls NVIDIA LLM.

---

## Security Model

- The frontend does not have direct database access.
- The Vercel backend is the only component that uses `DATABASE_URL`.
- NVIDIA API keys are stored as Vercel secrets.
- The Neon database is protected behind the serverless backend.

---

## Notes

- The `match_documents()` function is preserved as a standard Postgres function with `pgvector` similarity search.
- `owner` is stored in Neon but no Supabase auth policies are applied in the current deployment.
- If you want stronger API protection, add a server-side API key or auth layer to `/api/ingest` and `/api/ask`.
