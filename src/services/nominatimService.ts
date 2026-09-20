// Servicio para geocodificación de direcciones con Nominatim (OpenStreetMap)
// Cumple con la política de uso de Nominatim:
// 1. Máximo 1 consulta por segundo.
// 2. Parámetro de contacto e identificación.
// 3. Activación únicamente bajo acción explícita del usuario.

export interface NominatimResult {
  lat: number;
  lng: number;
  displayName: string;
  municipio?: string;
}

let lastRequestTime = 0;

export async function searchAddressNominatim(address: string): Promise<NominatimResult[]> {
  const clean = address.trim();
  if (!clean) return [];

  // Control estricto de tasa: mínimo 1 segundo entre solicitudes
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < 1050) {
    await new Promise((resolve) => setTimeout(resolve, 1050 - timeSinceLast));
  }
  lastRequestTime = Date.now();

  // Asegurar contexto de Carabobo, Venezuela si no está presente
  let query = clean;
  if (!/carabobo/i.test(query)) {
    query += ', Carabobo';
  }
  if (!/venezuela/i.test(query)) {
    query += ', Venezuela';
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '4');
  url.searchParams.set('countrycodes', 've');
  // Parámetro de identificación según directrices de Nominatim
  url.searchParams.set('email', 'contacto@cadenacarabobo.org');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept-Language': 'es'
      }
    });

    if (!response.ok) {
      throw new Error(`Error de conexión con Nominatim (${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.map((item: any) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const addressObj = item.address || {};
      const mun =
        addressObj.county ||
        addressObj.city ||
        addressObj.municipality ||
        addressObj.town ||
        undefined;

      return {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        displayName: item.display_name,
        municipio: mun
      };
    });
  } catch (err) {
    console.error('Error al consultar Nominatim:', err);
    throw err;
  }
}
