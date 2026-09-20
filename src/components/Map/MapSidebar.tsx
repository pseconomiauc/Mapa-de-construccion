import React, { useState, useMemo } from 'react';
import { Empresa, TipoActor, MunicipioCarabobo, MUNICIPIOS_CARABOBO } from '../../types/database';
import { BRANCHES, norm } from '../../data/cadenaData';
import { ACTOR_COLORS, ACTOR_LABELS } from '../../utils/geoUtils';
import { LocationPickerModal } from '../LocationPickerModal';
import { searchAddressNominatim } from '../../services/nominatimService';

interface MapSidebarProps {
  empresas: Empresa[];
  companyCategoriesMap: Record<string, string[]>; // empresa_id -> slugs
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedRamaId: number | 'all';
  onSelectRama: (id: number | 'all') => void;
  selectedActor: TipoActor | 'all';
  onSelectActor: (a: TipoActor | 'all') => void;
  selectedMunicipio: MunicipioCarabobo | 'all';
  onSelectMunicipio: (m: MunicipioCarabobo | 'all') => void;
  onSelectCompanyOnMap: (empresa: Empresa) => void;
  onSaveLocation?: (empresaId: string, lat: number, lng: number, municipio?: MunicipioCarabobo) => void;
  onClose: () => void;
}

