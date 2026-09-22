// Función Edge: buscar-empresas
//
// Descubre empresas reales para una subcategoría de la Cadena de la Construcción en Carabobo
// combinando búsqueda web en tiempo real (Grounding web asistido) con Gemini para análisis
// y extracción rigurosa de datos verídicos.
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
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

/**
 * Realiza una búsqueda web rápida en tiempo real con timeout estricto de 3.5s.
 */
async function buscarWeb(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });

    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];
    const blocks = html.split('<div class="result results_links');

    for (const b of blocks.slice(1)) {
      const urlMatch = b.match(/<a class="result__url"[^>]*href="([^"]+)"/);
      const titleMatch = b.match(/<h2 class="result__title">\s*<a[^>]*>(.*?)<\/a>/s);
      const snippetMatch = b.match(/<a class="result__snippet"[^>]*>(.*?)<\/a>/s);

      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      let rawUrl = urlMatch ? urlMatch[1].trim() : '';
      if (rawUrl.includes('uddg=')) {
        try {
          const u = new URL(rawUrl, 'https://duckduckgo.com');
          rawUrl = u.searchParams.get('uddg') || rawUrl;
        } catch {
          // conservar rawUrl si falla el parseo
        }
      }

      if (title && rawUrl && !rawUrl.includes('duckduckgo.com')) {
        results.push({ title, url: rawUrl, snippet });
      }
    }

    return results.slice(0, 8);
  } catch (_err) {
    // Si la búsqueda web da timeout o falla, continuar rápidamente sin bloquear
    return [];
  }
}

/**
 * Ejecuta búsquedas combinadas para enriquecer el contexto del sector y municipio
 */
async function obtenerContextoWeb(subcategoriaNombre: string, municipioNombre?: string): Promise<SearchResult[]> {
  const zona = municipioNombre ? `${municipioNombre} Carabobo Venezuela` : 'Carabobo Valencia Venezuela';
  
  const query1 = `empresas ${subcategoriaNombre} ${zona}`;
  const query2 = `directorio ${subcategoriaNombre} ${zona}`;

  const [res1, res2] = await Promise.allSettled([buscarWeb(query1), buscarWeb(query2)]);

  const unicos = new Map<string, SearchResult>();
  const lista1 = res1.status === 'fulfilled' ? res1.value : [];
  const lista2 = res2.status === 'fulfilled' ? res2.value : [];

  for (const item of [...lista1, ...lista2]) {
    if (item.url && !unicos.has(item.url)) {
      unicos.set(item.url, item);
    }
  }

  return Array.from(unicos.values()).slice(0, 12);
}

function buildPrompt(subcategoriaNombre: string, municipioNombre?: string, fuentesWeb: SearchResult[] = []): string {
  const zona = municipioNombre ? `el municipio ${municipioNombre} del estado Carabobo` : 'el estado Carabobo';

  const textoFuentes =
    fuentesWeb.length > 0
      ? fuentesWeb
          .map(
            (f, i) =>
              `[Fuente ${i + 1}]\n- Título: ${f.title}\n- URL: ${f.url}\n- Contenido/Snippet: ${f.snippet}`
          )
          .join('\n\n')
      : 'No se encontraron resultados web directos en esta consulta.';

  return `Eres un asistente de investigación que ayuda a construir un directorio de empresas REALES del sector construcción en Venezuela.

A continuación tienes resultados de búsqueda web en tiempo real extraídos de internet sobre "${subcategoriaNombre}" en ${zona}:

==================================================
RESULTADOS DE BÚSQUEDA WEB EN TIEMPO REAL:
${textoFuentes}
==================================================

REGLAS ESTRICTAS DE CALIDAD Y NO ALUCINACIÓN:
1. NUNCA inventes, supongas ni completes datos que no estén respaldados por las fuentes de búsqueda o por hechos verificables de conocimiento público en Carabobo, Venezuela.
2. Es preferible devolver una lista vacía ([]) o corta antes que incluir una sola empresa dudosa, inexistente o fuera de Carabobo.
3. Extrae todas las empresas reales que operen en ${zona} relacionadas con "${subcategoriaNombre}".
4. Para cada empresa encontrada:
   - "nombre": Razón social o nombre comercial exacto.
   - "municipio": Nombre del municipio SOLO si es uno de estos 14 municipios de Carabobo (${MUNICIPIOS_CARABOBO.join(', ')}). Si no está claro en qué municipio opera, usa null. NUNCA inventes un municipio.
   - "confianza": "alta" si está directamente respaldada por una fuente real o es una empresa consolidada e identificable en Carabobo; "media" si se conoce su existencia pero los datos de contacto son parciales. No incluyas empresas con confianza dudosa.
   - "justificacion": Explicación breve y concreta de por qué es real y qué actividad realiza en Carabobo.
   - "direccion": Dirección física solo si aparece explícitamente en los resultados, de lo contrario null.
   - "telefono": Teléfono de contacto solo si aparece explícitamente en los resultados, de lo contrario null.
   - "sitio_web": Sitio web o enlace de catálogo/perfil comercial de la empresa si aparece, de lo contrario null.
   - "fuente": URL exacta de la fuente web de donde se confirmó la información. Si es de conocimiento general, usa null.

Responde ÚNICAMENTE con un JSON array válido con este formato exacto:
[
  {
    "nombre": "string",
    "municipio": "string o null",
    "confianza": "alta" | "media",
    "justificacion": "string",
    "direccion": "string o null",
    "telefono": "string o null",
    "sitio_web": "string o null",
    "fuente": "string o null"
  }
]

Si no encuentras ninguna empresa real y confiable, responde exactamente con: []`;
}

