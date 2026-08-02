Instalación y despliegue del sistema RAG usando Supabase

Resumen
- Migración SQL: habilita pgcrypto y pgvector, crea tabla `documents` con columna `embedding vector(2048)`, habilita RLS y crea la función `match_documents`.
- Edge Functions (TypeScript): `ingest` para segmentar texto y crear embeddings con `nvidia/nemotron-3-embed-1b`; `ask` para generar embedding de la pregunta, recuperar contexto con `match_documents` y usar el modelo NVIDIA `poolside/laguna-xs-2.1` para responder.

Requisitos locales
- Supabase CLI instalado (https://supabase.com/docs/reference/cli)
- Acceso a tu proyecto Supabase (URL y Service Role Key)
- NVIDIA_EMBEDDINGS_API_KEY (o `NVIDIA_LLM_API_KEY` / `NVIDIA_API_KEY`) con permisos para el endpoint de embeddings de NVIDIA
- NVIDIA_LLM_API_KEY (o `NVIDIA_API_KEY`) con permisos para el endpoint de chat completions de NVIDIA

Variables de entorno necesarias (para despliegue en Supabase y pruebas locales):
- SUPABASE_URL (ej. https://xyzcompany.supabase.co)
- SUPABASE_SERVICE_ROLE_KEY (service_role key - mantener secreta)
- NVIDIA_EMBEDDINGS_API_KEY
- NVIDIA_EMBEDDINGS_MODEL=nvidia/nemotron-3-embed-1b (opcional)
- NVIDIA_EMBEDDINGS_INVOKE_URL=https://integrate.api.nvidia.com/v1/embeddings (opcional)
- NVIDIA_LLM_API_KEY
- NVIDIA_LLM_MODEL=poolside/laguna-xs-2.1 (opcional)
- NVIDIA_LLM_INVOKE_URL=https://integrate.api.nvidia.com/v1/chat/completions (opcional)

Pasos para aplicar la migración (usar Supabase CLI conectado al proyecto):
1. Conectar tu proyecto local con `supabase link --project-ref <project-ref>` o asegúrate de estar en el directorio correcto.
2. Aplicar la migración:
   - Opción A (db push): `supabase db remote set <DATABASE_URL>` y luego aplicar SQL manualmente o usar `supabase db push` si la CLI lo admite para el flujo de migraciones.
   - Opción B (ejecución manual): Copiar el contenido de `supabase/migrations/000_init_pgvector_documents.sql` y ejecutarlo en la SQL editor de Supabase (Dashboard > SQL) o vía psql.

Notas importantes sobre RLS y seguridad
- La tabla `documents` tiene RLS habilitado. Las políticas creadas permiten que únicamente los propietarios (owner = auth.uid()) lean/insert sus documentos desde clientes autenticados.
- Las Edge Functions usan la Service Role Key para operaciones privilegiadas (inserciones y RPC desde backend). El service role bypassa RLS: úsalo sólo en contexto de servidor.
- Para las consultas desde el cliente, no expongas la service role key.
- La función `match_documents` se invoca mediante RPC desde la Edge Function `ask`. Esto evita ejecutar SQL dinámico desde inputs del usuario, reduciendo el riesgo de inyección SQL.

Desplegar las Edge Functions
1. Iniciar sesión y configurar Supabase CLI: `supabase login` y `supabase link --project-ref <project-ref>`.
2. Deploy de la función `ingest`:
   - `supabase functions deploy ingest --project-ref <project-ref> --env-file .env` (asegúrate de que el archivo .env contenga SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY)
3. Deploy de la función `ask`:
   - `supabase functions deploy ask --project-ref <project-ref> --env-file .env`

Probar localmente
- Para pruebas locales con Supabase CLI: `supabase start` y usar curl/postman apuntando a `http://127.0.0.1:54321/functions/v1/ingest` y `/ask` con el header `apiKey: <tu_service_role_o_publishable_según corresponda>`.

Ejemplos de petición
- Ingest:
  POST /functions/v1/ingest
  Body: { "text": "Tu texto largo...", "owner": "<user-uuid>" }

- Ask:
  POST /functions/v1/ask
  Body: { "question": "¿Qué dice el documento sobre X?", "top_k": 5 }

Consideraciones finales
- El chunking usa una heurística basada en caracteres (aprox. 1 token = 4 chars). Para precisión de tokenización se puede integrar tiktoken o similar.
- Ajusta políticas RLS si necesitas compartir documentos entre usuarios o para roles administrativos.

Si deseas, puedo:
- Añadir columnas adicionales a la tabla (metadata, title, source, url).
- Ajustar chunking para basarse en tokens reales (integración con tiktoken).
- Crear ejemplos de cliente en supabase-js para consumir `ask` sin exponer service role.
