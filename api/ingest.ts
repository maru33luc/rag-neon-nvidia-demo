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
const EMBEDDING_DIMENSION = 2048;
const CHUNK_SIZE_CHARS = 500 * 4;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!NVIDIA_EMBEDDINGS_API_KEY) {
  throw new Error('NVIDIA_EMBEDDINGS_API_KEY is required');
}

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
  if (typeof owner !== 'string') return null;

  const trimmed = owner.trim();
  if (!trimmed) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(trimmed) ? trimmed : null;
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
    const text: unknown = body?.text;
    const url: unknown = body?.url;
    const owner: unknown = body?.owner;

    let contentText: string | null = null;

    if (typeof url === 'string' && url.trim()) {
      const requestedUrl = url.trim();
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(requestedUrl);
      } catch (error) {
        return sendJson(res, { error: 'URL inválida.' }, 400);
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return sendJson(res, { error: 'Solo se permiten URLs HTTP o HTTPS.' }, 400);
      }

      if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(parsedUrl.hostname)) {
        return sendJson(res, { error: 'No se permite acceder a hosts locales desde la URL.' }, 400);
      }

      const fetched = await fetch(parsedUrl.toString(), { method: 'GET', redirect: 'follow' });
      if (!fetched.ok) {
        const fetchedText = await fetched.text().catch(() => '');
        return sendJson(
          res,
          {
            error: 'No se pudo descargar el contenido desde la URL.',
            details: `${fetched.status} ${fetched.statusText}`,
            body: fetchedText,
          },
          502
        );
      }

      contentText = (await fetched.text()).trim();
      if (!contentText) {
        return sendJson(res, { error: 'El contenido descargado desde la URL está vacío.' }, 400);
      }
    } else if (typeof text === 'string' && text.trim()) {
      contentText = text.trim();
    } else {
      return sendJson(res, { error: 'Missing text or url in request body' }, 400);
    }

    const ownerStr = normalizeOwner(owner);
    const chunks: string[] = [];
    let start = 0;

    console.log('NVIDIA ingest env:', {
      embedUrl: NVIDIA_EMBEDDINGS_INVOKE_URL,
      hasEmbedKey: Boolean(NVIDIA_EMBEDDINGS_API_KEY),
    });

    while (start < contentText.length) {
      let end = Math.min(start + CHUNK_SIZE_CHARS, contentText.length);

      if (end < contentText.length) {
        const nextSpace = contentText.lastIndexOf(' ', end);
        if (nextSpace > start) end = nextSpace;
      }

      const chunk = contentText.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      start = end + 1;
    }

    if (chunks.length === 0) {
      return sendJson(res, { inserted: 0 }, 200);
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
        input: chunks,
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
    const embeddings = extractEmbeddings(embJson);

    if (embeddings.length !== chunks.length) {
      return sendJson(res, { error: 'Unexpected embedding response shape from NVIDIA' }, 500);
    }

    for (const embedding of embeddings) {
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
        return sendJson(res, { error: 'Unexpected embedding size from NVIDIA' }, 500);
      }
    }

    const values: unknown[] = [];
    const placeholders = embeddings
      .map((embedding, index) => {
        values.push(chunks[index]);
        values.push(JSON.stringify(embedding));
        values.push(ownerStr);
        const base = index * 3;
        return `($${base + 1}, $${base + 2}::vector, $${base + 3})`;
      })
      .join(', ');

    await pool.query(
      `INSERT INTO public.documents (content, embedding, owner) VALUES ${placeholders}`,
      values
    );

    return sendJson(res, { inserted: chunks.length }, 200);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: String(error) }, 500);
  } finally {
    await pool.end();
  }
}

