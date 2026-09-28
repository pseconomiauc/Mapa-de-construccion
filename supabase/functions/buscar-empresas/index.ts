// Función Edge: buscar-empresas
//
// Descubre empresas reales para una subcategoría de la Cadena de la Construcción en Carabobo
// usando el "Grounding con Google Search" NATIVO de Gemini (el modelo busca en la web real por
// su cuenta) para análisis y extracción rigurosa de datos verídicos.
//
// Reglas estrictas:
//   1. Prohibido inventar o alucinar empresas, teléfonos o direcciones inexistentes.
//   2. Preferir listas cortas o vacías antes que datos no confirmados.
//   3. Cada empresa debe incluir "confianza" ("alta" | "media") y "justificacion".
//   4. Cada dato extraído (dirección, teléfono, web) debe citar la URL de la fuente real.
//   5. Geocodificación asistida con Nominatim como sugerencia ajustable en mapa.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

interface RequestBody {
  subcategoriaNombre: string;
  subcategoriaSlug: string;
  municipioNombre?: string;
}

interface EmpresaSugerida {
  nombre: string;
  municipio: string | null;
  confianza: 'alta' | 'media';
  justificacion: string;
  direccion?: string | null;
  telefono?: string | null;
  sitio_web?: string | null;
  fuente?: string | null;
}

interface ResultCompany extends EmpresaSugerida {
  lat: number | null;
  lng: number | null;
  ubicacionConfirmada: boolean;
  fuente: string | null;
}

const MUNICIPIOS_CARABOBO = [
  'Bejuma',
  'Carlos Arvelo',
  'Diego Ibarra',
  'Guacara',
  'Juan José Mora',
  'Libertador',
  'Los Guayos',
  'Miranda',
  'Montalbán',
  'Naguanagua',
  'Puerto Cabello',
  'San Diego',
  'San Joaquín',
  'Valencia'
];

// Modelos vigentes de la generación Gemini 3.x (priorizamos 3.5-flash-lite por velocidad/cuota)
const MODELOS_GEMINI = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'];

function buildGroundingPrompt(subcategoriaNombre: string, municipioNombre?: string): string {
  const zona = municipioNombre ? `el municipio ${municipioNombre} del estado Carabobo` : 'el estado Carabobo';

  return `Actúa como investigador de datos senior. Busca en internet (usa la búsqueda web real disponible) empresas REALES del sector "${subcategoriaNombre}" que operen en ${zona}, Venezuela.

REGLAS ESTRICTAS DE CALIDAD Y NO ALUCINACIÓN (OBLIGATORIAS):
1. NUNCA inventes, supongas ni completes datos que no encuentres respaldados por tu búsqueda.
2. Es preferible devolver una lista vacía ([]) o corta antes que incluir una sola empresa dudosa, inexistente o fuera de Carabobo.
3. Extrae todas las empresas reales que encuentres relacionadas con "${subcategoriaNombre}" en ${zona}.
4. Para cada empresa:
   - "nombre": Razón social o nombre comercial exacto.
   - "municipio": SOLO uno de estos 14 municipios de Carabobo si es claro (${MUNICIPIOS_CARABOBO.join(', ')}); si no, null. NUNCA inventes un municipio.
   - "confianza": "alta" si está directamente respaldada por una fuente real que encontraste; "media" si es una empresa consolidada e identificable en Carabobo pero con datos parciales. No incluyas empresas dudosas.
   - "justificacion": Explicación breve y concreta de por qué es real y qué actividad realiza.
   - "direccion": Dirección física solo si la encontraste explícitamente, si no null.
   - "telefono": Teléfono solo si lo encontraste explícitamente, si no null.
   - "sitio_web": Sitio web/perfil comercial si lo encontraste, si no null.
   - "fuente": URL exacta de la página donde confirmaste la información, si no null.

Responde ÚNICAMENTE con un JSON array válido, sin texto adicional ni bloques de código markdown, con este formato exacto:
[{"nombre":"string","municipio":"string o null","confianza":"alta"|"media","justificacion":"string","direccion":"string o null","telefono":"string o null","sitio_web":"string o null","fuente":"string o null"}]

Si no encuentras ninguna empresa real y confiable, responde exactamente con: []`;
}

