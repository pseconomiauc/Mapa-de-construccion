import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BRANCHES, ALL_CATEGORIES } from '../data/cadenaData';
import { searchAddressNominatim } from '../services/nominatimService';
import { isValidVenezuelaCoords } from '../utils/geoUtils';
import { getErrorMessage } from '../utils/errorUtils';
import { Empresa } from '../types/database';

// Pasos de radio de búsqueda disponibles (km). "Ampliar rango" avanza al siguiente.
const RADIUS_STEPS_KM = [2, 5, 10, 20, 50, 100];

interface FoundCompany {
  nombre: string;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  municipio: string | null;
  ubicacionConfirmada: boolean;
  fuente: string | null;
}

interface SubcategoriaResultGroup {
  slug: string;
  nombre: string;
  loading: boolean;
  error: string | null;
  aviso: string | null;
  empresas: (FoundCompany & { estado: 'pendiente' | 'agregando' | 'agregada' | 'error' })[];
}

interface SearchPanelProps {
  onCountsChanged: () => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onCountsChanged }) => {
  const [selectedRamas, setSelectedRamas] = useState<Set<number>>(new Set());
  const [selectedSubcats, setSelectedSubcats] = useState<Set<string>>(new Set());
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radiusIndex, setRadiusIndex] = useState(2); // por defecto 10 km
  const [geocoding, setGeocoding] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SubcategoriaResultGroup[]>([]);

  const subcategoriasDisponibles = useMemo(() => {
    if (selectedRamas.size === 0) return ALL_CATEGORIES;
    return ALL_CATEGORIES.filter((c) => selectedRamas.has(c.rama_id));
  }, [selectedRamas]);

  const toggleRama = (id: number) => {
    setSelectedRamas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubcat = (slug: string) => {
    setSelectedSubcats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleGeocode = async () => {
    const query = direccion.trim();
    if (!query) {
      setLocationFeedback({ text: 'Escribe una dirección o zona de referencia antes de buscar.', isError: true });
      return;
    }
    setGeocoding(true);
    setLocationFeedback({ text: 'Consultando OpenStreetMap (Nominatim)…', isError: false });
    try {
      const found = await searchAddressNominatim(query);
      if (found.length > 0) {
        const best = found[0];
        setLat(String(best.lat));
        setLng(String(best.lng));
        setLocationFeedback({
          text: `Ubicación de referencia fijada: "${best.displayName.substring(0, 70)}…"`,
          isError: false
        });
      } else {
        setLocationFeedback({ text: 'No se encontraron coordenadas para esa dirección.', isError: true });
      }
    } catch (err) {
      setLocationFeedback({ text: `Error al consultar Nominatim: ${getErrorMessage(err)}`, isError: true });
    } finally {
      setGeocoding(false);
    }
  };

  const handleExpandRadius = () => {
    setRadiusIndex((idx) => Math.min(idx + 1, RADIUS_STEPS_KM.length - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedSubcats.size === 0) {
      setFormError('Selecciona al menos una subcategoría a buscar (marca primero las ramas para filtrar la lista).');
      return;
    }

    if (lat.trim() || lng.trim()) {
      const latNum = parseFloat(lat.trim().replace(',', '.'));
      const lngNum = parseFloat(lng.trim().replace(',', '.'));
      if (isNaN(latNum) || isNaN(lngNum) || !isValidVenezuelaCoords(latNum, lngNum)) {
        setFormError('Las coordenadas de referencia no son válidas. Bórralas o corrígelas antes de buscar.');
        return;
      }
    }

    const subcats = ALL_CATEGORIES.filter((c) => selectedSubcats.has(c.slug));
    const initialGroups: SubcategoriaResultGroup[] = subcats.map((c) => ({
      slug: c.slug,
      nombre: c.nombre,
      loading: true,
      error: null,
      aviso: null,
      empresas: []
    }));
    setResults(initialGroups);
    setSearching(true);

    const municipioHint = direccion.trim() || undefined;

    for (const cat of subcats) {
      try {
        const { data, error } = await supabase.functions.invoke('buscar-empresas', {
          body: { subcategoriaNombre: cat.nombre, subcategoriaSlug: cat.slug, municipioHint }
        });

        if (error) throw error;

        setResults((prev) =>
          prev.map((g) =>
            g.slug === cat.slug
              ? {
                  ...g,
                  loading: false,
                  aviso: data?.aviso || null,
                  empresas: (data?.empresas || []).map((emp: FoundCompany) => ({ ...emp, estado: 'pendiente' as const }))
                }
              : g
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((g) => (g.slug === cat.slug ? { ...g, loading: false, error: getErrorMessage(err) } : g))
        );
      }
    }

    setSearching(false);
  };

  const handleAddCompany = async (groupSlug: string, company: FoundCompany) => {
    setResults((prev) =>
      prev.map((g) =>
        g.slug === groupSlug
          ? { ...g, empresas: g.empresas.map((e) => (e.nombre === company.nombre ? { ...e, estado: 'agregando' } : e)) }
          : g
      )
    );

    try {
      const payload: Partial<Empresa> & { nombre: string } = {
        nombre: company.nombre,
        direccion: company.direccion,
        municipio: (company.municipio as Empresa['municipio']) || null,
        lat: company.lat,
        lng: company.lng,
        contacto_verificado: false,
        revisar: true,
        nota_revision: 'Encontrada automáticamente por búsqueda (Google + Gemini + OpenStreetMap). Verificar datos de contacto y ubicación exacta.',
        fuente: company.fuente
      };

      const { data: inserted, error: insErr } = await supabase.from('empresas').insert([payload]).select('id').single();
      if (insErr) throw insErr;

      const { error: relErr } = await supabase
        .from('empresa_categorias')
        .insert([{ empresa_id: inserted.id, categoria_slug: groupSlug }]);
      if (relErr) throw relErr;

      setResults((prev) =>
        prev.map((g) =>
          g.slug === groupSlug
            ? { ...g, empresas: g.empresas.map((e) => (e.nombre === company.nombre ? { ...e, estado: 'agregada' } : e)) }
            : g
        )
      );
      onCountsChanged();
    } catch (err) {
      setResults((prev) =>
        prev.map((g) =>
          g.slug === groupSlug
            ? { ...g, empresas: g.empresas.map((e) => (e.nombre === company.nombre ? { ...e, estado: 'error' } : e)) }
            : g
        )
      );
      alert(`No se pudo agregar "${company.nombre}": ${getErrorMessage(err)}`);
    }
  };

  const selectStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '6px 8px',
    border: '1px solid var(--line)',
    borderRadius: '2px'
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '6px 8px',
    fontSize: '12px',
    color: 'var(--muted)',
    borderBottom: '2px solid var(--line)'
  };
  const tdStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontSize: '13px',
    borderBottom: '1px solid var(--line-soft)',
    verticalAlign: 'top'
  };

  return (
    <div id="vSearch" style={{ maxWidth: '900px' }}>
      <h2 className="ct" style={{ marginBottom: '4px' }}>
        Panel de gestión de búsqueda
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: 0, marginBottom: '16px' }}>
        Por cada subcategoría marcada, el sistema busca en Google, extrae empresas reales con Gemini (solo a partir de
        los resultados encontrados, sin inventar) y confirma la ubicación con OpenStreetMap. Todo resultado se agrega
        marcado como <b>"por revisar"</b> hasta que confirmes sus datos manualmente.
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset style={{ border: '1px solid var(--line-soft)', borderRadius: '3px', padding: '12px 16px', marginBottom: '14px' }}>
          <legend style={{ fontSize: '13px', fontWeight: 600, padding: '0 6px' }}>
            1. Filtrar por rama <em style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional, para acortar la lista de abajo)</em>
          </legend>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '4px 12px'
            }}
          >
            {BRANCHES.map((b) => (
              <label key={b.id} className="tick" style={{ fontSize: '13px' }}>
                <input type="checkbox" checked={selectedRamas.has(b.id)} onChange={() => toggleRama(b.id)} />
                <span>
                  {b.id}. {b.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: '1px solid var(--line-soft)', borderRadius: '3px', padding: '12px 16px', marginBottom: '14px' }}>
          <legend style={{ fontSize: '13px', fontWeight: 600, padding: '0 6px' }}>
            2. Subcategorías a buscar <em style={{ fontWeight: 400, color: 'var(--muted)' }}>(obligatorio, puedes marcar varias)</em>
          </legend>
          <div
            style={{
              maxHeight: '220px',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '3px 12px'
            }}
          >
            {subcategoriasDisponibles.map((c) => (
              <label key={c.slug} className="tick" style={{ fontSize: '12.5px' }}>
                <input type="checkbox" checked={selectedSubcats.has(c.slug)} onChange={() => toggleSubcat(c.slug)} />
                <span>{c.nombre}</span>
              </label>
            ))}
          </div>
          {selectedSubcats.size > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>
              Se hará 1 búsqueda por cada subcategoría marcada ({selectedSubcats.size} en total): "empresas de &lt;subcategoría&gt; en Carabobo, Venezuela".
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: '1px solid var(--line-soft)', borderRadius: '3px', padding: '12px 16px', marginBottom: '14px' }}>
          <legend style={{ fontSize: '13px', fontWeight: 600, padding: '0 6px' }}>
            3. Zona de referencia <em style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional, ayuda a acotar la búsqueda)</em>
          </legend>

          <label style={{ display: 'block', fontSize: '13.5px', marginBottom: '8px' }}>
            Dirección, municipio o zona
            <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
              <input
                type="text"
                placeholder="Ej: Zona Industrial San Diego, Valencia"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                style={{ flex: 1, padding: '6px', border: '1px solid var(--line)' }}
              />
              <button type="button" className="btn" onClick={handleGeocode} disabled={geocoding || !direccion.trim()}>
                {geocoding ? 'Buscando…' : '🔍 Buscar coordenadas'}
              </button>
            </div>
          </label>

          {locationFeedback && (
            <div
              style={{
                fontSize: '12.5px',
                padding: '6px 10px',
                borderRadius: '2px',
                marginBottom: '10px',
                background: locationFeedback.isError ? '#fdf2f2' : '#f0fdf4',
                border: `1px solid ${locationFeedback.isError ? '#f8b4b4' : '#bbf7d0'}`,
                color: locationFeedback.isError ? '#b32424' : '#166534'
              }}
            >
              {locationFeedback.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <label style={{ fontSize: '13px', flex: '1 1 160px' }}>
              Latitud (opcional)
              <input
                type="text"
                placeholder="Ej: 10.1620"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{ width: '100%', marginTop: '3px', padding: '6px', border: '1px solid var(--line)', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ fontSize: '13px', flex: '1 1 160px' }}>
              Longitud (opcional)
              <input
                type="text"
                placeholder="Ej: -68.0077"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{ width: '100%', marginTop: '3px', padding: '6px', border: '1px solid var(--line)', boxSizing: 'border-box' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Radio de búsqueda:
              <select value={radiusIndex} onChange={(e) => setRadiusIndex(Number(e.target.value))} style={selectStyle}>
                {RADIUS_STEPS_KM.map((km, idx) => (
                  <option key={km} value={idx}>
                    {km} km
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={handleExpandRadius}
              disabled={radiusIndex >= RADIUS_STEPS_KM.length - 1}
              title="Ampliar el radio de búsqueda al siguiente nivel"
            >
              + Ampliar rango
            </button>
            <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
              (el radio se usará para acotar resultados una vez tengamos varios centros de búsqueda; por ahora prioriza la zona escrita arriba)
            </span>
          </div>
        </fieldset>

        {formError && <div style={{ fontSize: '13px', color: 'var(--danger, #b32424)', marginBottom: '12px' }}>{formError}</div>}

        <button type="submit" className="primary" disabled={searching}>
          {searching ? 'Buscando…' : 'Buscar empresas'}
        </button>
      </form>

      {results.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          {results.map((group) => (
            <div key={group.slug} style={{ marginBottom: '20px' }}>
              <h3 className="lh" style={{ marginBottom: '6px' }}>
                {group.nombre}{' '}
                {group.loading && <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400 }}>buscando…</span>}
              </h3>

              {group.error && (
                <p className="warn">
                  No se pudo buscar esta subcategoría: {group.error}
                  {/* Errores típicos cuando la función Edge aún no existe o falta configurar sus secretos */}
                  {/edge function|fetch|404|not found/i.test(group.error) ? (
                    <>
                      {' '}
                      — probablemente la función "buscar-empresas" todavía no está desplegada en Supabase, o faltan
                      sus credenciales (GOOGLE_CSE_KEY, GOOGLE_CSE_CX, GEMINI_API_KEY).
                    </>
                  ) : null}
                </p>
              )}

              {group.aviso && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>{group.aviso}</p>}

              {!group.loading && !group.error && group.empresas.length === 0 && !group.aviso && (
                <p className="empty">No se encontraron empresas para esta subcategoría.</p>
              )}

              {group.empresas.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Nombre</th>
                      <th style={thStyle}>Dirección</th>
                      <th style={thStyle}>Ubicación</th>
                      <th style={thStyle}>Fuente</th>
                      <th style={thStyle}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.empresas.map((emp) => (
                      <tr key={emp.nombre}>
                        <td style={tdStyle}>
                          <b>{emp.nombre}</b>
                        </td>
                        <td style={tdStyle}>{emp.direccion || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                        <td style={tdStyle}>
                          {emp.ubicacionConfirmada ? (
                            <span style={{ color: '#166534' }}>
                              ✓ {emp.lat}, {emp.lng}
                              {emp.municipio && ` (${emp.municipio})`}
                            </span>
                          ) : (
                            <span style={{ color: '#856404' }}>Sin confirmar en OSM</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {emp.fuente ? (
                            <a href={emp.fuente} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
                              ver fuente
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={tdStyle}>
                          {emp.estado === 'agregada' ? (
                            <span style={{ color: '#166534', fontSize: '12.5px' }}>✓ Agregada</span>
                          ) : emp.estado === 'error' ? (
                            <span style={{ color: 'var(--danger, #b32424)', fontSize: '12.5px' }}>Error</span>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleAddCompany(group.slug, emp)}
                              disabled={emp.estado === 'agregando'}
                            >
                              {emp.estado === 'agregando' ? 'Agregando…' : 'Agregar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
