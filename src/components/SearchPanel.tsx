import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { BRANCHES, ALL_CATEGORIES } from '../data/cadenaData';
import { LocationPickerModal } from './LocationPickerModal';
import { getErrorMessage } from '../utils/errorUtils';
import { Empresa, MunicipioCarabobo, MUNICIPIOS_CARABOBO } from '../types/database';

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
  const [municipioZona, setMunicipioZona] = useState<MunicipioCarabobo | ''>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SubcategoriaResultGroup[]>([]);

  // Empresa que está pendiente de que el usuario confirme/ajuste su ubicación en el mapa
  const [pendingLocation, setPendingLocation] = useState<{ groupSlug: string; company: FoundCompany } | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (selectedSubcats.size === 0) {
      setFormError('Selecciona al menos una subcategoría a buscar (marca primero las ramas para filtrar la lista).');
      return;
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

    const municipioHint = municipioZona || undefined;

    for (const cat of subcats) {
      try {
        const { data, error } = await supabase.functions.invoke('buscar-empresas', {
          body: { subcategoriaNombre: cat.nombre, subcategoriaSlug: cat.slug, municipioHint }
        });

        if (error) {
          // supabase-js solo da un mensaje genérico ("Edge Function returned a non-2xx status code");
          // el detalle real viene en el cuerpo de la respuesta que guarda en error.context.
          let detail = error.message;
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            try {
              const body = await ctx.clone().json();
              if (body?.error) detail = body.error;
            } catch {
              // el cuerpo no era JSON; nos quedamos con el mensaje genérico
            }
          }
          throw new Error(detail);
        }

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

  // "Agregar" siempre pasa primero por el mapa: la ubicación que sugiere OpenStreetMap
  // puede corresponder solo al municipio/zona (no a la dirección exacta de la empresa),
  // así que el humano confirma o ajusta el pin antes de guardar.
  const handleStartAddCompany = (groupSlug: string, company: FoundCompany) => {
    setPendingLocation({ groupSlug, company });
  };

  const handleConfirmLocationAndSave = async (confirmed: { lat: number; lng: number; municipio?: MunicipioCarabobo }) => {
    if (!pendingLocation) return;
    const { groupSlug, company } = pendingLocation;
    setPendingLocation(null);

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
        municipio: confirmed.municipio || null,
        lat: confirmed.lat,
        lng: confirmed.lng,
        contacto_verificado: false,
        revisar: true,
        nota_revision: 'Encontrada automáticamente por búsqueda (Google + Gemini). Verificar datos de contacto.',
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
        Por cada subcategoría marcada, el sistema busca en Google y extrae empresas reales con Gemini (solo a partir
        de los resultados encontrados, sin inventar). La ubicación que sugiere OpenStreetMap puede ser solo
        aproximada (a veces a nivel de municipio, no de la dirección exacta), así que al agregar una empresa
        <b> siempre confirmas o ajustas el pin en el mapa</b> antes de guardarla.
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
              Se hará 1 búsqueda por cada subcategoría marcada ({selectedSubcats.size} en total): "empresas de &lt;subcategoría&gt; en
              {municipioZona ? ` ${municipioZona},` : ''} Carabobo, Venezuela".
            </div>
          )}
        </fieldset>

        <fieldset style={{ border: '1px solid var(--line-soft)', borderRadius: '3px', padding: '12px 16px', marginBottom: '14px' }}>
          <legend style={{ fontSize: '13px', fontWeight: 600, padding: '0 6px' }}>
            3. Zona de referencia
          </legend>
          <label style={{ display: 'block', fontSize: '13.5px' }}>
            Municipio de Carabobo
            <select
              value={municipioZona}
              onChange={(e) => setMunicipioZona(e.target.value as MunicipioCarabobo | '')}
              style={{ ...selectStyle, display: 'block', width: '100%', maxWidth: '360px', marginTop: '4px' }}
            >
              <option value="">Todo el estado Carabobo</option>
              {MUNICIPIOS_CARABOBO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
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
                      <th style={thStyle}>Sugerencia OSM</th>
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
                            <span style={{ color: '#856404' }}>
                              {emp.lat}, {emp.lng}
                              {emp.municipio && ` (${emp.municipio})`}
                              <br />
                              <em style={{ fontSize: '11px' }}>sin confirmar manualmente</em>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>Sin sugerencia — marca a mano</span>
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
                              onClick={() => handleStartAddCompany(group.slug, emp)}
                              disabled={emp.estado === 'agregando'}
                            >
                              {emp.estado === 'agregando' ? 'Agregando…' : '📍 Confirmar ubicación y agregar'}
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

      {pendingLocation && (
        <LocationPickerModal
          initialLat={pendingLocation.company.lat}
          initialLng={pendingLocation.company.lng}
          initialMunicipio={(pendingLocation.company.municipio as MunicipioCarabobo) || null}
          onConfirm={handleConfirmLocationAndSave}
          onClose={() => setPendingLocation(null)}
        />
      )}
    </div>
  );
};
