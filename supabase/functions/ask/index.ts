// Supabase Edge Function (Deno/TypeScript) — ask
// Endpoint: POST /ask
// Expected JSON body: { question: string, top_k?: number }

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
const NVIDIA_LLM_API_KEY = Deno.env.get("NVIDIA_LLM_API_KEY") ?? Deno.env.get("NVIDIA_API_KEY");
const NVIDIA_LLM_INVOKE_URL =
  Deno.env.get("NVIDIA_LLM_INVOKE_URL") ??
  "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_LLM_MODEL = Deno.env.get("NVIDIA_LLM_MODEL") ?? "poolside/laguna-xs-2.1";
const EMBEDDING_DIMENSION = 2048;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (!NVIDIA_EMBEDDINGS_API_KEY) throw new Error("NVIDIA_EMBEDDINGS_API_KEY is required");
if (!NVIDIA_LLM_API_KEY) throw new Error("NVIDIA_LLM_API_KEY is required");

function extractAssistantText(payload: any): string | null {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
      .join("");
  }

  return null;
}

function extractEmbedding(payload: any): number[] | null {
  if (Array.isArray(payload?.data)) {
    const first = payload.data[0];
    if (Array.isArray(first?.embedding)) {
      return first.embedding;
    }
  }

  if (Array.isArray(payload?.embeddings) && Array.isArray(payload.embeddings[0])) {
    return payload.embeddings[0];
  }

  return null;
}

export default {
  fetch: withSupabase({ auth: ["none"] }, async (req, _ctx) => {
    try {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const body: any = await req.json();
      const question: unknown = body?.question;
      const top_k: number =
        typeof body?.top_k === "number" && Number.isFinite(body.top_k)
          ? body.top_k
          : 6;

      if (!question || typeof question !== "string") {
        return new Response(
          JSON.stringify({ error: "Missing question in request body" }),
          { status: 400 }
        );
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
          input: question,
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
      const embedding = extractEmbedding(embJson);

      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
        return new Response(
          JSON.stringify({ error: "Unexpected embedding size from NVIDIA" }),
          { status: 500 }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data, error } = await supabase.rpc("match_documents", {
        query_embedding: embedding,
        limit_count: top_k,
      });

      if (error) {
        console.error("Supabase RPC error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        return new Response(
          JSON.stringify({ answer: "No tengo información en mis documentos para responder a esta consulta." }),
          { status: 200 }
        );
      }

      const context = data
        .map((match: any) => match.content)
        .filter(Boolean)
        .join("\n\n---\n\n");

      const prompt = `Eres un experto asistente de IA. Responde a la pregunta del usuario de manera exhaustiva, profunda y detallada, utilizando la información contenida en el contexto proporcionado.

Directivas:
1. Elabora una respuesta completa y bien desarrollada. Explica conceptos, arquitectura, operadores SQL (como <=>), fórmulas y pasos técnicos si aparecen en el contexto.
2. Estructura el contenido con títulos Markdown, listas viñeteadas, tablas y bloques de código según corresponda.
3. No resumas excesivamente; aprovecha el contexto para ofrecer explicaciones ricas y detalladas.
4. Mantén la respuesta estrictamente fundamentada en la información recuperada.

Contexto Recuperado de Supabase (pgvector):
${context}

Pregunta del Usuario:
${question}

Respuesta Detallada:`;

      const llmRes = await fetch(NVIDIA_LLM_INVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${NVIDIA_LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: NVIDIA_LLM_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          top_p: 0.95,
          max_tokens: 8192,
          stream: false,
        }),
      });

      if (!llmRes.ok) {
        const llmText = await llmRes.text();
        return new Response(
          JSON.stringify({ error: "NVIDIA LLM request failed", details: llmText }),
          { status: 502 }
        );
      }

      const llmJson: any = await llmRes.json();
      const answer = extractAssistantText(llmJson) ?? "No pude generar una respuesta";

      return new Response(JSON.stringify({ answer, matches: data }), { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }),
};
