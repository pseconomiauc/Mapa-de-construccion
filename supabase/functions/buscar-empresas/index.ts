// Función Edge: buscar-empresas
//
// Descubre empresas reales para una subcategoría de la Cadena de la Construcción
// en Carabobo usando ÚNICAMENTE OpenStreetMap / Overpass API: gratis, sin API key
// y sin necesidad de facturación en Google Cloud.
//
// Cómo funciona:
//   1. Se traduce la RAMA de la subcategoría a un conjunto de etiquetas OSM
//      (shop=hardware, craft=builder, etc.) — ver OSM_TAGS_POR_RAMA.
//   2. Se acota la búsqueda al municipio elegido (usando su límite administrativo
//      real de OSM) o a todo el estado Carabobo si no se eligió ninguno.
//   3. Overpass devuelve negocios reales ya con nombre, dirección y coordenadas —
//      no hay extracción de texto libre ni riesgo de datos inventados.
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

interface RequestBody {
  subcategoriaNombre: string;
  subcategoriaSlug: string;
  ramaId: number;
  municipioNombre?: string;
}

interface ResultCompany {
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  municipio: string | null;
  ubicacionConfirmada: boolean;
  fuente: string | null;
}

// ID de relación OSM de cada municipio de Carabobo (tomados del GeoJSON del propio proyecto:
// public/data/carabobo_municipios.geojson). Con esto Overpass acota la búsqueda al límite
// administrativo real, sin depender de nombres ambiguos.
const MUNICIPIO_OSM_ID: Record<string, number> = {
  'Puerto Cabello': 2689581,
  'Juan José Mora': 9997544,
  Valencia: 10833239,
  Libertador: 10833240,
  'Los Guayos': 10833244,
  'San Diego': 10833245,
  Guacara: 10833246,
  'San Joaquín': 10833247,
  'Diego Ibarra': 10833248,
  'Carlos Arvelo': 10833249,
  Naguanagua: 10833250,
  Bejuma: 10833251,
  Montalbán: 10833252,
  Miranda: 10833253
};

// Mapeo aproximado de rama -> etiquetas OSM relevantes. Es un punto de partida (v1);
// se puede ir refinando por subcategoría más adelante si la cobertura resulta pobre.
const OSM_TAGS_POR_RAMA: Record<number, string[]> = {
  1: ['landuse=quarry', 'craft=sawmill'], // Extracción y recursos primarios
  2: ['craft=metal_construction', 'shop=doityourself', 'shop=hardware', 'craft=carpenter'], // Manufactura de materiales
  3: ['shop=hardware', 'shop=doityourself', 'shop=trade'], // Distribución y comercio de materiales
  4: ['office=engineer', 'office=architect', 'office=surveyor'], // Servicios profesionales y técnicos
  5: ['craft=builder', 'craft=electrician', 'craft=plumber', 'craft=painter'], // Ejecución de obra
  6: ['shop=doityourself', 'shop=trade', 'craft=hvac'], // Equipos, maquinaria y suministros especiales
  7: ['office=insurance', 'office=financial', 'office=estate_agent', 'amenity=bank'], // Financiamiento y comercialización
  8: ['amenity=recycling', 'craft=metal_construction'] // Operación y fin de ciclo
};

function buildAreaClause(municipioNombre?: string): string {
  if (municipioNombre && MUNICIPIO_OSM_ID[municipioNombre]) {
    const areaId = 3600000000 + MUNICIPIO_OSM_ID[municipioNombre];
    return `area(${areaId})->.searchArea;`;
  }
  return `area["name"="Carabobo"]["admin_level"="4"]->.searchArea;`;
}

function buildOverpassQuery(tags: string[], areaClause: string): string {
  const filtros = tags
    .map((tag) => {
      const [key, value] = tag.split('=');
      return `  node["${key}"="${value}"](area.searchArea);\n  way["${key}"="${value}"](area.searchArea);`;
    })
    .join('\n');

  return `[out:json][timeout:25];\n${areaClause}\n(\n${filtros}\n);\nout center 40;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  // El servidor público de Overpass a veces responde 502/503/504 por sobrecarga transitoria;
  // reintentamos una vez antes de darnos por vencidos.
  for (let intento = 0; intento < 2; intento++) {
    // Overpass exige un Accept explícito y un User-Agent identificable; sin ellos responde 406.
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '*/*',
        'User-Agent': 'CadenaConstruccionCarabobo/1.0 (contacto@cadenacarabobo.org)'
      },
      body: 'data=' + encodeURIComponent(query)
    });

    if (res.ok) {
      const data = await res.json();
      return (data.elements || []) as OverpassElement[];
    }

    const text = await res.text();
    const esTransitorio = [502, 503, 504].includes(res.status);
    if (!esTransitorio || intento === 1) {
      throw new Error(`Overpass respondió ${res.status}: ${text.slice(0, 300)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return [];
}

function elementToCompany(el: OverpassElement, municipioHint?: string): ResultCompany | null {
  const tags = el.tags || {};
  const nombre = tags.name;
  if (!nombre) return null; // Ignoramos elementos sin nombre: no aportan como "empresa"

  const lat = el.type === 'node' ? el.lat : el.center?.lat;
  const lng = el.type === 'node' ? el.lon : el.center?.lon;
  if (lat === undefined || lng === undefined) return null;

  const direccionPartes = [
    tags['addr:street'] && tags['addr:housenumber']
      ? `${tags['addr:street']} ${tags['addr:housenumber']}`
      : tags['addr:street'],
    tags['addr:city']
  ].filter(Boolean);

  return {
    nombre,
    direccion: direccionPartes.length > 0 ? direccionPartes.join(', ') : null,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    municipio: municipioHint || tags['addr:city'] || null,
    ubicacionConfirmada: true,
    fuente: `https://www.openstreetmap.org/${el.type}/${el.id}`
  };
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
    const { ramaId, municipioNombre } = body;

    const tags = OSM_TAGS_POR_RAMA[ramaId];
    if (!tags || tags.length === 0) {
      return json({ error: `No hay un mapeo de etiquetas OSM configurado para la rama ${ramaId}.` }, 400);
    }

    const areaClause = buildAreaClause(municipioNombre);
    const query = buildOverpassQuery(tags, areaClause);

    const elements = await runOverpassQuery(query);
    const empresas = elements
      .map((el) => elementToCompany(el, municipioNombre))
      .filter((e): e is ResultCompany => e !== null);

    // Overpass puede repetir el mismo negocio por distintos tags; deduplicar por nombre+coords aproximadas
    const vistos = new Set<string>();
    const empresasUnicas = empresas.filter((e) => {
      const key = `${e.nombre.toLowerCase()}|${e.lat.toFixed(3)}|${e.lng.toFixed(3)}`;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });

    if (empresasUnicas.length === 0) {
      return json({
        empresas: [],
        aviso:
          'OpenStreetMap no tiene negocios etiquetados para esta rama en la zona elegida. La cobertura de OSM en zonas industriales de Carabobo puede ser limitada.'
      });
    }

    return json({ empresas: empresasUnicas });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado en la búsqueda.';
    console.error('buscar-empresas error:', message);
    return json({ error: message }, 500);
  }
});
