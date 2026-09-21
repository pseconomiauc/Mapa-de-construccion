import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Empresa, MunicipioCarabobo, MUNICIPIOS_CARABOBO } from '../types/database';
import { BRANCHES, ALL_CATEGORIES, CATEGORIES_BY_SLUG, norm } from '../data/cadenaData';
import { CompanyForm } from './CompanyForm';
import { getErrorMessage } from '../utils/errorUtils';

interface AdminPanelProps {
  onNavigateHome: () => void;
  onCountsChanged: () => void;
}

type RevisionFilter = 'all' | 'solo_revisar' | 'sin_revisar';
type TipoFilter = 'all' | 'empresa' | 'referencia_generica';

export const AdminPanel: React.FC<AdminPanelProps> = ({ onNavigateHome, onCountsChanged }) => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [relMap, setRelMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRamaId, setFilterRamaId] = useState<number | 'all'>('all');
  const [filterCategoriaSlug, setFilterCategoriaSlug] = useState<string | 'all'>('all');
  const [filterMunicipio, setFilterMunicipio] = useState<MunicipioCarabobo | 'all'>('all');
  const [filterRevision, setFilterRevision] = useState<RevisionFilter>('all');
  const [filterTipo, setFilterTipo] = useState<TipoFilter>('all');

  // Modal de alta / edición
  const [showForm, setShowForm] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [editingCategories, setEditingCategories] = useState<string[]>([]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [{ data: empData, error: empErr }, { data: relData, error: relErr }] = await Promise.all([
        supabase.from('empresas').select('*').order('nombre', { ascending: true }),
        supabase.from('empresa_categorias').select('empresa_id, categoria_slug')
      ]);

      if (empErr) throw empErr;
      if (relErr) throw relErr;

      setEmpresas(empData || []);

      const map: Record<string, string[]> = {};
      (relData || []).forEach((r: { empresa_id: string; categoria_slug: string }) => {
        if (!map[r.empresa_id]) map[r.empresa_id] = [];
        map[r.empresa_id].push(r.categoria_slug);
      });
      setRelMap(map);
    } catch (err) {
      setErrorMessage(`No se pudo cargar el directorio: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-panel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empresas' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empresa_categorias' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Grupos disponibles para el filtro de subcategoría, dependientes de la rama elegida
  const categoriasParaFiltro = useMemo(() => {
    if (filterRamaId === 'all') return ALL_CATEGORIES;
    return ALL_CATEGORIES.filter((c) => c.rama_id === filterRamaId);
  }, [filterRamaId]);

  const filteredEmpresas = useMemo(() => {
    const nq = norm(searchQuery.trim());

    return empresas.filter((emp) => {
      if (nq && !norm(emp.nombre || '').includes(nq)) return false;

      if (filterMunicipio !== 'all' && emp.municipio !== filterMunicipio) return false;

      if (filterRevision === 'solo_revisar' && !emp.revisar) return false;
      if (filterRevision === 'sin_revisar' && emp.revisar) return false;

      if (filterTipo !== 'all' && (emp.tipo_registro || 'empresa') !== filterTipo) return false;

      const slugs = relMap[emp.id] || [];
      if (filterCategoriaSlug !== 'all' && !slugs.includes(filterCategoriaSlug)) return false;
      if (filterRamaId !== 'all') {
        const belongsToRama = slugs.some((s) => CATEGORIES_BY_SLUG[s]?.rama_id === filterRamaId);
        if (!belongsToRama) return false;
      }

      return true;
    });
  }, [empresas, relMap, searchQuery, filterMunicipio, filterRevision, filterTipo, filterCategoriaSlug, filterRamaId]);

  const openNewForm = () => {
    setEditingEmpresa(null);
    setEditingCategories([]);
    setShowForm(true);
  };

  const openEditForm = (emp: Empresa) => {
    setEditingEmpresa(emp);
    setEditingCategories(relMap[emp.id] || []);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingEmpresa(null);
    setEditingCategories([]);
  };

  const handleSaveCompany = async (
    data: Partial<Empresa> & { nombre: string },
    selectedCategorySlugs: string[]
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      let empresaId = editingEmpresa?.id;

      if (editingEmpresa) {
        const { error: updateErr } = await supabase.from('empresas').update(data).eq('id', editingEmpresa.id);
        if (updateErr) throw updateErr;

        await supabase.from('empresa_categorias').delete().eq('empresa_id', editingEmpresa.id);
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('empresas')
          .insert([data])
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        empresaId = inserted.id;
      }

      if (!empresaId) throw new Error('No se obtuvo el identificador de la empresa.');

      if (selectedCategorySlugs.length > 0) {
        const relRows = selectedCategorySlugs.map((slug) => ({
          empresa_id: empresaId,
          categoria_slug: slug
        }));
        const { error: relInsertErr } = await supabase.from('empresa_categorias').insert(relRows);
        if (relInsertErr) throw relInsertErr;
      }

      closeForm();
      await loadData();
      onCountsChanged();

      return { ok: true };
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === '42501') {
        return {
          ok: false,
          error: 'Permiso denegado por seguridad (RLS): solo usuarios con rol de editor pueden crear o modificar empresas.'
        };
      }
      return { ok: false, error: e?.message || 'Ocurrió un error inesperado al guardar la empresa.' };
    }
  };

  const handleDelete = async (empresaId: string) => {
    setDeletingId(empresaId);
    try {
      const { error } = await supabase.from('empresas').delete().eq('id', empresaId);
      if (error) throw error;
      await loadData();
      onCountsChanged();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === '42501') {
        alert('No tienes permiso de editor para eliminar empresas.');
      } else {
        alert(`No se pudo eliminar la empresa: ${e?.message || 'error desconocido'}`);
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: '12.5px',
    color: 'var(--muted)',
    borderBottom: '2px solid var(--line)',
    whiteSpace: 'nowrap'
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '13px',
    borderBottom: '1px solid var(--line-soft)',
    verticalAlign: 'top'
  };
  const selectStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '5px 8px',
    border: '1px solid var(--line)',
    borderRadius: '2px'
  };

  return (
    <div id="vAdmin" style={{ maxWidth: '1100px' }}>
      <div className="crumbs">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
        >
          Cadena
        </a>{' '}
        › Panel de gestión de empresas
      </div>

      <h2 className="ct" style={{ marginBottom: '4px' }}>
        Panel de gestión de empresas
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: 0, marginBottom: '16px' }}>
        Administra el directorio completo: crea, edita, elimina y filtra empresas por sector y ubicación. Solo visible
        para usuarios con una cuenta iniciada.
      </p>

      {/* Barra de filtros */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          padding: '12px',
          background: 'var(--surface)',
          border: '1px solid var(--line-soft)',
          borderRadius: '3px',
          marginBottom: '14px'
        }}
      >
        <input
          type="text"
          placeholder="Buscar por nombre…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ ...selectStyle, minWidth: '200px', flex: '1 1 200px' }}
        />

        <select
          value={filterRamaId}
          onChange={(e) => {
            const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
            setFilterRamaId(val);
            setFilterCategoriaSlug('all');
          }}
          style={selectStyle}
          title="Filtrar por rama (sector)"
        >
          <option value="all">Todas las ramas</option>
          {BRANCHES.map((b) => (
            <option key={b.id} value={b.id}>
              Rama {b.id}: {b.name}
            </option>
          ))}
        </select>

        <select
          value={filterCategoriaSlug}
          onChange={(e) => setFilterCategoriaSlug(e.target.value)}
          style={selectStyle}
          title="Filtrar por subcategoría"
        >
          <option value="all">Todas las subcategorías</option>
          {categoriasParaFiltro.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nombre}
            </option>
          ))}
        </select>

        <select
          value={filterMunicipio}
          onChange={(e) => setFilterMunicipio(e.target.value as MunicipioCarabobo | 'all')}
          style={selectStyle}
          title="Filtrar por municipio"
        >
          <option value="all">Todos los municipios</option>
          {MUNICIPIOS_CARABOBO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={filterRevision}
          onChange={(e) => setFilterRevision(e.target.value as RevisionFilter)}
          style={selectStyle}
          title="Filtrar por estado de revisión"
        >
          <option value="all">Cualquier estado</option>
          <option value="solo_revisar">Solo por revisar</option>
          <option value="sin_revisar">Sin marca de revisión</option>
        </select>

        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value as TipoFilter)}
          style={selectStyle}
          title="Filtrar por tipo de registro"
        >
          <option value="all">Empresas y referencias</option>
          <option value="empresa">Solo empresas reales</option>
          <option value="referencia_generica">Solo referencias genéricas</option>
        </select>

        <button
          type="button"
          className="primary"
          onClick={openNewForm}
          style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          + Nueva empresa
        </button>
      </div>

      {errorMessage && <p className="warn">{errorMessage}</p>}

      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '8px' }}>
        {loading ? 'Cargando…' : `${filteredEmpresas.length} de ${empresas.length} empresas`}
      </div>

      {/* Tabla de empresas */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line-soft)', borderRadius: '3px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Sector(es)</th>
              <th style={thStyle}>Municipio</th>
              <th style={thStyle}>Contacto</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredEmpresas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)' }}>
                  No hay empresas que coincidan con los filtros seleccionados.
                </td>
              </tr>
            )}
            {filteredEmpresas.map((emp) => {
              const slugs = relMap[emp.id] || [];
              const nombres = slugs.map((s) => CATEGORIES_BY_SLUG[s]?.nombre || s);
              return (
                <tr key={emp.id}>
                  <td style={tdStyle}>
                    <b>{emp.nombre}</b>
                    {emp.tipo_registro === 'referencia_generica' && (
                      <div style={{ fontSize: '11px', color: '#856404' }}>Referencia genérica</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: '260px' }}>
                    {nombres.length > 0 ? (
                      <span style={{ fontSize: '12px' }}>{nombres.join(', ')}</span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Sin subcategoría</span>
                    )}
                  </td>
                  <td style={tdStyle}>{emp.municipio || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td style={{ ...tdStyle, fontSize: '12.5px' }}>
                    {emp.telefono && <div>{emp.telefono}</div>}
                    {emp.whatsapp && <div>WhatsApp: {emp.whatsapp}</div>}
                    {emp.correo && <div>{emp.correo}</div>}
                    {!emp.telefono && !emp.whatsapp && !emp.correo && <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    {emp.revisar && (
                      <span className="badge-revisar" title={emp.nota_revision || 'Marcado para revisión'}>
                        🔍 Por revisar
                      </span>
                    )}
                    {!emp.contacto_verificado && (
                      <div>
                        <span className="badge-unverified">sin verificar</span>
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {confirmDeleteId === emp.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px' }}>¿Eliminar?</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => handleDelete(emp.id)}
                            disabled={deletingId === emp.id}
                          >
                            {deletingId === emp.id ? 'Eliminando…' : 'Sí'}
                          </button>
                          <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="btn" onClick={() => openEditForm(emp)}>
                          Editar
                        </button>
                        <button type="button" className="btn danger" onClick={() => setConfirmDeleteId(emp.id)}>
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de alta / edición */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px 16px',
            overflowY: 'auto'
          }}
          onClick={closeForm}
        >
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--line)',
              padding: '20px 24px',
              maxWidth: '760px',
              width: '100%',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={closeForm} style={{ fontSize: '12px' }}>
                ✕ Cerrar
              </button>
            </div>
            <CompanyForm
              currentCategorySlug=""
              empresaToEdit={editingEmpresa}
              associatedCategories={editingCategories}
              onSave={handleSaveCompany}
              onCancelEdit={closeForm}
            />
          </div>
        </div>
      )}
    </div>
  );
};