// Prompt de respaldo para cuando el grounding (búsqueda web real) no está disponible por cuota.
// Se apoya SOLO en el conocimiento entrenado de Gemini, sin acceso a internet en vivo: por eso
// nunca debe declarar "confianza alta" ni citar una "fuente" (no hay forma de verificarla ahora).
function buildNoGroundingPrompt(subcategoriaNombre: string, municipioNombre?: string): string {
  const zona = municipioNombre ? `el municipio ${municipioNombre} del estado Carabobo` : 'el estado Carabobo';

  return `No tienes acceso a búsqueda web en este momento. Basándote ÚNICAMENTE en tu conocimiento entrenado (empresas consolidadas y ampliamente conocidas), lista empresas REALES del sector "${subcategoriaNombre}" que operen en ${zona}, Venezuela.

REGLAS ESTRICTAS (OBLIGATORIAS):
1. NUNCA inventes empresas. Si no estás genuinamente seguro de que existe, no la incluyas.
2. Es preferible devolver una lista vacía ([]) antes que arriesgarte con una empresa dudosa.
3. Como no verificaste con búsqueda web en vivo, usa SIEMPRE "confianza": "media" (nunca "alta").
4. Para cada empresa:
   - "nombre": Razón social o nombre comercial.
   - "municipio": SOLO uno de estos 14 municipios de Carabobo si estás seguro (${MUNICIPIOS_CARABOBO.join(', ')}); si no, null.
   - "confianza": siempre "media".
   - "justificacion": por qué la conoces / por qué es real.
   - "direccion": null (no verificado en vivo).
   - "telefono": null (no verificado en vivo).
   - "sitio_web": null salvo que sea un dato muy conocido y estable (ej. marca nacional grande).
   - "fuente": siempre null.

Responde ÚNICAMENTE con un JSON array válido, sin texto adicional, con este formato exacto:
[{"nombre":"string","municipio":"string o null","confianza":"media","justificacion":"string","direccion":null,"telefono":null,"sitio_web":"string o null","fuente":null}]

Si no conoces ninguna empresa real y consolidada, responde exactamente con: []`;
}

function limpiarJsonMarkdown(texto: string): string {
  let limpio = texto.trim();
  if (limpio.startsWith('```json')) limpio = limpio.slice(7);
  else if (limpio.startsWith('```')) limpio = limpio.slice(3);
  if (limpio.endsWith('```')) limpio = limpio.slice(0, -3);
  return limpio.trim();
}

function extraerUrlsGrounding(data: any): string[] {
  try {
    const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const urls = chunks
      .map((c: any) => c?.web?.uri as string | undefined)
      .filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('http'));
    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}

interface LlamadaGeminiResult {
  ok: boolean;
  data?: any;
  errorMessage?: string;
}

/**
 * Llama a Gemini rotando claves (secreto real primero) y modelos ante 401/429/404/503.
 * `conGrounding=true` activa la búsqueda web real nativa del modelo (Grounding con Google Search);
 * no puede combinarse de forma fiable con responseMimeType: 'application/json' (limitación de la API),
 * así que ese paso se hace SIN grounding en una segunda llamada de "estructuración" si hace falta.
 */
