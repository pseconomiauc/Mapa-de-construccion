import L from 'leaflet';
import { TipoActor, MunicipioCarabobo } from '../types/database';

export const ACTOR_COLORS: Record<TipoActor, string> = {
  F: '#2563eb', // Azul (Fabricante)
  D: '#16a34a', // Verde (Distribuidor)
  C: '#d97706', // Ocre (Contratista)
  S: '#9333ea', // Morado (Servicio profesional)
  A: '#db2777'  // Rosa (Alquiler / logística)
};

export const ACTOR_LABELS: Record<TipoActor, string> = {
  F: 'Fabricante',
  D: 'Distribuidor',
  C: 'Contratista',
  S: 'Servicio profesional',
  A: 'Alquiler / logística'
};

// Algoritmo de Ray-Casting para comprobar si un punto (lat, lng) está dentro de un anillo de coordenadas
function pointInRing(pt: [number, number], ring: number[][]): boolean {
  const [lat, lng] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // [lng, lat] en GeoJSON
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Determinar el municipio de Carabobo para un par de coordenadas (lat, lng)
export function getMunicipioFromGeoJSON(
  lat: number,
  lng: number,
  geojson: GeoJSON.FeatureCollection
): MunicipioCarabobo | null {
  if (!geojson || !geojson.features) return null;

  for (const feature of geojson.features) {
    const munName = feature.properties?.name as MunicipioCarabobo;
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      const rings = geom.coordinates as number[][][];
      if (rings.length > 0 && pointInRing([lat, lng], rings[0])) {
        return munName;
      }
    } else if (geom.type === 'MultiPolygon') {
      const polygons = geom.coordinates as number[][][][];
      for (const poly of polygons) {
        if (poly.length > 0 && pointInRing([lat, lng], poly[0])) {
          return munName;
        }
      }
    }
  }

  return null;
}

// Validar si un par de coordenadas está dentro del territorio de Venezuela
export function isValidVenezuelaCoords(lat: number, lng: number): boolean {
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= 0.5 && lat <= 13.0 && lng >= -73.5 && lng <= -59.5;
}

// Convertir grados, minutos y segundos (DMS) a decimal
function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
  let dd = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'S' || direction === 'W' || direction === 'O') {
    dd = dd * -1;
  }
  return dd;
}

// Parser inteligente de coordenadas copiadas de Google Maps (URL, DMS o par decimal)
export function parseCoordinatesString(raw: string): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim();

  // 1. Detección en URLs de Google Maps
  // Ej: https://www.google.com/maps/@10.1620,-68.0077,15z o ?q=10.1620,-68.0077
  const urlMatch = str.match(/[@?&]q?=([+-]?[0-9]+(?:\.[0-9]+)?)[,;/]([+-]?[0-9]+(?:\.[0-9]+)?)/i)
    || str.match(/place\/([+-]?[0-9]+(?:\.[0-9]+)?)[,;/]([+-]?[0-9]+(?:\.[0-9]+)?)/i);

  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // 2. Detección en formato DMS (grados, minutos y segundos)
  // Ej: 10°09'43.2"N 68°00'27.7"W o 10° 9' 43" N, 68° 0' 28" O
  const dmsRegex = /(\d+)[°º\s]+(\d+)['′\s]+([\d.]+)?["″\s]*([NSEWO])[,\s]+(\d+)[°º\s]+(\d+)['′\s]+([\d.]+)?["″\s]*([NSEWO])/i;
  const dmsMatch = str.match(dmsRegex);
  if (dmsMatch) {
    const lat = dmsToDecimal(
      parseFloat(dmsMatch[1]),
      parseFloat(dmsMatch[2]),
      parseFloat(dmsMatch[3] || '0'),
      dmsMatch[4].toUpperCase()
    );
    const lng = dmsToDecimal(
      parseFloat(dmsMatch[5]),
      parseFloat(dmsMatch[6]),
      parseFloat(dmsMatch[7] || '0'),
      dmsMatch[8].toUpperCase()
    );
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // 3. Par decimal simple separado por coma, punto y coma o espacio
  // Ej: "10.1620, -68.0077" o "10.1620 -68.0077"
  const decRegex = /([+-]?[0-9]+(?:\.[0-9]+)?)[,\s;]+([+-]?[0-9]+(?:\.[0-9]+)?)/;
  const decMatch = str.match(decRegex);
  if (decMatch) {
    const lat = parseFloat(decMatch[1]);
    const lng = parseFloat(decMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  return null;
}

// Crear icono SVG para los pines del mapa
export function createPinIcon(actor: TipoActor): L.DivIcon {
  const color = ACTOR_COLORS[actor] || '#2563eb';
  const letter = actor || 'E';

  const svgHtml = `
    <div style="position: relative; width: 28px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="14" cy="13" r="8" fill="#ffffff"/>
      </svg>
      <span style="position: absolute; top: 5px; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 700; color: ${color}; font-family: system-ui, sans-serif;">
        ${letter}
      </span>
    </div>
  `;

  return L.divIcon({
    html: svgHtml,
    className: 'custom-company-pin',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34]
  });
}
