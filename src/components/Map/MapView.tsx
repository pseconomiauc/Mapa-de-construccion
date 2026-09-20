import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isConfigured } from '../../lib/supabase';
import { Empresa, TipoActor, MunicipioCarabobo } from '../../types/database';
import { BRANCHES, norm } from '../../data/cadenaData';
import { getMunicipioFromGeoJSON } from '../../utils/geoUtils';
import { IndustrialMap } from './IndustrialMap';
import { MapSidebar } from './MapSidebar';

interface MapViewProps {
  onNavigateHome: () => void;
}

export const MapView: React.FC<MapViewProps> = ({ onNavigateHome }) => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [companyCategoriesMap, setCompanyCategoriesMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // Estados de filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRamaId, setSelectedRamaId] = useState<number | 'all'>('all');
  const [selectedActor, setSelectedActor] = useState<TipoActor | 'all'>('all');
  const [selectedMunicipio, setSelectedMunicipio] = useState<MunicipioCarabobo | 'all'>('all');
  const [focusedEmpresa, setFocusedEmpresa] = useState<Empresa | null>(null);

  // Visibilidad del panel lateral
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // GeoJSON cargado para cálculo de municipio automático
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);

  // Cargar GeoJSON de municipios
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/carabobo_municipios.geojson`)
      .then((res) => res.json())
      .then((data) => setGeojsonData(data))
      .catch((err) => console.warn('No se pudo cargar GeoJSON para cálculo de municipio:', err));
  }, []);

  // Cargar empresas y relaciones desde Supabase (o fallback seed)
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      if (!isConfigured) {
        const seed = await import('../../data/seedEmpresas.json');
        const realEmpresas = (seed.empresas || []).filter((e: { tipo_registro?: string }) => e.tipo_registro !== 'referencia_generica');
        const catMap: Record<string, string[]> = {};
        (seed.asociaciones || []).forEach((aso: { empresaKey: string; categoriaSlug: string }) => {
          const emp = realEmpresas.find((e: { nombre: string }) => e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === aso.empresaKey);
          if (emp) {
            if (!catMap[emp.id]) catMap[emp.id] = [];
            catMap[emp.id].push(aso.categoriaSlug);
          }
        });
        setEmpresas(realEmpresas as unknown as Empresa[]);
        setCompanyCategoriesMap(catMap);
        setLoading(false);
        return;
      }

      const [empRes, relRes] = await Promise.all([
        supabase.from('empresas').select('*').neq('tipo_registro', 'referencia_generica').order('nombre', { ascending: true }),
        supabase.from('empresa_categorias').select('empresa_id, categoria_slug')
      ]);

      if (empRes.error) throw empRes.error;
      if (relRes.error) throw relRes.error;

      const rawEmpresas: Empresa[] = empRes.data || [];
      const rels = relRes.data || [];

      // Mapear categorías por empresa
      const catMap: Record<string, string[]> = {};
      rels.forEach((r: { empresa_id: string; categoria_slug: string }) => {
        if (!catMap[r.empresa_id]) {
          catMap[r.empresa_id] = [];
        }
        catMap[r.empresa_id].push(r.categoria_slug);
      });

      // Cálculo de municipio automático si tiene coordenadas pero no municipio
      const processedEmpresas = rawEmpresas.map((emp) => {
        if (!emp.municipio && emp.lat && emp.lng && geojsonData) {
          const autoMun = getMunicipioFromGeoJSON(emp.lat, emp.lng, geojsonData);
          if (autoMun) {
            return { ...emp, municipio: autoMun };
          }
        }
        return emp;
      });

      setEmpresas(processedEmpresas);
      setCompanyCategoriesMap(catMap);
    } catch (err) {
      console.error('Error al cargar datos del mapa:', err);
    } finally {
      setLoading(false);
    }
  }, [geojsonData]);

  useEffect(() => {
    fetchData();

    // Suscripción Realtime a empresas y empresa_categorias
    const channel = supabase
      .channel('map-view-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresas' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresa_categorias' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Filtrado de empresas para el mapa y conteos
  const filteredEmpresas = useMemo(() => {
    const nq = norm(searchQuery.trim());
    const branchAllItems = BRANCHES.flatMap((b) => b.groups.flatMap((g) => g.items));

    return empresas.filter((emp) => {
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
        const hasActor = slugs.some((slug) => {
          const item = branchAllItems.find((it) => it.slug === slug);
          return item?.actores.includes(selectedActor);
        });
        if (!hasActor) return false;
      }

      return true;
    });
  }, [empresas, companyCategoriesMap, searchQuery, selectedMunicipio, selectedRamaId, selectedActor]);

  const ubicadasTotal = useMemo(
    () => empresas.filter((e) => e.lat !== null && e.lng !== null && e.lat !== undefined && e.lng !== undefined).length,
    [empresas]
  );
  const sinUbicacionTotal = empresas.length - ubicadasTotal;

  const handleSelectCompanyFromSidebar = (empresa: Empresa) => {
    setFocusedEmpresa(empresa);
  };

  const handleSaveLocation = async (empresaId: string, lat: number, lng: number, calculatedMunicipio?: MunicipioCarabobo) => {
    // 1. Actualizar estado local inmediatamente
    setEmpresas((prev) =>
      prev.map((e) => {
        if (e.id === empresaId) {
          return {
            ...e,
            lat,
            lng,
            municipio: calculatedMunicipio || e.municipio,
            direccion_precisa: true
          };
        }
        return e;
      })
    );

    // Centrar en el mapa
    const updated = empresas.find((e) => e.id === empresaId);
    if (updated) {
      setFocusedEmpresa({
        ...updated,
        lat,
        lng,
        municipio: calculatedMunicipio || updated.municipio
      });
    }

    // 2. Persistir en Supabase si está configurado
    if (isConfigured) {
      try {
        const updateData: Record<string, unknown> = { lat, lng };
        if (calculatedMunicipio) updateData.municipio = calculatedMunicipio;
        updateData.direccion_precisa = true;

        await supabase.from('empresas').update(updateData).eq('id', empresaId);
      } catch (err) {
        console.error('Error al guardar ubicación en Supabase:', err);
      }
    }
  };

  return (
    <div className="map-view-container">
      {/* Barra superior de navegación del Mapa */}
      <header className="map-header">
        <div className="map-header-left">
          <button
            type="button"
            className="btn map-back-btn"
            onClick={onNavigateHome}
          >
            ← Volver a la Cadena
          </button>
          <h2 className="map-title">Mapa industrial de la construcción en Carabobo</h2>
        </div>

        <div className="map-header-right">
          <span className="map-stats-badge">
            {loading ? (
              'Cargando empresas…'
            ) : (
              <>
                <b>{ubicadasTotal}</b> en mapa · <b>{sinUbicacionTotal}</b> sin ubicación
              </>
            )}
          </span>
          <button
            type="button"
            className="btn map-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          >
            {isSidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}
          </button>
        </div>
      </header>

      {/* Contenedor principal: Mapa + Panel Lateral */}
      <div className="map-main-layout">
        <div className="map-canvas-wrapper">
          <IndustrialMap
            empresas={filteredEmpresas}
            companyCategoriesMap={companyCategoriesMap}
            selectedMunicipio={selectedMunicipio}
            onSelectMunicipio={setSelectedMunicipio}
            focusedEmpresa={focusedEmpresa}
            onSelectEmpresa={(emp) => setFocusedEmpresa(emp)}
          />
        </div>

        {isSidebarOpen && (
          <aside className="map-sidebar-wrapper">
            <MapSidebar
              empresas={empresas}
              companyCategoriesMap={companyCategoriesMap}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedRamaId={selectedRamaId}
              onSelectRama={setSelectedRamaId}
              selectedActor={selectedActor}
              onSelectActor={setSelectedActor}
              selectedMunicipio={selectedMunicipio}
              onSelectMunicipio={setSelectedMunicipio}
              onSelectCompanyOnMap={handleSelectCompanyFromSidebar}
              onSaveLocation={handleSaveLocation}
              onClose={() => setIsSidebarOpen(false)}
            />
          </aside>
        )}
      </div>
    </div>
  );
};
