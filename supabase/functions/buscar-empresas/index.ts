// Función Edge: buscar-empresas
//
// Descubre empresas reales para una subcategoría de la Cadena de la Construcción
// en Carabobo, en 3 pasos:
//   1. Google Custom Search -> resultados web REALES (títulos, enlaces, fragmentos).
//   2. Gemini -> extrae nombre/dirección ÚNICAMENTE del texto real de esos resultados
//      (no se le pide que "invente" empresas, solo que estructure lo que ya apareció).
//   3. Nominatim (OpenStreetMap) -> intenta confirmar coordenadas y municipio de la
//      dirección extraída.
//
// Las 3 credenciales (GOOGLE_CSE_KEY, GOOGLE_CSE_CX, GEMINI_API_KEY) viven como
// secretos de esta función en Supabase y NUNCA se exponen al navegador.
// Requiere una sesión de Supabase Auth válida (cualquier cuenta registrada).

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
  municipioHint?: string;
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
}

interface ExtractedCompany {
  nombre: string;
  direccion: string | null;
  fuenteIndice: number | null;
}

interface ResultCompany extends ExtractedCompany {
  lat: number | null;
  lng: number | null;
  municipio: string | null;
  ubicacionConfirmada: boolean;
  fuente: string | null;
}

// --- Paso 1: Google Custom Search ---
async function googleSearch(query: string): Promise<GoogleSearchItem[]> {
  const key = Deno.env.get('GOOGLE_CSE_KEY');
  const cx = Deno.env.get('GOOGLE_CSE_CX');
  if (!key || !cx) throw new Error('Faltan las credenciales GOOGLE_CSE_KEY / GOOGLE_CSE_CX en los secretos de la función.');

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', key);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('gl', 've');
  url.searchParams.set('hl', 'es');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Custom Search respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const items = (data.items || []) as Array<{ title?: string; link?: string; snippet?: string }>;
  return items.map((it) => ({
    title: it.title || '',
    link: it.link || '',
    snippet: it.snippet || ''
  }));
}

// --- Paso 2: Gemini extrae SOLO lo que aparece en los resultados reales ---
async function extractWithGemini(subcategoriaNombre: string, results: GoogleSearchItem[]): Promise<ExtractedCompany[]> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('Falta la credencial GEMINI_API_KEY en los secretos de la función.');

  const fuentesTexto = results
    .map((r, i) => `[Fuente ${i + 1}] ${r.title}\nURL: ${r.link}\nFragmento: ${r.snippet}`)
    .join('\n\n');

  const prompt = `Eres un asistente que SOLO extrae información que aparece literalmente en el texto proporcionado. \
No debes usar tu propio conocimiento ni inventar, adivinar o completar datos que no estén explícitos en el texto.

Estos son resultados reales de una búsqueda web sobre "empresas de ${subcategoriaNombre}" en el estado Carabobo, Venezuela:

${fuentesTexto}

Tarea: identifica empresas o negocios REALES mencionados explícitamente por su nombre propio en el texto de arriba, \
relacionados con "${subcategoriaNombre}". Para cada una, incluye su dirección SOLO si aparece explícitamente en el texto \
(si no aparece, usa null). Si un resultado no menciona ninguna empresa con nombre propio, ignóralo.

No incluyas: sitios genéricos de directorios (páginas amarillas, redes sociales sin nombre de empresa específico), \
ni empresas que no sean de Venezuela/Carabobo.

Para cada empresa, indica también el número de la fuente (1, 2, 3…) de donde la obtuviste, según las etiquetas \
"[Fuente N]" de arriba.

Responde ÚNICAMENTE con un JSON array válido, sin texto adicional, con este formato exacto:
[{"nombre": "string", "direccion": "string o null", "fuente_indice": number}]

Si no hay ninguna empresa real identificable, responde con: []`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini respondió ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it) => it && typeof it.nombre === 'string' && it.nombre.trim())
      .map((it) => ({
        nombre: it.nombre.trim(),
        direccion: it.direccion && typeof it.direccion === 'string' ? it.direccion.trim() : null,
        fuenteIndice: typeof it.fuente_indice === 'number' ? it.fuente_indice : null
      }));
  } catch {
    return [];
  }
}

// --- Paso 3: confirmar ubicación con Nominatim (OpenStreetMap) ---
async function geocodeNominatim(
  direccion: string,
  municipioHint?: string
): Promise<{ lat: number; lng: number; municipio: string | null } | null> {
  let query = direccion;
  if (municipioHint && !new RegExp(municipioHint, 'i').test(query)) {
    query += `, ${municipioHint}`;
  }
  if (!/carabobo/i.test(query)) query += ', Carabobo';
  if (!/venezuela/i.test(query)) query += ', Venezuela';

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 've');
  url.searchParams.set('email', 'contacto@cadenacarabobo.org');

  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'es' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const item = data[0];
  const addr = item.address || {};
  return {
    lat: Number(parseFloat(item.lat).toFixed(6)),
    lng: Number(parseFloat(item.lon).toFixed(6)),
    municipio: addr.county || addr.city || addr.municipality || addr.town || null
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    // Exigir sesión real de Supabase Auth (cualquier cuenta registrada, no solo la anon key)
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
    const { subcategoriaNombre, municipioHint } = body;

    if (!subcategoriaNombre || !subcategoriaNombre.trim()) {
      return json({ error: 'Falta el nombre de la subcategoría a buscar.' }, 400);
    }

    const query = municipioHint
      ? `empresas de ${subcategoriaNombre} en ${municipioHint}, Carabobo, Venezuela`
      : `empresas de ${subcategoriaNombre} en Carabobo, Venezuela`;

    const searchResults = await googleSearch(query);
    if (searchResults.length === 0) {
      return json({ empresas: [], aviso: 'Google no devolvió resultados para esta búsqueda.' });
    }

    const extracted = await extractWithGemini(subcategoriaNombre, searchResults);

    const confirmadas: ResultCompany[] = [];
    for (const item of extracted) {
      let geo: { lat: number; lng: number; municipio: string | null } | null = null;
      if (item.direccion) {
        geo = await geocodeNominatim(item.direccion, municipioHint);
        await sleep(1100); // respetar límite de 1 solicitud/segundo de Nominatim
      }
      const fuenteItem =
        item.fuenteIndice && item.fuenteIndice >= 1 && item.fuenteIndice <= searchResults.length
          ? searchResults[item.fuenteIndice - 1]
          : searchResults[0];

      confirmadas.push({
        nombre: item.nombre,
        direccion: item.direccion,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        municipio: geo?.municipio ?? null,
        ubicacionConfirmada: !!geo,
        fuente: fuenteItem?.link ?? null
      });
    }

    return json({ empresas: confirmadas, totalFuentesConsultadas: searchResults.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error inesperado en la búsqueda.' }, 500);
  }
});
