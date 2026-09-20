import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MunicipioCarabobo } from '../types/database';
import { getMunicipioFromGeoJSON, createPinIcon, isValidVenezuelaCoords } from '../utils/geoUtils';

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

    // Icono del pin
    const pinIcon = createPinIcon('F');

    // Función auxiliar para actualizar posición del pin
    const updatePinPosition = (lat: number, lng: number) => {
      const roundedLat = Number(lat.toFixed(6));
      const roundedLng = Number(lng.toFixed(6));
      setCurrentLat(roundedLat);
      setCurrentLng(roundedLng);
      setHasPosition(true);

      if (geojsonRef.current) {
        const mun = getMunicipioFromGeoJSON(roundedLat, roundedLng, geojsonRef.current);
        setDetectedMunicipio(mun);
      }
    };

    if (hasInitial) {
      const marker = L.marker(startCenter, { draggable: true, icon: pinIcon }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        updatePinPosition(pos.lat, pos.lng);
      });
      markerRef.current = marker;
    }

    // Al hacer clic en el mapa, mover o crear el pin
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { draggable: true, icon: pinIcon }).addTo(map);
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          updatePinPosition(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
      updatePinPosition(lat, lng);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
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
              Haz clic en cualquier punto del mapa o arrastra el pin para fijar las coordenadas exactas.
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
                Haz clic en el mapa para situar el marcador de la empresa.
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