export const MapSidebar: React.FC<MapSidebarProps> = ({
  empresas,
  companyCategoriesMap,
  searchQuery,
  onSearchChange,
  selectedRamaId,
  onSelectRama,
  selectedActor,
  onSelectActor,
  selectedMunicipio,
  onSelectMunicipio,
  onSelectCompanyOnMap,
  onSaveLocation,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'ubicadas' | 'sin_ubicacion'>('ubicadas');
  const [locatingEmpresa, setLocatingEmpresa] = useState<Empresa | null>(null);
  const [searchingNominatimId, setSearchingNominatimId] = useState<string | null>(null);
  const [nominatimFeedback, setNominatimFeedback] = useState<{ id: string; text: string; isError: boolean } | null>(null);
  const [initialPickerCoords, setInitialPickerCoords] = useState<{ lat?: number; lng?: number } | null>(null);

  // Separar empresas con y sin coordenadas
  const ubicadas = useMemo(
    () => empresas.filter((e) => e.lat !== null && e.lng !== null && e.lat !== undefined && e.lng !== undefined),
    [empresas]
  );

  // Ordenar empresas sin coordenadas: primero direcciones específicas, luego genéricas
  const sinUbicacion = useMemo(() => {
    const unlocated = empresas.filter((e) => !e.lat || !e.lng);
    return unlocated.sort((a, b) => {
      const aPrecisa = a.direccion_precisa !== false && !!a.direccion && !a.direccion.toLowerCase().startsWith('municipio ');
      const bPrecisa = b.direccion_precisa !== false && !!b.direccion && !b.direccion.toLowerCase().startsWith('municipio ');
      if (aPrecisa && !bPrecisa) return -1;
      if (!aPrecisa && bPrecisa) return 1;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [empresas]);

  // Filtrado de las ubicadas
  const nq = norm(searchQuery.trim());
  const ubicadasFiltradas = ubicadas.filter((emp) => {
    // 1. Búsqueda por texto
    if (nq) {
      const matchName = norm(emp.nombre).includes(nq);
      const matchProd = norm(emp.productos || '').includes(nq);
      const matchServ = norm(emp.servicios || '').includes(nq);
      const matchDir = norm(emp.direccion || '').includes(nq);
      if (!matchName && !matchProd && !matchServ && !matchDir) return false;
    }

    // 2. Filtro de Municipio
    if (selectedMunicipio !== 'all' && emp.municipio !== selectedMunicipio) {
      return false;
    }

    // 3. Filtro de Rama
    if (selectedRamaId !== 'all') {
      const slugs = companyCategoriesMap[emp.id] || [];
      const branch = BRANCHES.find((b) => b.id === selectedRamaId);
      const branchSlugs = new Set(
        branch?.groups.flatMap((g) => g.items.map((it) => it.slug)) || []
      );
      const inBranch = slugs.some((s) => branchSlugs.has(s));
      if (!inBranch) return false;
    }

    // 4. Filtro de Actor
    if (selectedActor !== 'all') {
      const slugs = companyCategoriesMap[emp.id] || [];
      const branchAllItems = BRANCHES.flatMap((b) => b.groups.flatMap((g) => g.items));
      const hasActor = slugs.some((slug) => {
        const item = branchAllItems.find((it) => it.slug === slug);
        return item?.actores.includes(selectedActor);
      });
      if (!hasActor) return false;
    }

    return true;
  });

  // Conteo por tipo de actor en empresas ubicadas
  const actorCounts = useMemo(() => {
    const counts: Record<TipoActor, number> = { F: 0, D: 0, C: 0, S: 0, A: 0 };
    const branchAllItems = BRANCHES.flatMap((b) => b.groups.flatMap((g) => g.items));

    ubicadas.forEach((emp) => {
      const slugs = companyCategoriesMap[emp.id] || [];
      const seenActors = new Set<TipoActor>();
      slugs.forEach((s) => {
        const item = branchAllItems.find((it) => it.slug === s);
        item?.actores.forEach((a) => seenActors.add(a));
      });
      seenActors.forEach((a) => {
        counts[a] = (counts[a] || 0) + 1;
      });
    });

    return counts;
  }, [ubicadas, companyCategoriesMap]);

  // Manejar apertura de modal para ubicar
  const handleStartLocate = (emp: Empresa, startCoords?: { lat: number; lng: number }) => {
    setLocatingEmpresa(emp);
    setInitialPickerCoords(startCoords || null);
  };

  // Manejar búsqueda asistida con Nominatim (máx 1 consulta / segundo)
  const handleSearchNominatim = async (emp: Empresa) => {
    if (!emp.direccion) return;
    setSearchingNominatimId(emp.id);
    setNominatimFeedback({ id: emp.id, text: 'Buscando en OpenStreetMap (máx 1 req/seg)…', isError: false });

    try {
      const results = await searchAddressNominatim(emp.direccion);
      if (results.length > 0) {
        const best = results[0];
        setNominatimFeedback({
          id: emp.id,
          text: `Coordenadas aproximadas encontradas (${best.lat}, ${best.lng}). Abre el mapa para confirmar.`,
          isError: false
        });
        handleStartLocate(emp, { lat: best.lat, lng: best.lng });
      } else {
        setNominatimFeedback({
          id: emp.id,
          text: 'No se encontraron coordenadas automáticas. Usa "Marcar en el mapa" para situar el pin.',
          isError: true
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setNominatimFeedback({
        id: emp.id,
        text: `Error al consultar Nominatim: ${msg}`,
        isError: true
      });
    } finally {
      setSearchingNominatimId(null);
    }
  };

  const handleConfirmLocation = (result: { lat: number; lng: number; municipio?: MunicipioCarabobo }) => {
    if (!locatingEmpresa || !onSaveLocation) return;
    onSaveLocation(locatingEmpresa.id, result.lat, result.lng, result.municipio);
    setLocatingEmpresa(null);
    setInitialPickerCoords(null);
  };

  return (
    <>
      {/* Modal interactivo de georreferenciación */}
      {locatingEmpresa && (
        <LocationPickerModal
          initialLat={initialPickerCoords?.lat ?? locatingEmpresa.lat ?? 10.18}
          initialLng={initialPickerCoords?.lng ?? locatingEmpresa.lng ?? -68.0}
          initialMunicipio={locatingEmpresa.municipio}
          onConfirm={handleConfirmLocation}
          onClose={() => {
            setLocatingEmpresa(null);
            setInitialPickerCoords(null);
          }}
        />
      )}

      <aside className="map-sidebar">
        <div className="map-sidebar-header">
          <h3 style={{ margin: 0, fontSize: '17px', fontFamily: 'Georgia, serif' }}>
            Directorio Industrial
          </h3>
          <button type="button" className="btn" onClick={onClose} style={{ fontSize: '13px' }}>
            ✕ Ocultar
          </button>
        </div>

        {/* Herramientas de filtrado */}
        <div className="map-sidebar-tools">
          <input
            type="search"
            placeholder="Buscar empresa, producto, servicio…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="map-search-input"
          />

          <div className="map-filters-row">
            <select
              value={selectedMunicipio}
              onChange={(e) => onSelectMunicipio(e.target.value as MunicipioCarabobo | 'all')}
              className="map-select"
            >
              <option value="all">Todos los municipios ({MUNICIPIOS_CARABOBO.length})</option>
              {MUNICIPIOS_CARABOBO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={selectedRamaId}
              onChange={(e) => onSelectRama(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="map-select"
            >
              <option value="all">Todas las ramas ({BRANCHES.length})</option>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}. {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Chips de tipo de actor */}
          <div className="map-actor-chips">
            <button
              type="button"
              className={`map-chip ${selectedActor === 'all' ? 'active' : ''}`}
              onClick={() => onSelectActor('all')}
            >
              Todos
            </button>
            {(['F', 'D', 'C', 'S', 'A'] as TipoActor[]).map((a) => (
              <button
                key={a}
                type="button"
                className={`map-chip ${selectedActor === a ? 'active' : ''}`}
                onClick={() => onSelectActor(selectedActor === a ? 'all' : a)}
                style={{
                  borderColor: selectedActor === a ? ACTOR_COLORS[a] : undefined,
                  background: selectedActor === a ? ACTOR_COLORS[a] : undefined,
                  color: selectedActor === a ? '#ffffff' : undefined
                }}
                title={ACTOR_LABELS[a]}
              >
                <span className="dot" style={{ background: selectedActor === a ? '#fff' : ACTOR_COLORS[a] }} />
                {a} ({actorCounts[a] || 0})
              </button>
            ))}
          </div>
        </div>

        {/* Selector de pestañas: Ubicadas vs Sin ubicación */}
        <div className="map-tabs">
          <button
            type="button"
            className={`map-tab ${activeTab === 'ubicadas' ? 'active' : ''}`}
            onClick={() => setActiveTab('ubicadas')}
          >
            En el mapa ({ubicadasFiltradas.length})
          </button>
          <button
            type="button"
            className={`map-tab ${activeTab === 'sin_ubicacion' ? 'active' : ''}`}
            onClick={() => setActiveTab('sin_ubicacion')}
          >
            Por ubicar ({sinUbicacion.length})
          </button>
        </div>

        {/* Listado de empresas */}
        <div className="map-company-list">
          {activeTab === 'ubicadas' ? (
            ubicadasFiltradas.length === 0 ? (
              <div className="empty" style={{ padding: '20px', textAlign: 'center' }}>
                No hay empresas ubicadas en el mapa que coincidan con los filtros aplicados.
              </div>
            ) : (
              ubicadasFiltradas.map((emp) => (
                <div
                  key={emp.id}
                  className="map-company-item"
                  onClick={() => onSelectCompanyOnMap(emp)}
                  title="Hacer clic para centrar en el mapa"
                >
                  <div className="map-company-name">{emp.nombre}</div>
                  <div className="map-company-meta">
                    {emp.municipio && <span>📍 {emp.municipio}</span>}
                    {emp.telefono && <span>📞 {emp.telefono}</span>}
                  </div>
                  {emp.productos && (
                    <div className="map-company-desc">{emp.productos}</div>
                  )}
                </div>
              ))
            )
          ) : (
            sinUbicacion.length === 0 ? (
              <div className="empty" style={{ padding: '20px', textAlign: 'center' }}>
                ¡Excelente! Todas las empresas registradas tienen ubicación en el mapa.
              </div>
            ) : (
              <>
                <div style={{ padding: '8px 12px', background: '#f8f9fa', borderBottom: '1px solid var(--line-soft)', fontSize: '11.5px', color: 'var(--muted)' }}>
                  Ordenadas por direcciones específicas primero. La precisión de geocodificación en Venezuela es limitada; confirme siempre el pin antes de guardar.
                </div>
                {sinUbicacion.map((emp) => {
                  const esGenerica = emp.direccion_precisa === false || !emp.direccion || emp.direccion.toLowerCase().startsWith('municipio ');
                  const feedback = nominatimFeedback?.id === emp.id ? nominatimFeedback : null;
                  const isSearching = searchingNominatimId === emp.id;

                  return (
                    <div key={emp.id} className="map-company-item unlocated" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div className="map-company-name" style={{ fontSize: '13.5px' }}>{emp.nombre}</div>
                        {esGenerica ? (
                          <span className="badge-unverified" style={{ background: '#fff3cd', color: '#856404', borderColor: '#ffeeba' }}>
                            dir. genérica
                          </span>
                        ) : (
                          <span className="badge-unverified" style={{ background: '#e8f5e9', color: '#2e7d32', borderColor: '#c8e6c9' }}>
                            dir. específica
                          </span>
                        )}
                      </div>

                      <div className="map-company-meta" style={{ marginTop: '2px' }}>
                        {emp.municipio && <span>📍 {emp.municipio}</span>}
                        {emp.direccion && <span>🏢 {emp.direccion}</span>}
                      </div>

                      {feedback && (
                        <div style={{ fontSize: '11px', color: feedback.isError ? 'var(--danger)' : 'var(--success)', margin: '2px 0' }}>
                          {feedback.text}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: '11.5px', padding: '3px 8px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '2px' }}
                          onClick={() => handleStartLocate(emp)}
                        >
                          📌 Marcar en el mapa
                        </button>

                        {emp.direccion && !esGenerica && (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: '11.5px', padding: '3px 8px' }}
                            onClick={() => handleSearchNominatim(emp)}
                            disabled={isSearching}
                          >
                            {isSearching ? 'Buscando…' : '🔍 Buscar dirección'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )
          )}
        </div>
      </aside>
    </>
  );
};
