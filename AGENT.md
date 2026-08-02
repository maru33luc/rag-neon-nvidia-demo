# AGENT.md - AI Coding Agent Guidelines & Repository Architecture

This document provides instructions, context, architecture patterns, and conventions for AI Agents working on the **rag-supabase-nvidia-demo** project.

---

## 1. Project Overview

**rag-supabase-nvidia-demo** is a full-stack Retrieval-Augmented Generation (RAG) application.
It integrates an Angular 19 frontend with a Supabase backend utilizing `pgvector` for vector storage and retrieval, and NVIDIA API endpoints (Nemotron / Laguna models) for document embedding and LLM response generation via Supabase Edge Functions.

### Core Capabilities
1. **Document Ingestion (`/functions/ingest`)**: Generates text embeddings using NVIDIA Nemotron embedding model (2048 dimensions) and persists chunks into Supabase `documents` table with `pgvector`.
2. **RAG Semantic Search & Q&A (`/functions/ask`)**: Converts query to vector embeddings, performs cosine similarity search via `match_documents` PostgreSQL function, constructs prompt with retrieved context, and queries NVIDIA Chat API for grounded answer generation.
3. **Interactive Frontend (`src/app`)**: Angular 19 SPA enabling document upload/ingestion and real-time interactive Q&A.

---

## 2. Tech Stack & Dependencies

- **Frontend**: Angular 19, TypeScript 5.7+, RxJS, SCSS
- **Backend & Database**: Supabase (PostgreSQL + `pgvector`), Deno (Supabase Edge Functions)
- **AI / LLM Integration**: NVIDIA API (`https://integrate.api.nvidia.com/v1`)
  - Embeddings: `nvidia/nemotron-3-embed-1b` (2048 dimensions)
  - Chat/LLM: `poolside/laguna-xs-2.1` or specified NVIDIA LLM
- **Package Manager**: npm

---

## 3. Repository Structure

```text
rag-supabase-nvidia-demo/
├── .env.example             # Environment variables template
├── angular.json             # Angular workspace configuration
├── package.json             # Node dependencies and npm scripts
├── tsconfig.json            # Base TypeScript configuration
├── AGENT.md                 # AI agent guidelines & reference (this file)
├── README.md                # Human-readable project description
├── src/
│   ├── main.ts              # Angular app bootstrap
│   ├── styles.scss          # Global application styling
│   ├── environments/        # Environment configurations (prod / dev)
│   └── app/
│       ├── app.component.ts # Root Angular component
│       ├── components/      # Standalone UI components (ingest, ask, chat UI)
│       └── services/        # Services for Supabase API interactions
└── supabase/
    ├── config.toml          # Supabase project configuration
    ├── README_RAG_SETUP.md  # Detailed setup guide for RAG stack
    ├── migrations/          # SQL migrations (pgvector extension, tables, RPC match function)
    └── functions/           # Deno Edge Functions
        ├── ingest/          # Edge Function: Ingest text & generate embeddings
        └── ask/             # Edge Function: RAG semantic search & LLM response
```

---

## 4. Development Workflow & Commands

### 4.1 Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- Supabase CLI (`npx supabase` or global `supabase`)
- Docker Desktop (for local Supabase development)

### 4.2 Environment Setup
Ensure `.env` exists in root:
```bash
cp .env.example .env
```
Ensure key environment variables are set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NVIDIA_EMBEDDINGS_API_KEY`
- `NVIDIA_LLM_API_KEY`

### 4.3 Running the Application

#### A. Frontend (Angular 19)
```bash
# Install dependencies
npm install

# Start development server (http://localhost:4200)
npm start

# Build for production
npm run build
```

#### B. Backend (Supabase Local Development)
```bash
# Start local Supabase services (Docker required)
npx supabase start

# Apply database migrations
npx supabase db reset

# Serve Edge Functions locally with environment variables
npx supabase functions serve --env-file .env
```

#### C. Remote Supabase Deployment
```bash
# Link project to cloud reference
npx supabase link --project-ref <PROJECT_REF>

# Apply migrations
npx supabase db push

# Set remote secrets
npx supabase secrets set --env-file .env --project-ref <PROJECT_REF>

# Deploy Edge Functions
npx supabase functions deploy ingest --project-ref <PROJECT_REF>
npx supabase functions deploy ask --project-ref <YOUR_PROJECT_REF>
```

---

## 5. Coding Standards & Conventions for AI Agents

### 5.1 Angular Rules
1. **Standalone Components**: Use Angular 19 standalone components (`standalone: true`). Do not generate `NgModule` unless strictly necessary.
2. **Strict Typing**: Specify explicit types for inputs, outputs, signals, and RxJS observables. Avoid standard `any`.
3. **Service Layer**: Keep API calls and Supabase client interactions strictly inside Angular services (`src/app/services/`), keeping UI components light.
4. **Styling**: SCSS for styling (`src/app/**/*.scss` and `src/styles.scss`). Use clean responsive layouts with modern CSS flexbox/grid.

### 5.2 Supabase & Edge Function Rules
1. **Deno / TypeScript Runtime**: Edge functions run on Deno. Imports must use URL module specifiers (e.g. `https://esm.sh/@supabase/supabase-js@2`).
2. **Vector Dimension Alignment**: Ensure vector size in SQL migrations (`vector(2048)`) matches the output dimension of the selected NVIDIA embedding model (`nvidia/nemotron-3-embed-1b`).
3. **Database Security (RLS)**: Row Level Security is enabled on table `documents`. Direct database mutations must respect RLS or go through server-side authenticated Edge Functions using `SUPABASE_SERVICE_ROLE_KEY`.
4. **RPC Functions**: Use `match_documents` PostgreSQL function for similarity searches (`cosine` or `dot product`).

### 5.3 Error Handling & Logging
- Edge functions must return appropriate HTTP status codes (`400` for bad request, `500` for API failures) and JSON response formatted as `{ "error": "description" }`.
- Angular services must catch HTTP errors and present user-friendly notification in the UI.

---

## 6. AI Agent Guidelines & Safety Rules

- **Do Not Expose Secrets**: Never hardcode API keys, Supabase Service Role keys, or NVIDIA tokens in code files. Always read from `Deno.env` or `process.env`.
- **Always Verify Signatures & Paths**: Before modifying files, inspect line ranges and imports using appropriate tools.
- **Incremental Modifications**: Test changes iteratively using local dev servers (`npm start`, `npx supabase functions serve`).
