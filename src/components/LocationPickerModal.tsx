import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MunicipioCarabobo } from '../types/database';
import {
  getMunicipioFromGeoJSON,
  createPinIcon,
  isValidVenezuelaCoords,
  parseCoordinatesString
} from '../utils/geoUtils';
import { searchAddressNominatim } from '../services/nominatimService';
import { getErrorMessage } from '../utils/errorUtils';

interface LocationPickerModalProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialMunicipio?: MunicipioCarabobo | '' | null;
  onConfirm: (result: { lat: number; lng: number; municipio?: MunicipioCarabobo }) => void;
  onClose: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  initialLat,
  initialLng,
  initialMunicipio,
  onConfirm,
  onClose
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const geojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);

  const hasInitial =
    initialLat !== null &&
    initialLat !== undefined &&
    initialLng !== null &&
    initialLng !== undefined &&
    !isNaN(initialLat) &&
    !isNaN(initialLng);

  const [currentLat, setCurrentLat] = useState<number>(hasInitial ? initialLat : 10.18);
  const [currentLng, setCurrentLng] = useState<number>(hasInitial ? initialLng : -68.0);
  const [hasPosition, setHasPosition] = useState<boolean>(hasInitial);
  const [detectedMunicipio, setDetectedMunicipio] = useState<MunicipioCarabobo | null>(
    initialMunicipio || null
  );

  // Campos editables de latitud/longitud (texto, se sincronizan con el pin del mapa)
  const [latInput, setLatInput] = useState<string>(hasInitial ? String(initialLat) : '');
  const [lngInput, setLngInput] = useState<string>(hasInitial ? String(initialLng) : '');

  // Búsqueda de dirección
  const [direccion, setDireccion] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressFeedback, setAddressFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Cargar GeoJSON de los 14 municipios de Carabobo
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/carabobo_municipios.geojson`)
      .then((res) => res.json())
      .then((data: GeoJSON.FeatureCollection) => {
        geojsonRef.current = data;
        if (hasInitial) {
          const m = getMunicipioFromGeoJSON(initialLat, initialLng, data);
          if (m) setDetectedMunicipio(m);
        }
      })
      .catch((err) => console.warn('Error al cargar GeoJSON para el modal selector:', err));
  }, [hasInitial, initialLat, initialLng]);

  // Coloca/mueve el pin, centra el mapa y sincroniza todo el estado (usado por clic, arrastre,
  // búsqueda de dirección y edición manual de lat/lng).
  const applyPosition = (lat: number, lng: number, opciones?: { panMap?: boolean }) => {
    const roundedLat = Number(lat.toFixed(6));
    const roundedLng = Number(lng.toFixed(6));
    setCurrentLat(roundedLat);
    setCurrentLng(roundedLng);
    setLatInput(String(roundedLat));
    setLngInput(String(roundedLng));
    setHasPosition(true);

    if (geojsonRef.current) {
      const mun = getMunicipioFromGeoJSON(roundedLat, roundedLng, geojsonRef.current);
      setDetectedMunicipio(mun);
    }

    const map = mapInstanceRef.current;
    if (map) {
      if (markerRef.current) {
        markerRef.current.setLatLng([roundedLat, roundedLng]);
      } else {
        const marker = L.marker([roundedLat, roundedLng], { draggable: true, icon: createPinIcon('F') }).addTo(map);
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          applyPosition(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
      if (opciones?.panMap !== false) {
        map.setView([roundedLat, roundedLng], Math.max(map.getZoom(), 15));
      }
    }
  };

  // Inicializar mapa de selección
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const startCenter: [number, number] = hasInitial ? [initialLat, initialLng] : [10.18, -68.0];
    const startZoom = hasInitial ? 15 : 11;

    const map = L.map(mapContainerRef.current, {
      center: startCenter,
      zoom: startZoom,
      minZoom: 8,
      maxZoom: 18
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    // Cargar polígonos de municipios de Carabobo con bordes sutiles
    fetch(`${import.meta.env.BASE_URL}data/carabobo_municipios.geojson`)
      .then((res) => res.json())
      .then((geojson) => {
        L.geoJSON(geojson, {
          style: {
            color: '#3366cc',
            weight: 1.2,
            fillColor: '#3366cc',
            fillOpacity: 0.05,
            dashArray: '3, 4'
          },
          onEachFeature: (feature, layer) => {
            const munName = feature.properties?.name;
            if (munName) {
              layer.bindTooltip(`Municipio ${munName}`, { sticky: true });
            }
          }
        }).addTo(map);
      })
      .catch(() => {});

    if (hasInitial) {
      const marker = L.marker(startCenter, { draggable: true, icon: createPinIcon('F') }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        applyPosition(pos.lat, pos.lng, { panMap: false });
      });
      markerRef.current = marker;
    }

    // Al hacer clic en el mapa, mover o crear el pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      applyPosition(e.latlng.lat, e.latlng.lng, { panMap: false });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver para el mapa dentro del modal
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        map.invalidateSize({ animate: false, pan: false });
        map.setView(currentCenter, currentZoom, { animate: false });
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Manejo de la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSearchAddress = async () => {
    const query = direccion.trim();
    if (!query) {
      setAddressFeedback({ text: 'Escribe una dirección antes de buscar.', isError: true });
      return;
    }
    setSearchingAddress(true);
    setAddressFeedback({ text: 'Consultando OpenStreetMap (Nominatim)…', isError: false });
    try {
      const results = await searchAddressNominatim(query);
      if (results.length > 0) {
        const best = results[0];
        applyPosition(best.lat, best.lng);
        setAddressFeedback({
          text: `Ubicación encontrada: "${best.displayName.substring(0, 80)}…". Ajusta el pin si no cae exactamente en la empresa.`,
          isError: false
        });
      } else {
        setAddressFeedback({
          text: 'No se encontraron coordenadas para esa dirección. Marca el punto directamente en el mapa.',
          isError: true
        });
      }
    } catch (err) {
      setAddressFeedback({ text: `Error al consultar Nominatim: ${getErrorMessage(err)}`, isError: true });
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleApplyManualCoords = () => {
    const latNum = parseFloat(latInput.trim().replace(',', '.'));
    const lngNum = parseFloat(lngInput.trim().replace(',', '.'));
    if (isNaN(latNum) || isNaN(lngNum)) {
      setAddressFeedback({ text: 'Latitud/longitud inválidas. Usa números como 10.1620 y -68.0077.', isError: true });
      return;
    }
    applyPosition(latNum, lngNum);
    setAddressFeedback(null);
  };

  const handlePasteCoords = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseCoordinatesString(pasted);
    if (parsed) {
      e.preventDefault();
      applyPosition(parsed.lat, parsed.lng);
    }
  };

  const handleConfirm = () => {
    if (!hasPosition) return;
    onConfirm({
      lat: currentLat,
      lng: currentLng,
      municipio: detectedMunicipio || undefined
    });
  };

  const isVenezuela = isValidVenezuelaCoords(currentLat, currentLng);

  return (
    <div className="picker-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="picker-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="picker-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontFamily: 'Georgia, serif', color: '#202122' }}>
              Marcar ubicación en el mapa
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#54595d' }}>
              Busca una dirección, escribe las coordenadas directamente, o haz clic/arrastra el pin en el mapa.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            style={{ fontSize: '16px', padding: '4px 8px' }}
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Búsqueda de dirección + lat/lng editables */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e3e3e3', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '12.5px', flex: '2 1 240px' }}>
            Dirección
            <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
              <input
                type="text"
                placeholder="Ej: Zona Industrial San Diego, Valencia"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchAddress();
                  }
                }}
                style={{ flex: 1, padding: '5px 8px', border: '1px solid #a2a9b1', borderRadius: '2px' }}
              />
              <button
                type="button"
                className="btn"
                onClick={handleSearchAddress}
                disabled={searchingAddress || !direccion.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {searchingAddress ? 'Buscando…' : '🔍 Buscar'}
              </button>
            </div>
          </label>

          <label style={{ fontSize: '12.5px', flex: '1 1 120px' }}>
            Latitud
            <input
              type="text"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              onPaste={handlePasteCoords}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyManualCoords()}
              style={{ width: '100%', marginTop: '3px', padding: '5px 8px', border: '1px solid #a2a9b1', borderRadius: '2px', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '12.5px', flex: '1 1 120px' }}>
            Longitud
            <input
              type="text"
              value={lngInput}
              onChange={(e) => setLngInput(e.target.value)}
              onPaste={handlePasteCoords}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyManualCoords()}
              style={{ width: '100%', marginTop: '3px', padding: '5px 8px', border: '1px solid #a2a9b1', borderRadius: '2px', boxSizing: 'border-box' }}
            />
          </label>
          <button type="button" className="btn" onClick={handleApplyManualCoords} style={{ whiteSpace: 'nowrap' }}>
            Aplicar coordenadas
          </button>

          {addressFeedback && (
            <div
              style={{
                flexBasis: '100%',
                fontSize: '12px',
                padding: '5px 9px',
                borderRadius: '2px',
                background: addressFeedback.isError ? '#fdf2f2' : '#f0fdf4',
                border: `1px solid ${addressFeedback.isError ? '#f8b4b4' : '#bbf7d0'}`,
                color: addressFeedback.isError ? '#b32424' : '#166534'
              }}
            >
              {addressFeedback.text}
            </div>
          )}
        </div>

        {/* Contenedor del mapa */}
        <div className="picker-modal-map-wrap">
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {/* Barra de información y confirmación */}
        <div className="picker-modal-footer">
          <div className="picker-modal-info">
            {hasPosition ? (
              <div>
                <span style={{ fontWeight: 600 }}>Coordenadas: </span>
                <span>
                  {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
                </span>
                {detectedMunicipio ? (
                  <span style={{ marginLeft: '12px', color: '#16a34a', fontWeight: 600 }}>
                    📍 Municipio {detectedMunicipio}
                  </span>
                ) : (
                  <span style={{ marginLeft: '12px', color: '#54595d', fontSize: '12px' }}>
                    (Fuera de los 14 municipios de Carabobo)
                  </span>
                )}
                {!isVenezuela && (
                  <div style={{ color: '#b32424', fontSize: '12px', marginTop: '2px' }}>
                    ⚠️ Atención: El punto seleccionado se encuentra fuera de Venezuela.
                  </div>
                )}
              </div>
            ) : (
              <span style={{ color: '#54595d' }}>
                Busca una dirección, escribe coordenadas, o haz clic en el mapa para situar el marcador.
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{ border: '1px solid #a2a9b1', padding: '6px 14px', borderRadius: '2px' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={!hasPosition || !isVenezuela}
              onClick={handleConfirm}
              style={{ padding: '6px 16px', borderRadius: '2px' }}
            >
              Confirmar ubicación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
