# Enterprise RAG Demo — Angular 19 · Neon pgvector · NVIDIA NIM · Vercel

[![Angular](https://img.shields.io/badge/Angular-19.2-dd0031.svg?logo=angular)](https://angular.dev/)
[![Neon](https://img.shields.io/badge/Neon-Postgres_+_pgvector-00B8E3.svg?logo=neon)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000.svg?logo=vercel)](https://vercel.com/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM_APIs-76B900.svg?logo=nvidia)](https://build.nvidia.com/)

A production-ready **Retrieval-Augmented Generation (RAG)** application. Upload documents or paste text, ask questions in natural language, and get grounded answers backed by your own knowledge base — no hallucinations.

**Live demo:** [rag-nvidia-demo.vercel.app](https://rag-nvidia-demo.vercel.app)

---

## How It Works

```
[ Angular SPA ]
      │
      ▼
[ Vercel Serverless API ]
   /api/ingest ──► chunk text ──► NVIDIA Embeddings ──► Neon pgvector
   /api/ask    ──► embed query ──► pgvector similarity search ──► NVIDIA LLM ──► answer
```

1. **Ingest** — Your text is split into chunks, converted to 2048-dimensional vectors by NVIDIA Nemotron, and stored in Neon Postgres with pgvector.
2. **Ask** — Your question is embedded the same way, the most semantically similar chunks are retrieved, and NVIDIA Laguna generates a grounded answer using only that context.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 19 SPA (standalone components) |
| Backend | Vercel Serverless Functions (Node.js / TypeScript) |
| Vector database | Neon Postgres + pgvector extension |
| Embeddings model | NVIDIA NIM `nvidia/nemotron-3-embed-1b` (2048 dims) |
| LLM | NVIDIA NIM `poolside/laguna-xs-2.1` |
| Deployment | Vercel (static + API routes in one project) |

---

## Repository Structure

```
rag-neon-nvidia-demo/
├── api/
│   ├── ask.ts              # Embed question → similarity search → LLM answer
│   └── ingest.ts           # Chunk text → embed → insert into Neon
├── scripts/
│   ├── apply-neon-migrations.js   # Apply SQL schema to Neon
│   └── migrate-from-supabase.js   # One-time data migration from Supabase
├── src/
│   └── app/
│       ├── components/     # Chat UI (input, messages, sidebar)
│       └── services/       # RagService — HTTP client for /api/ask and /api/ingest
├── supabase/               # Legacy Supabase reference (migrations + edge functions)
├── .env.example            # Environment variable template
├── vercel.json             # Vercel build and routing config
└── package.json
```

> The `supabase/` directory is kept for reference only. The active runtime is `api/` on Vercel + Neon.

---

## Prerequisites

- Node.js `^20.x` or `^22.x`
- npm `^10.x`
- [Vercel CLI](https://vercel.com/docs/cli) — logged in to your account
- [Neon account](https://neon.tech) — project created and linked to Vercel
- [NVIDIA API key](https://build.nvidia.com) — with access to embeddings and chat completions

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Neon Postgres (injected automatically by the Vercel–Neon integration)
DATABASE_URL=postgresql://<user>:<password>@<host>/neondb?sslmode=require

# NVIDIA NIM
NVIDIA_EMBEDDINGS_API_KEY=nvapi-...
NVIDIA_EMBEDDINGS_MODEL=nvidia/nemotron-3-embed-1b
NVIDIA_EMBEDDINGS_INVOKE_URL=https://integrate.api.nvidia.com/v1/embeddings

NVIDIA_LLM_API_KEY=nvapi-...
NVIDIA_LLM_MODEL=poolside/laguna-xs-2.1
NVIDIA_LLM_INVOKE_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

**Notes:**
- `DATABASE_URL` is injected automatically when you connect Neon to your Vercel project via the integration.
- In local development, Vercel CLI writes these to `.env.local` (git-ignored).
- NVIDIA keys must be added manually to the Vercel project environment (see [Vercel env docs](https://vercel.com/docs/environment-variables)).
- A single NVIDIA API key works for both embeddings and LLM endpoints.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Pull environment variables from Vercel (requires vercel login)
npx vercel env pull .env.local

# 3. Start the full stack locally (Angular + API)
npx vercel dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

> `npm start` runs only the Angular dev server (port 4200) without the API. Use `npx vercel dev` for the full experience.

---

## Database Setup

### 1. Create a Neon project and connect it to Vercel

In your Vercel project dashboard → **Storage** → **Connect Database** → select or create a Neon project. This automatically injects `DATABASE_URL` into all environments.

### 2. Apply the schema

```bash
npm run migrate:neon
```

This runs `scripts/apply-neon-migrations.js`, which applies the SQL files in `supabase/migrations/` to your Neon database — creating the `documents` table and the `match_documents` function.

### 3. (Optional) Migrate data from Supabase

If you have existing data in a Supabase project:

```bash
# Using Supabase CLI (must be logged in and linked)
npm run migrate:db

# Or using a direct connection string
SUPABASE_DATABASE_URL=postgresql://... npm run migrate:db

# Or from a local dump file
DUMP_FILE=./supabase_documents.sql npm run migrate:db
```

---

## Deployment

This project deploys as a single Vercel project: Angular static site + API routes.

### Deploy to production

```bash
npx vercel --prod
```

### Recommended Vercel project settings

| Setting | Value |
|---|---|
| Framework | Other |
| Build command | `npm run build` |
| Output directory | `dist/rag-supabase-nvidia-demo/browser` |
| Install command | `npm install` |

### Update environment variables on Vercel

```bash
# Add or update a variable
npx vercel env add NVIDIA_EMBEDDINGS_API_KEY production

# List all variables
npx vercel env ls
```

After updating secrets, redeploy:

```bash
npx vercel --prod
```

---

## API Reference

### `POST /api/ingest`

Indexes text content into the vector database.

**Request body:**

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Raw text to index (mutually exclusive with `url`) |
| `url` | `string` | Public URL to fetch and index (HTTP/HTTPS only) |
| `owner` | `string` | Optional UUID to associate chunks with a user |

**Response:**
```json
{ "inserted": 4 }
```

**Supported file types (via frontend):** plain text, PDF, `.doc`, `.docx` (max 5 MB)

---

### `POST /api/ask`

Answers a question using the indexed knowledge base.

**Request body:**

| Field | Type | Default | Description |
|---|---|---|---|
| `question` | `string` | — | The question to answer |
| `top_k` | `number` | `6` | Number of document chunks to retrieve |

**Response:**
```json
{
  "answer": "...",
  "matches": [
    { "id": "...", "content": "...", "distance": 0.08 }
  ]
}
```

---

## Security

- The Angular frontend has **no direct database access**.
- `DATABASE_URL` and NVIDIA keys are only available to the Vercel serverless functions.
- URL ingestion validates protocol (HTTP/HTTPS only) and blocks localhost/loopback addresses.
- No Supabase RLS policies are applied in the current deployment — if you need per-user isolation, add an auth layer to `/api/ingest` and `/api/ask`.

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` from NVIDIA | API key missing or incorrect in Vercel env | Run `npx vercel env add NVIDIA_EMBEDDINGS_API_KEY production` then redeploy |
| `DATABASE_URL is required` | Neon not connected to Vercel project | Connect Neon via Vercel Storage dashboard |
| Empty answer / no matches | No documents ingested yet | Use the **Indexar** tab to ingest content first |
| File upload fails | File > 5 MB or unsupported format | Use PDF, DOCX, or plain text under 5 MB |