// Lee las claves de Gemini configuradas como secretos de Supabase (nunca hardcodeadas en el
// código fuente). Soporta hasta 5 cuentas distintas de respaldo: GEMINI_API_KEY es la principal,
// GEMINI_API_KEY_2..GEMINI_API_KEY_5 son de respaldo si la anterior se queda sin cuota (401/429).
function obtenerClavesGemini(): string[] {
  const nombres = ['GEMINI_API_KEY', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY_4', 'GEMINI_API_KEY_5'];
  const keys: string[] = [];
  for (const nombre of nombres) {
    const valor = (Deno.env.get(nombre) || '').trim();
    if (valor && !keys.includes(valor)) keys.push(valor);
  }
  return keys;
}

async function llamarGemini(keys: string[], contents: string, conGrounding: boolean): Promise<LlamadaGeminiResult> {
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: contents }] }],
    generationConfig: { temperature: conGrounding ? 0.1 : 0.0 }
  };
  if (conGrounding) {
    body.tools = [{ google_search: {} }];
  } else {
    (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
  }
  const bodyStr = JSON.stringify(body);

  let ultimoError = 'No se recibió respuesta de ningún modelo.';

  for (const key of keys) {
    for (const modelo of MODELOS_GEMINI) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(9000),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr
        });

        if (res.ok) {
          return { ok: true, data: await res.json() };
        }

        const text = await res.text();
        ultimoError = `${modelo} respondió ${res.status}: ${text.slice(0, 300)}`;

        // 401 (clave inválida) o 429 (cuota agotada: normalmente es a nivel de CLAVE/proyecto, no
        // por modelo puntual, así que probar otro modelo con la misma clave solo pierde tiempo):
        // pasar directo a la siguiente clave.
        if (res.status === 401 || res.status === 429) break;
        // 503/404 (modelo puntual saturado/no disponible): sí vale la pena probar otro modelo
        // con esta misma clave antes de descartarla (le pasa mucho a gemini-3.5-flash-lite).
      } catch (err) {
        ultimoError = `${modelo}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  return { ok: false, errorMessage: ultimoError };
}

function parsearEmpresas(parsed: unknown, fuentesGrounding: string[], forzarSinFuente: boolean): EmpresaSugerida[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (it): it is Record<string, unknown> =>
        !!it && typeof it === 'object' && typeof (it as Record<string, unknown>).nombre === 'string'
    )
    .filter((it) => it.confianza === 'alta' || it.confianza === 'media')
    .map((it) => ({
      nombre: (it.nombre as string).trim(),
      municipio:
        typeof it.municipio === 'string' && MUNICIPIOS_CARABOBO.includes(it.municipio)
          ? (it.municipio as string)
          : null,
      // Sin grounding no hay forma de verificar nada en vivo: nunca "alta" aunque el modelo lo diga.
      confianza: forzarSinFuente ? 'media' : (it.confianza as 'alta' | 'media'),
      justificacion: typeof it.justificacion === 'string' ? it.justificacion : '',
      direccion: forzarSinFuente
        ? null
        : typeof it.direccion === 'string' && it.direccion.trim()
        ? it.direccion.trim()
        : null,
      telefono: forzarSinFuente
        ? null
        : typeof it.telefono === 'string' && it.telefono.trim()
        ? it.telefono.trim()
        : null,
      sitio_web: typeof it.sitio_web === 'string' && it.sitio_web.trim() ? it.sitio_web.trim() : null,
      fuente: forzarSinFuente
        ? null
        : typeof it.fuente === 'string' && it.fuente.startsWith('http')
        ? it.fuente.trim()
        : fuentesGrounding[0] || null
    }));
}

interface ResultadoDescubrimiento {
  empresas: EmpresaSugerida[];
  grounded: boolean;
}

async function descubrirEmpresas(subcategoriaNombre: string, municipioNombre?: string): Promise<ResultadoDescubrimiento> {
  const keys = obtenerClavesGemini();
  if (keys.length === 0) {
    throw new Error(
      'Falta la credencial GEMINI_API_KEY en los secretos de la función (Supabase → Edge Functions → buscar-empresas → Secrets).'
    );
  }

  // 1. Búsqueda con Grounding real (el modelo busca en Google por su cuenta, no simulamos
  //    la búsqueda nosotros scrapeando DuckDuckGo: eso es lo que fallaba antes en producción).
  const prompt = buildGroundingPrompt(subcategoriaNombre, municipioNombre);
  const grounded = await llamarGemini(keys, prompt, true);

  if (grounded.ok) {
    const candidato = grounded.data?.candidates?.[0];
    const rawText: string = candidato?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const fuentesGrounding = extraerUrlsGrounding(grounded.data);

    if (!rawText.trim()) return { empresas: [], grounded: true };

    // 2. Intentar parsear el JSON directo de la respuesta grounded.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(limpiarJsonMarkdown(rawText));
    } catch {
      parsed = null;
    }

    // 3. Si no vino en JSON limpio, pedirle a Gemini (sin grounding, con modo JSON forzado) que
    //    estructure el mismo texto ya buscado, sin volver a buscar en la web.
    if (!Array.isArray(parsed)) {
      const structPrompt = `A partir del siguiente texto sobre empresas reales de "${subcategoriaNombre}" en Carabobo, Venezuela, y de sus fuentes, extrae un JSON array con el esquema exacto solicitado. Recuerda: NADA SE INVENTA, si algo no aparece en el texto usa null u omite la empresa.

Fuentes detectadas: ${JSON.stringify(fuentesGrounding)}

Texto:
${rawText}

Responde ÚNICAMENTE con el JSON array (mismo formato de antes: nombre, municipio, confianza, justificacion, direccion, telefono, sitio_web, fuente). Si no hay empresas reales, responde [].`;

      const structured = await llamarGemini(keys, structPrompt, false);
      if (structured.ok) {
        const structText = structured.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        try {
          parsed = JSON.parse(limpiarJsonMarkdown(structText));
        } catch {
          parsed = [];
        }
      } else {
        parsed = [];
      }
    }

    return { empresas: parsearEmpresas(parsed, fuentesGrounding, false), grounded: true };
  }

  // El grounding falló en las 5 claves (típicamente 429: la cuota de "Grounding con Google Search"
  // sin facturación vinculada es muy baja, ~20/día, y se comparte entre todo el proyecto). En vez de
  // fallar por completo, seguimos con el conocimiento entrenado de Gemini (sin búsqueda web en vivo),
  // marcando el resultado como no verificado en vivo para que la interfaz avise al usuario.
  console.warn(`Grounding no disponible (${grounded.errorMessage}); usando modo sin búsqueda web.`);
  const promptSinGrounding = buildNoGroundingPrompt(subcategoriaNombre, municipioNombre);
  const sinGrounding = await llamarGemini(keys, promptSinGrounding, false);
  if (!sinGrounding.ok) {
    throw new Error(
      `Gemini no disponible ni con búsqueda web ni sin ella. Búsqueda: ${grounded.errorMessage} | Sin búsqueda: ${sinGrounding.errorMessage}`
    );
  }

  const text = sinGrounding.data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  let parsedSin: unknown = [];
  try {
    parsedSin = JSON.parse(limpiarJsonMarkdown(text));
  } catch {
    parsedSin = [];
  }

  return { empresas: parsearEmpresas(parsedSin, [], true), grounded: false };
}

// Sufijos societarios y puntuación que confunden el parser de direcciones de Nominatim
// (interpreta las comas como límites de componentes de dirección: "Empresa, C.A." suele fallar
// mientras que "Empresa" sola sí encuentra el mismo punto de interés en OpenStreetMap).
const SUFIJOS_SOCIETARIOS_RE = /\b(c\.?\s?a\.?|s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|compa[ñn][íi]a an[oó]nima)\b\.?/gi;
const PUNTUACION_RE = /[(),.]/g;

function limpiarNombreEmpresa(nombre: string): string {
  const sinSufijo = nombre.replace(SUFIJOS_SOCIETARIOS_RE, '');
  const sinPuntuacion = sinSufijo.replace(PUNTUACION_RE, ' ');
  return sinPuntuacion.replace(/\s+/g, ' ').trim();
}

// Geocodificación con Nominatim (rápido, con timeout de 2.5s): primero por la dirección
// (si la encontramos), luego por el nombre limpio de sufijos societarios.
async function intentarGeocodificar(
  nombre: string,
  municipioNombre?: string,
  direccion?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const intentos: string[] = [];
  if (direccion && direccion.trim()) {
    intentos.push(`${direccion}, ${municipioNombre || 'Carabobo'}, Venezuela`);
  }
  intentos.push(`${limpiarNombreEmpresa(nombre)}, ${municipioNombre || 'Carabobo'}, Venezuela`);

  for (const query of intentos) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 've');
    url.searchParams.set('email', 'contacto@cadenacarabobo.org');

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(2500),
        headers: {
          'Accept-Language': 'es',
          'User-Agent': 'CadenaConstruccionCarabobo/1.0 (contacto@cadenacarabobo.org)'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      return { lat: Number(parseFloat(data[0].lat).toFixed(6)), lng: Number(parseFloat(data[0].lon).toFixed(6)) };
    } catch {
      continue;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authError
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return json({ error: 'No autorizado: inicia sesión para usar la búsqueda de empresas.' }, 401);
    }

    const body = (await req.json()) as RequestBody;
    const { subcategoriaNombre, municipioNombre } = body;

    if (!subcategoriaNombre || !subcategoriaNombre.trim()) {
      return json({ error: 'Falta el nombre de la subcategoría a buscar.' }, 400);
    }

    const { empresas: sugeridas, grounded } = await descubrirEmpresas(subcategoriaNombre, municipioNombre);

    const avisoSinGrounding = grounded
      ? null
      : '⚠️ La búsqueda web en vivo no está disponible ahora mismo (cuota de "Grounding con Google Search" agotada; requiere facturación vinculada en Google Cloud para el cupo completo). Estos resultados vienen del conocimiento general del modelo, SIN verificación en internet — trátalos como sugerencias a confirmar manualmente, no como datos verificados.';

    if (sugeridas.length === 0) {
      return json({
        empresas: [],
        aviso:
          avisoSinGrounding ||
          'No se encontraron empresas verificadas con fuentes confiables en la búsqueda para esta subcategoría y zona.'
      });
    }

    // Geocodificación rápida en paralelo para las sugerencias
    const empresas: ResultCompany[] = await Promise.all(
      sugeridas.map(async (s) => {
        const geo = await intentarGeocodificar(s.nombre, s.municipio || municipioNombre, s.direccion);
        return {
          ...s,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          ubicacionConfirmada: !!geo,
          fuente: s.fuente ?? null
        };
      })
    );

    return json({ empresas, aviso: avisoSinGrounding });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado en la búsqueda.';
    console.error('buscar-empresas error:', message);
    return json({ error: message }, 500);
  }
});
