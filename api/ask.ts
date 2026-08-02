import { Pool } from '@neondatabase/serverless';

const DATABASE_URL = process.env['DATABASE_URL'];
const NVIDIA_EMBEDDINGS_API_KEY =
  process.env['NVIDIA_EMBEDDINGS_API_KEY'] ??
  process.env['NVIDIA_LLM_API_KEY'] ??
  process.env['NVIDIA_API_KEY'];
const NVIDIA_EMBEDDINGS_INVOKE_URL =
  process.env['NVIDIA_EMBEDDINGS_INVOKE_URL'] ??
  'https://integrate.api.nvidia.com/v1/embeddings';
const NVIDIA_EMBEDDINGS_MODEL =
  process.env['NVIDIA_EMBEDDINGS_MODEL'] ?? 'nvidia/nemotron-3-embed-1b';
const NVIDIA_LLM_API_KEY =
  process.env['NVIDIA_LLM_API_KEY'] ?? process.env['NVIDIA_API_KEY'];
const NVIDIA_LLM_INVOKE_URL =
  process.env['NVIDIA_LLM_INVOKE_URL'] ??
  'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_LLM_MODEL =
  process.env['NVIDIA_LLM_MODEL'] ?? 'poolside/laguna-xs-2.1';
const EMBEDDING_DIMENSION = 2048;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!NVIDIA_EMBEDDINGS_API_KEY) {
  throw new Error('NVIDIA_EMBEDDINGS_API_KEY is required');
}
if (!NVIDIA_LLM_API_KEY) {
  throw new Error('NVIDIA_LLM_API_KEY is required');
}

function extractAssistantText(payload: any): string | null {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('');
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

function sendJson(res: any, payload: any, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const body = await parseJsonBody(req);
    const question: unknown = body?.question;
    const top_k: number =
      typeof body?.top_k === 'number' && Number.isFinite(body.top_k)
        ? body.top_k
        : 6;

    if (!question || typeof question !== 'string') {
      return sendJson(res, { error: 'Missing question in request body' }, 400);
    }

    const embRes = await fetch(NVIDIA_EMBEDDINGS_INVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${NVIDIA_EMBEDDINGS_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_EMBEDDINGS_MODEL,
        input: question,
      }),
    });

    if (!embRes.ok) {
      const errText = await embRes.text();
      return sendJson(
        res,
        { error: 'NVIDIA embedding request failed', details: errText },
        502
      );
    }

    const embJson: any = await embRes.json();
    const embedding = extractEmbedding(embJson);

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
      return sendJson(res, { error: 'Unexpected embedding size from NVIDIA' }, 500);
    }

    const { rows } = await pool.query(
      'SELECT id, content, distance FROM public.match_documents($1::vector, $2)',
      [JSON.stringify(embedding), top_k]
    );

    if (!rows || rows.length === 0) {
      return sendJson(
        res,
        {
          answer:
            'No tengo información en mis documentos para responder a esta consulta.',
          matches: [],
        },
        200
      );
    }

    const context = rows
      .map((match: any) => match.content)
      .filter(Boolean)
      .join('\n\n---\n\n');

    const prompt = `Eres un experto asistente de IA. Responde a la pregunta del usuario de manera exhaustiva, profunda y detallada, utilizando la información contenida en el contexto proporcionado.

Directivas:
1. Elabora una respuesta completa y bien desarrollada. Explica conceptos, arquitectura, operadores SQL (como <=>), fórmulas y pasos técnicos si aparecen en el contexto.
2. Estructura el contenido con títulos Markdown, listas viñeteadas, tablas y bloques de código según corresponda.
3. No resumas excesivamente; aprovecha el contexto para ofrecer explicaciones ricas y detalladas.
4. Mantén la respuesta estrictamente fundamentada en la información recuperada.

Contexto Recuperado de Neon (pgvector):
${context}

Pregunta del Usuario:
${question}

Respuesta Detallada:`;

    const llmRes = await fetch(NVIDIA_LLM_INVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${NVIDIA_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 0.95,
        max_tokens: 8192,
        stream: false,
      }),
    });

    if (!llmRes.ok) {
      const llmText = await llmRes.text();
      return sendJson(
        res,
        { error: 'NVIDIA LLM request failed', details: llmText },
        502
      );
    }

    const llmJson: any = await llmRes.json();
    const answer = extractAssistantText(llmJson) ?? 'No pude generar una respuesta';

    return sendJson(res, { answer, matches: rows }, 200);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: String(error) }, 500);
  } finally {
    await pool.end();
  }
}
