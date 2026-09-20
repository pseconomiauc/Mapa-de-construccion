import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Empresa, TipoActor, MunicipioCarabobo } from '../../types/database';
import { CATEGORIES_BY_SLUG } from '../../data/cadenaData';
import { createPinIcon, ACTOR_COLORS, ACTOR_LABELS } from '../../utils/geoUtils';

interface IndustrialMapProps {
  empresas: Empresa[];
  companyCategoriesMap: Record<string, string[]>; // empresa_id -> slugs
  selectedMunicipio: MunicipioCarabobo | 'all';
  onSelectMunicipio: (m: MunicipioCarabobo | 'all') => void;
  focusedEmpresa: Empresa | null;
  onSelectEmpresa?: (empresa: Empresa) => void;
}

export const IndustrialMap: React.FC<IndustrialMapProps> = ({
  empresas,
  companyCategoriesMap,
  selectedMunicipio,
  onSelectMunicipio,
  focusedEmpresa,
  onSelectEmpresa
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const geojsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markersByCompanyIdRef = useRef<Map<string, L.Marker>>(new Map());

  // 1. Inicialización única del mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Coordenadas centrales de Carabobo
    const map = L.map(mapContainerRef.current, {
      center: [10.18, -68.00],
      zoom: 10,
      minZoom: 8,
      maxZoom: 18,
      zoomControl: false
    });

    // Control de zoom en la esquina superior izquierda
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Definición de capas base requeridas
    const capaCalles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> colaboradores'
    });

    const capaSatelite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution:
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    );

    const capaTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> colaboradores, <a href="http://viewfinderpanoramas.org" target="_blank" rel="noopener">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA</a>)'
    });

    // Agregar la capa inicial de calles
    capaCalles.addTo(map);

    // Selector de capas
    const baseLayers = {
      'Calles (OpenStreetMap)': capaCalles,
      'Satélite (Esri World)': capaSatelite,
      'Topográfico (OpenTopoMap)': capaTopo
    };

    L.control.layers(baseLayers, undefined, { position: 'topright' }).addTo(map);

    // Grupo de clusters de marcadores
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    // Cargar capa GeoJSON de los 14 municipios de Carabobo
    fetch('/data/carabobo_municipios.geojson')
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar GeoJSON de municipios');
        return res.json();
      })
      .then((geojson) => {
        const geoLayer = L.geoJSON(geojson, {
          style: (feature) => {
            const munName = feature?.properties?.name;
            const isSelected = selectedMunicipio === munName;
            return {
              color: isSelected ? '#1d4ed8' : '#3366cc',
              weight: isSelected ? 2.5 : 1.2,
              fillColor: isSelected ? '#2563eb' : '#3366cc',
              fillOpacity: isSelected ? 0.25 : 0.04,
              dashArray: isSelected ? undefined : '3, 4'
            };
          },
          onEachFeature: (feature, layer) => {
            const munName = feature.properties?.name || 'Municipio';

            // Tooltip con el nombre del municipio
            layer.bindTooltip(`<b>Municipio ${munName}</b>`, {
              sticky: true,
              direction: 'top',
              className: 'wiki-map-tooltip'
            });

            layer.on({
              mouseover: (e) => {
                const target = e.target;
                if (selectedMunicipio !== munName) {
                  target.setStyle({
                    weight: 2,
                    color: '#2563eb',
                    fillColor: '#3366cc',
                    fillOpacity: 0.16,
                    dashArray: ''
                  });
                }
              },
              mouseout: (e) => {
                if (geoLayer) {
                  geoLayer.resetStyle(e.target);
                }
              },
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelectMunicipio(munName as MunicipioCarabobo);
                const bounds = (e.target as L.Polygon).getBounds();
                map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
              }
            });
          }
        }).addTo(map);

        geojsonLayerRef.current = geoLayer;
      })
      .catch((err) => {
        console.warn('No se pudo cargar el GeoJSON de municipios:', err);
      });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      clusterGroupRef.current = null;
      geojsonLayerRef.current = null;
      markersByCompanyIdRef.current.clear();
    };
  }, []);

  // 1.1. ResizeObserver para redimensionar el mapa al mostrar/ocultar el panel o redimensionar ventana
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
    container.addEventListener('transitionend', handleResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      container.removeEventListener('transitionend', handleResize);
    };
  }, []);

  // 2. Actualizar estilos de los polígonos cuando cambia el municipio seleccionado
  useEffect(() => {
    const geoLayer = geojsonLayerRef.current;
    const map = mapInstanceRef.current;
    if (!geoLayer || !map) return;

    geoLayer.eachLayer((layer: any) => {
      const munName = layer.feature?.properties?.name;
      const isSelected = selectedMunicipio === munName;
      layer.setStyle({
        color: isSelected ? '#1d4ed8' : '#3366cc',
        weight: isSelected ? 2.5 : 1.2,
        fillColor: isSelected ? '#2563eb' : '#3366cc',
        fillOpacity: isSelected ? 0.25 : 0.04,
        dashArray: isSelected ? undefined : '3, 4'
      });

      if (isSelected) {
        map.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 13 });
      }
    });

    if (selectedMunicipio === 'all') {
      // Si se deselecciona, reenfocar en Carabobo
      map.setView([10.18, -68.00], 10);
    }
  }, [selectedMunicipio]);

  // 3. Actualizar marcadores de empresas en el mapa
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current;
    if (!clusterGroup) return;

    clusterGroup.clearLayers();
    markersByCompanyIdRef.current.clear();

    empresas.forEach((emp) => {
      if (emp.lat === null || emp.lng === null || emp.lat === undefined || emp.lng === undefined) {
        return;
      }

      // Obtener categorías asociadas
      const slugs = companyCategoriesMap[emp.id] || [];
      const catItems = slugs
        .map((s) => CATEGORIES_BY_SLUG[s])
        .filter(Boolean);

      // Determinar actor predominante
      const allActors: TipoActor[] = catItems.flatMap((c) => c.actores);
      const primaryActor: TipoActor = (allActors[0] as TipoActor) || 'F';

      const icon = createPinIcon(primaryActor);
      const marker = L.marker([emp.lat, emp.lng], { icon });

      // Generar HTML del Popup (estilo Wikipedia sobrio y limpio)
      const actorBadgesHtml = catItems
        .flatMap((c) => c.actores)
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .map(
          (act) => `
            <span style="display:inline-block; font-size:11px; font-weight:700; color:#ffffff; background-color:${ACTOR_COLORS[act]}; padding:1px 5px; border-radius:2px; margin-right:4px;">
              [${act}] ${ACTOR_LABELS[act]}
            </span>
          `
        )
        .join('');

      const categoriesListHtml =
        slugs.length > 0
          ? `
          <div style="margin-top:6px; font-size:12.5px; color:#54595d;">
            <b>Subcategorías:</b>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:3px;">
              ${slugs
                .map((s) => {
                  const it = CATEGORIES_BY_SLUG[s];
                  return `<a href="#/categoria/${s}" style="color:#3366cc; text-decoration:none; background:#f8f9fa; border:1px solid #eaecf0; padding:1px 6px; border-radius:2px; font-size:11.5px;">${
                    it ? it.nombre : s
                  }</a>`;
                })
                .join('')}
            </div>
          </div>
        `
          : '';

      const dirHtml = emp.direccion
        ? `<div style="margin-top:4px; font-size:13px; color:#202122;"><b>Dirección:</b> ${emp.direccion}</div>`
        : '';

      const munHtml = emp.municipio
        ? `<div style="margin-top:2px; font-size:13px; color:#54595d;"><b>Municipio:</b> ${emp.municipio}</div>`
        : '';

      const prodHtml = emp.productos
        ? `<div style="margin-top:4px; font-size:12.5px; color:#54595d;"><b>Productos:</b> ${emp.productos}</div>`
        : '';

      const servHtml = emp.servicios
        ? `<div style="margin-top:4px; font-size:12.5px; color:#54595d;"><b>Servicios:</b> ${emp.servicios}</div>`
        : '';

      const telHtml = emp.telefono
        ? `<div style="margin-top:4px; font-size:12.5px;"><b>Teléfono:</b> <a href="tel:${emp.telefono}" style="color:#3366cc;">${emp.telefono}</a></div>`
        : '';

      const mailHtml = emp.correo
        ? `<div style="margin-top:2px; font-size:12.5px;"><b>Correo:</b> <a href="mailto:${emp.correo}" style="color:#3366cc;">${emp.correo}</a></div>`
        : '';

      const gmapsLink = `https://www.google.com/maps/dir/?api=1&destination=${emp.lat},${emp.lng}`;

      const popupHtml = `
        <div style="font-family:system-ui,-apple-system,sans-serif; max-width:280px; line-height:1.45; padding:2px;">
          <h4 style="font-size:15px; font-weight:700; color:#202122; margin-bottom:4px; border-bottom:1px solid #eaecf0; padding-bottom:4px;">
            ${emp.nombre}
          </h4>
          <div style="margin-bottom:6px;">${actorBadgesHtml}</div>
          ${munHtml}
          ${dirHtml}
          ${prodHtml}
          ${servHtml}
          ${telHtml}
          ${mailHtml}
          ${categoriesListHtml}
          <div style="margin-top:10px; padding-top:6px; border-top:1px solid #eaecf0; text-align:right;">
            <a href="${gmapsLink}" target="_blank" rel="noopener noreferrer" style="font-size:12px; font-weight:600; color:#3366cc; text-decoration:none;">
              Cómo llegar (Google Maps) ↗
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 300, minWidth: 220 });

      marker.on('click', () => {
        if (onSelectEmpresa) {
          onSelectEmpresa(emp);
        }
      });

      clusterGroup.addLayer(marker);
      markersByCompanyIdRef.current.set(emp.id, marker);
    });
  }, [empresas, companyCategoriesMap, onSelectEmpresa]);

  // 4. Enfocar empresa seleccionada desde la barra lateral
  useEffect(() => {
    if (!focusedEmpresa || !focusedEmpresa.lat || !focusedEmpresa.lng) return;
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    const marker = markersByCompanyIdRef.current.get(focusedEmpresa.id);
    if (marker) {
      clusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    } else {
      map.flyTo([focusedEmpresa.lat, focusedEmpresa.lng], 15, { duration: 1 });
    }
  }, [focusedEmpresa]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={mapContainerRef}
        style={{ width: '100%', height: '100%', zIndex: 1 }}
      />
    </div>
  );
};
