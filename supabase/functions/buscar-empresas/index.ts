// Función Edge: buscar-empresas
//
// Descubre empresas para una subcategoría de la Cadena de la Construcción en Carabobo
// usando Gemini como fuente de conocimiento (no como buscador web: Gemini no tiene acceso
// a internet en tiempo real aquí, así que solo puede "recordar" lo que sabe de su
// entrenamiento). Esto tiene un riesgo real de alucinación, así que el prompt está diseñado
// específicamente para minimizarlo:
//
//   1. Se le prohíbe explícitamente inventar, adivinar o completar datos inciertos.
//   2. Se le pide preferir una lista vacía o corta antes que arriesgar un dato falso.
//   3. NUNCA se le pide dirección, teléfono ni coordenadas (no tiene forma de saberlos
//      con certeza) — solo nombre y, si lo sabe con seguridad, el municipio.
//   4. Debe autoevaluar su confianza ("alta"/"media") y justificar cada respuesta.
//
// Después, se intenta (opcionalmente) geocodificar "nombre + municipio" con Nominatim
// como sugerencia de partida, pero el frontend SIEMPRE exige confirmar/ajustar el pin
// manualmente en el mapa antes de guardar — ningún dato de ubicación se guarda a ciegas.
//
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
  municipioNombre?: string;
}

interface EmpresaSugerida {
  nombre: string;
  municipio: string | null;
  confianza: 'alta' | 'media';
  justificacion: string;
}

interface ResultCompany extends EmpresaSugerida {
  lat: number | null;
  lng: number | null;
  ubicacionConfirmada: boolean;
  fuente: null;
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

function buildPrompt(subcategoriaNombre: string, municipioNombre?: string): string {
  const zona = municipioNombre ? `el municipio ${municipioNombre} del estado Carabobo` : 'el estado Carabobo';

  return `Eres un asistente que ayuda a construir un directorio de empresas REALES del sector construcción en Venezuela. No tienes acceso a internet en esta conversación: solo puedes usar lo que sabes con certeza de tu entrenamiento.

REGLA MÁS IMPORTANTE, POR ENCIMA DE CUALQUIER OTRA COSA: nunca inventes, asumas ni completes un dato que no sepas con certeza que es real. Es preferible responder con una lista vacía o corta antes que incluir una sola empresa de la que no estés genuinamente seguro de que existe y opera en Venezuela. No intentes "ser útil" agregando empresas dudosas: eso causa más daño que una lista corta.

Tarea: menciona ÚNICAMENTE empresas reales, conocidas y establecidas relacionadas con "${subcategoriaNombre}" que tengas conocimiento confiable de que operan en ${zona}, Venezuela. No se espera ni se necesita que la lista sea exhaustiva; 0 a 5 resultados de alta calidad es perfectamente aceptable.

Para cada empresa que incluyas, entrega:
- "nombre": el nombre exacto de la empresa (razón social o nombre comercial conocido).
- "municipio": SOLO si sabes con certeza en cuál de estos 14 municipios de Carabobo opera (${MUNICIPIOS_CARABOBO.join(', ')}). Si no lo sabes con certeza, usa null — NO adivines un municipio solo porque "suena probable".
- "confianza": "alta" solo si estás genuinamente seguro de que la empresa existe y opera en Carabobo; "media" si tienes una duda razonable pero justificada. No incluyas nada por debajo de "media".
- "justificacion": una frase breve y específica explicando por qué sabes que es real (ejemplo: "Marca nacional de cemento con planta identificada en Carabobo"). Si no puedes justificarlo con algo específico, no la incluyas.

PROHIBIDO incluir: direcciones, teléfonos, correos, sitios web o coordenadas — no tienes forma de verificarlos en este momento, así que no los reportes aunque creas recordarlos.

Responde ÚNICAMENTE con un JSON array válido, sin texto adicional antes ni después, con este formato exacto:
[{"nombre": "string", "municipio": "string o null", "confianza": "alta" | "media", "justificacion": "string"}]

Si no tienes conocimiento confiable de ninguna empresa real de este tipo en la zona indicada, responde exactamente con: []`;
}

async function preguntarAGemini(subcategoriaNombre: string, municipioNombre?: string): Promise<EmpresaSugerida[]> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('Falta la credencial GEMINI_API_KEY en los secretos de la función.');

  const prompt = buildPrompt(subcategoriaNombre, municipioNombre);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini respondió ${res.status}: ${text.slice(0, 300)}`);
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
        typeof it.municipio === 'string' && MUNICIPIOS_CARABOBO.includes(it.municipio) ? (it.municipio as string) : null,
      confianza: it.confianza as 'alta' | 'media',
      justificacion: typeof it.justificacion === 'string' ? it.justificacion : ''
    }));
}

// Intento opcional de geocodificar "nombre + municipio" con Nominatim, solo como sugerencia
// de partida — el frontend exige confirmar/ajustar el pin a mano antes de guardar, así que
// un intento fallido o impreciso aquí no es crítico.
async function intentarGeocodificar(
  nombre: string,
  municipioNombre?: string
): Promise<{ lat: number; lng: number } | null> {
  const query = municipioNombre ? `${nombre}, ${municipioNombre}, Carabobo, Venezuela` : `${nombre}, Carabobo, Venezuela`;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 've');
  url.searchParams.set('email', 'contacto@cadenacarabobo.org');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'CadenaConstruccionCarabobo/1.0 (contacto@cadenacarabobo.org)' }
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

    const sugeridas = await preguntarAGemini(subcategoriaNombre, municipioNombre);

    if (sugeridas.length === 0) {
      return json({
        empresas: [],
        aviso: 'Gemini no reportó ninguna empresa de la que tenga conocimiento confiable para esta subcategoría y zona.'
      });
    }

    const empresas: ResultCompany[] = [];
    for (const s of sugeridas) {
      const geo = await intentarGeocodificar(s.nombre, s.municipio || municipioNombre);
      empresas.push({
        ...s,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        ubicacionConfirmada: !!geo,
        fuente: null
      });
      await sleep(1100); // respetar límite de 1 solicitud/segundo de Nominatim
    }

    return json({ empresas });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado en la búsqueda.';
    console.error('buscar-empresas error:', message);
    return json({ error: message }, 500);
  }
});