// Modelos vigentes de la generación Gemini 3.x (priorizamos 3.5-flash-lite por velocidad)
const MODELOS_GEMINI = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash'
];

async function llamarGeminiConReintentos(key: string, prompt: string): Promise<Response> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
  });

  let ultimaRespuesta: Response | null = null;

  for (const modelo of MODELOS_GEMINI) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`;
    
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      if (res.ok) {
        return res;
      }

      ultimaRespuesta = res;

      // Si da 404 o 503, pasar de inmediato al siguiente modelo del pool
      if ([404, 503, 429].includes(res.status)) {
        continue;
      }
    } catch (err) {
      console.error(`Error o timeout llamando ${modelo}:`, err);
    }
  }

  return ultimaRespuesta as Response;
}

async function preguntarAGeminiConGrounding(
  subcategoriaNombre: string,
  municipioNombre?: string
): Promise<EmpresaSugerida[]> {
  const rawKey = Deno.env.get('GEMINI_API_KEY');
  if (!rawKey) throw new Error('Falta la credencial GEMINI_API_KEY en los secretos de la función.');

  const key = rawKey.trim().replace(/^["']|["']$/g, '');

  // 1. Obtener fuentes reales de búsqueda web (rápido, con timeout)
  const fuentesWeb = await obtenerContextoWeb(subcategoriaNombre, municipioNombre);

  // 2. Construir prompt con grounding
  const prompt = buildPrompt(subcategoriaNombre, municipioNombre, fuentesWeb);

  // 3. Consultar a Gemini
  const res = await llamarGeminiConReintentos(key, prompt);

  if (!res || !res.ok) {
    const text = res ? await res.text() : 'No se recibió respuesta de los modelos.';
    const status = res ? res.status : 504;
    throw new Error(`Gemini respondió ${status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
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
      confianza: it.confianza as 'alta' | 'media',
      justificacion: typeof it.justificacion === 'string' ? it.justificacion : '',
      direccion: typeof it.direccion === 'string' && it.direccion.trim() ? it.direccion.trim() : null,
      telefono: typeof it.telefono === 'string' && it.telefono.trim() ? it.telefono.trim() : null,
      sitio_web: typeof it.sitio_web === 'string' && it.sitio_web.trim() ? it.sitio_web.trim() : null,
      fuente: typeof it.fuente === 'string' && it.fuente.startsWith('http') ? it.fuente.trim() : null
    }));
}

// Intento opcional de geocodificar con Nominatim (rápido, con timeout de 2.5s)
async function intentarGeocodificar(
  nombre: string,
  municipioNombre?: string,
  direccion?: string | null
): Promise<{ lat: number; lng: number } | null> {
  const query = direccion
    ? `${direccion}, ${municipioNombre || 'Carabobo'}, Venezuela`
    : municipioNombre
    ? `${nombre}, ${municipioNombre}, Carabobo, Venezuela`
    : `${nombre}, Carabobo, Venezuela`;

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
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: Number(parseFloat(data[0].lat).toFixed(6)), lng: Number(parseFloat(data[0].lon).toFixed(6)) };
  } catch {
    return null;
  }
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

    const sugeridas = await preguntarAGeminiConGrounding(subcategoriaNombre, municipioNombre);

    if (sugeridas.length === 0) {
      return json({
        empresas: [],
        aviso: 'No se encontraron empresas verificadas con fuentes confiables en la búsqueda para esta subcategoría y zona.'
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

    return json({ empresas });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado en la búsqueda.';
    console.error('buscar-empresas error:', message);
    return json({ error: message }, 500);
  }
});

