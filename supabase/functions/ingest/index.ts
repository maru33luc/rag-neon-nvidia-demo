// Supabase Edge Function (Deno/TypeScript) — ingest
// Endpoint: POST /ingest
// Expected JSON body: { text: string, owner?: string }

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const NVIDIA_EMBEDDINGS_API_KEY =
  Deno.env.get("NVIDIA_EMBEDDINGS_API_KEY") ??
  Deno.env.get("NVIDIA_LLM_API_KEY") ??
  Deno.env.get("NVIDIA_API_KEY");
const NVIDIA_EMBEDDINGS_INVOKE_URL =
  Deno.env.get("NVIDIA_EMBEDDINGS_INVOKE_URL") ??
  "https://integrate.api.nvidia.com/v1/embeddings";
const NVIDIA_EMBEDDINGS_MODEL =
  Deno.env.get("NVIDIA_EMBEDDINGS_MODEL") ?? "nvidia/nemotron-3-embed-1b";
const EMBEDDING_DIMENSION = 2048;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (!NVIDIA_EMBEDDINGS_API_KEY) throw new Error("NVIDIA_EMBEDDINGS_API_KEY is required");

// Heuristic chunking: estimate 1 token ~= 4 characters -> chunkSizeChars = 500 * 4 = 2000 chars
const CHUNK_SIZE_CHARS = 500 * 4;

function extractEmbeddings(payload: any): number[][] {
  if (Array.isArray(payload?.data)) {
    return payload.data.map((item: any) => item.embedding).filter(Array.isArray);
  }

  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings.filter(Array.isArray);
  }

  return [];
}

function normalizeOwner(owner: unknown): string | null {
  if (typeof owner !== "string") return null;

  const trimmed = owner.trim();
  if (!trimmed) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(trimmed) ? trimmed : null;
}

export default {
  fetch: withSupabase({ auth: ["none"] }, async (req) => {
    try {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const body = await req.json();
      const text: unknown = body?.text;
      const owner: unknown = body?.owner;

      if (!text || typeof text !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing text in request body" }),
          { status: 400 }
        );
      }

      const ownerStr = normalizeOwner(owner);

      const chunks: string[] = [];
      let start = 0;

      while (start < text.length) {
        let end = Math.min(start + CHUNK_SIZE_CHARS, text.length);

        if (end < text.length) {
          const nextSpace = text.lastIndexOf(" ", end);
          if (nextSpace > start) end = nextSpace;
        }

        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);

        start = end + 1;
      }

      if (chunks.length === 0) {
        return new Response(JSON.stringify({ inserted: 0 }), { status: 200 });
      }

      const embRes = await fetch(NVIDIA_EMBEDDINGS_INVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${NVIDIA_EMBEDDINGS_API_KEY}`,
        },
        body: JSON.stringify({
          model: NVIDIA_EMBEDDINGS_MODEL,
          input: chunks,
        }),
      });

      if (!embRes.ok) {
        const errText = await embRes.text();
        return new Response(
          JSON.stringify({
            error: "NVIDIA embedding request failed",
            details: errText,
          }),
          { status: 502 }
        );
      }

      const embJson: any = await embRes.json();
      const embeddings = extractEmbeddings(embJson);

      if (embeddings.length !== chunks.length) {
        return new Response(
          JSON.stringify({ error: "Unexpected embedding response shape from NVIDIA" }),
          { status: 500 }
        );
      }

      for (const emb of embeddings) {
        if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIMENSION) {
          return new Response(
            JSON.stringify({ error: "Unexpected embedding size from NVIDIA" }),
            { status: 500 }
          );
        }
      }

      const rows = embeddings.map((emb, i) => ({
        content: chunks[i],
        embedding: emb,
        owner: ownerStr,
      }));

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from("documents").insert(rows);

      if (error) {
        console.error("Supabase insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      return new Response(JSON.stringify({ inserted: rows.length }), { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }),
};