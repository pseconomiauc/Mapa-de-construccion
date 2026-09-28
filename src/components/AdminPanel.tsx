import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Empresa, MUNICIPIOS_CARABOBO, TIPOS_ACTOR, TipoActor, DESCRIPCION_ACTORES } from '../types/database';
import { BRANCHES, ALL_CATEGORIES, CATEGORIES_BY_SLUG, norm } from '../data/cadenaData';
import { CompanyForm } from './CompanyForm';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { getErrorMessage } from '../utils/errorUtils';

interface AdminPanelProps {
  onNavigateHome: () => void;
  onCountsChanged: () => void;
}

type RevisionFilter = 'all' | 'solo_revisar' | 'sin_revisar';
type TipoFilter = 'all' | 'empresa' | 'referencia_generica';
type VerificadoFilter = 'all' | 'verificado' | 'sin_verificar';
type SortOption = 'nombre_asc' | 'nombre_desc' | 'mas_nuevo' | 'mas_antiguo';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'nombre_asc', label: 'Alfabético A-Z' },
  { value: 'nombre_desc', label: 'Alfabético Z-A' },
  { value: 'mas_nuevo', label: 'Más nuevas primero' },
  { value: 'mas_antiguo', label: 'Más antiguas primero' }
];

export const AdminPanel: React.FC<AdminPanelProps> = ({ onNavigateHome, onCountsChanged }) => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [relMap, setRelMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filtros (rama, subcategoría y municipio admiten selección múltiple)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRamaIds, setFilterRamaIds] = useState<Set<string>>(new Set());
  const [filterCategoriaSlugs, setFilterCategoriaSlugs] = useState<Set<string>>(new Set());
  const [filterMunicipios, setFilterMunicipios] = useState<Set<string>>(new Set());
  const [filterRevision, setFilterRevision] = useState<RevisionFilter>('all');
  const [filterTipo, setFilterTipo] = useState<TipoFilter>('all');
  const [filterVerificado, setFilterVerificado] = useState<VerificadoFilter>('all');
  const [filterTipoActor, setFilterTipoActor] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('nombre_asc');

  // Selección de filas para acciones en lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkVerifying, setBulkVerifying] = useState(false);

  // Modal de alta / edición
  const [showForm, setShowForm] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [editingCategories, setEditingCategories] = useState<string[]>([]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Menú desplegable de orden en el encabezado "Nombre"
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Menú desplegable de filtros en el encabezado "Estado" (verificación + revisión)
  const [estadoMenuOpen, setEstadoMenuOpen] = useState(false);
  const estadoMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (estadoMenuRef.current && !estadoMenuRef.current.contains(e.target as Node)) {
        setEstadoMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Cantidad de empresas cargadas por subcategoría (para no ofrecer sectores vacíos en el filtro)
  const categoriaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(relMap).forEach((slugs) => {
      slugs.forEach((slug) => {
        counts[slug] = (counts[slug] || 0) + 1;
      });
    });
    return counts;
  }, [relMap]);

  // Grupos disponibles para el filtro de subcategoría: dependientes de las ramas elegidas
  // y limitados a los sectores que ya tienen al menos una empresa cargada
  const categoriasParaFiltro = useMemo(() => {
    const base =
      filterRamaIds.size === 0 ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => filterRamaIds.has(String(c.rama_id)));
    return base.filter((c) => (categoriaCounts[c.slug] || 0) > 0);
  }, [filterRamaIds, categoriaCounts]);

  // Municipios que ya tienen al menos una empresa cargada (para no ofrecer municipios vacíos en el filtro)
  const municipiosParaFiltro = useMemo(() => {
    const counts: Record<string, number> = {};
    empresas.forEach((emp) => {
      if (emp.municipio) counts[emp.municipio] = (counts[emp.municipio] || 0) + 1;
    });
    return MUNICIPIOS_CARABOBO.filter((m) => (counts[m] || 0) > 0);
  }, [empresas]);

  // Tipos de actor que ya tienen al menos una empresa cargada
  const tiposActorParaFiltro = useMemo(() => {
    const counts: Record<string, number> = {};
    empresas.forEach((emp) => {
      (emp.tipo_actor || []).forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return TIPOS_ACTOR.filter((t) => (counts[t] || 0) > 0);
  }, [empresas]);

  // Al cambiar las ramas seleccionadas, descarta subcategorías que ya no apliquen
  useEffect(() => {
    if (filterRamaIds.size === 0) return;
    setFilterCategoriaSlugs((prev) => {
      const validSlugs = new Set(categoriasParaFiltro.map((c) => c.slug));
      const next = new Set([...prev].filter((s) => validSlugs.has(s)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRamaIds]);

  const filteredEmpresas = useMemo(() => {
    const nq = norm(searchQuery.trim());

    const result = empresas.filter((emp) => {
      if (nq && !norm(emp.nombre || '').includes(nq)) return false;

      if (filterMunicipios.size > 0 && (!emp.municipio || !filterMunicipios.has(emp.municipio))) return false;

      if (filterRevision === 'solo_revisar' && !emp.revisar) return false;
      if (filterRevision === 'sin_revisar' && emp.revisar) return false;

      if (filterVerificado === 'verificado' && !emp.contacto_verificado) return false;
      if (filterVerificado === 'sin_verificar' && emp.contacto_verificado) return false;

      if (filterTipo !== 'all' && (emp.tipo_registro || 'empresa') !== filterTipo) return false;

      if (filterTipoActor.size > 0 && !(emp.tipo_actor || []).some((t) => filterTipoActor.has(t))) return false;

      const slugs = relMap[emp.id] || [];
      if (filterCategoriaSlugs.size > 0 && !slugs.some((s) => filterCategoriaSlugs.has(s))) return false;
      if (filterRamaIds.size > 0) {
        const belongsToRama = slugs.some((s) => filterRamaIds.has(String(CATEGORIES_BY_SLUG[s]?.rama_id)));
        if (!belongsToRama) return false;
      }

      return true;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'nombre_desc':
          return (b.nombre || '').localeCompare(a.nombre || '', 'es');
        case 'mas_nuevo':
          return new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime();
        case 'mas_antiguo':
          return new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime();
        case 'nombre_asc':
        default:
          return (a.nombre || '').localeCompare(b.nombre || '', 'es');
      }
    });
    return sorted;
  }, [
    empresas,
    relMap,
    searchQuery,
    filterMunicipios,
    filterRevision,
    filterVerificado,
    filterTipo,
    filterTipoActor,
    filterCategoriaSlugs,
    filterRamaIds,
    sortBy
  ]);

  // La selección se limpia si cambian los filtros, para no arrastrar filas que ya no se ven
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    searchQuery,
    filterMunicipios,
    filterRevision,
    filterVerificado,
    filterTipo,
    filterTipoActor,
    filterCategoriaSlugs,
    filterRamaIds
  ]);

  const allVisibleSelected = filteredEmpresas.length > 0 && filteredEmpresas.every((e) => selectedIds.has(e.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmpresas.map((e) => e.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const { error } = await supabase.from('empresas').delete().in('id', [...selectedIds]);
      if (error) throw error;
      setSelectedIds(new Set());
      await loadData();
      onCountsChanged();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === '42501') {
        alert('No tienes permiso de editor para eliminar empresas.');
      } else {
        alert(`No se pudieron eliminar las empresas seleccionadas: ${e?.message || 'error desconocido'}`);
      }
    } finally {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
    }
  };

  const handleBulkSetVerificado = async (verificado: boolean) => {
    setBulkVerifying(true);
    try {
      const { error } = await supabase
        .from('empresas')
        .update({ contacto_verificado: verificado })
        .in('id', [...selectedIds]);
      if (error) throw error;
      setSelectedIds(new Set());
      await loadData();
      onCountsChanged();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === '42501') {
        alert('No tienes permiso de editor para verificar empresas.');
      } else {
        alert(`No se pudo actualizar el estado de verificación: ${e?.message || 'error desconocido'}`);
      }
    } finally {
      setBulkVerifying(false);
    }
  };

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

        <MultiSelectDropdown
          label="Todas las ramas"
          options={BRANCHES.map((b) => ({ value: String(b.id), label: `Rama ${b.id}: ${b.name}` }))}
          selected={filterRamaIds}
          onChange={setFilterRamaIds}
          minWidth="170px"
        />

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
          {loading ? 'Cargando…' : `${filteredEmpresas.length} de ${empresas.length} empresas`}
        </div>

        {selectedIds.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              background: '#eef2ff',
              border: '1px solid #c7d2fe',
              borderRadius: '3px',
              fontSize: '12.5px'
            }}
          >
            <span>{selectedIds.size} seleccionada(s)</span>
            {confirmBulkDelete ? (
              <>
                <span>¿Eliminar todas?</span>
                <button type="button" className="btn danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                  {bulkDeleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleBulkSetVerificado(true)}
                  disabled={bulkVerifying}
                >
                  {bulkVerifying ? 'Actualizando…' : '✓ Marcar verificadas'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleBulkSetVerificado(false)}
                  disabled={bulkVerifying}
                >
                  Marcar sin verificar
                </button>
                <button type="button" className="btn danger" onClick={() => setConfirmBulkDelete(true)}>
                  Eliminar seleccionadas
                </button>
                <button type="button" className="btn" onClick={() => setSelectedIds(new Set())}>
                  Deseleccionar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabla de empresas */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line-soft)', borderRadius: '3px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '28px' }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  title="Seleccionar todas las filas visibles"
                />
              </th>
              <th style={thStyle}>
                <div ref={sortMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    onClick={() => setSortMenuOpen((o) => !o)}
                    style={{
                      background: 'none',
                      border: 'none',
                      font: 'inherit',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                    title="Ordenar por nombre o fecha"
                  >
                    Nombre <span style={{ fontSize: '10px' }}>▾</span>
                  </button>
                  {sortMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 50,
                        background: '#fff',
                        border: '1px solid var(--line)',
                        borderRadius: '3px',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                        minWidth: '170px',
                        padding: '4px'
                      }}
                    >
                      {SORT_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            setSortBy(o.value);
                            setSortMenuOpen(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            fontSize: '12.5px',
                            fontWeight: 400,
                            background: sortBy === o.value ? '#eef2ff' : 'transparent',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            color: 'var(--ink)'
                          }}
                        >
                          {sortBy === o.value ? '✓ ' : ''}
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
              <th style={thStyle}>
                <MultiSelectDropdown
                  label="Sector(es)"
                  options={categoriasParaFiltro.map((c) => ({ value: c.slug, label: c.nombre }))}
                  selected={filterCategoriaSlugs}
                  onChange={setFilterCategoriaSlugs}
                  minWidth="0"
                />
              </th>
              <th style={thStyle}>
                <MultiSelectDropdown
                  label="Municipio"
                  options={municipiosParaFiltro.map((m) => ({ value: m, label: m }))}
                  selected={filterMunicipios}
                  onChange={(next) => setFilterMunicipios(next as Set<string>)}
                  minWidth="0"
                />
              </th>
              <th style={thStyle}>
                <MultiSelectDropdown
                  label="Tipo de actor"
                  options={tiposActorParaFiltro.map((t) => ({ value: t, label: DESCRIPCION_ACTORES[t] }))}
                  selected={filterTipoActor}
                  onChange={setFilterTipoActor}
                  minWidth="0"
                />
              </th>
              <th style={thStyle}>
                <div ref={estadoMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    onClick={() => setEstadoMenuOpen((o) => !o)}
                    style={{
                      background: 'none',
                      border: 'none',
                      font: 'inherit',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0
                    }}
                    title="Filtrar por verificación o revisión"
                  >
                    Estado <span style={{ fontSize: '10px' }}>▾</span>
                  </button>
                  {estadoMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 50,
                        background: '#fff',
                        border: '1px solid var(--line)',
                        borderRadius: '3px',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                        minWidth: '220px',
                        padding: '8px'
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', margin: '2px 0 4px' }}>
                        Verificación
                      </div>
                      {(
                        [
                          { value: 'all', label: 'Verificados y sin verificar' },
                          { value: 'verificado', label: 'Solo verificados' },
                          { value: 'sin_verificar', label: 'Solo sin verificar' }
                        ] as { value: VerificadoFilter; label: string }[]
                      ).map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setFilterVerificado(o.value)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '5px 8px',
                            fontSize: '12.5px',
                            fontWeight: 400,
                            background: filterVerificado === o.value ? '#eef2ff' : 'transparent',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            color: 'var(--ink)'
                          }}
                        >
                          {filterVerificado === o.value ? '✓ ' : ''}
                          {o.label}
                        </button>
                      ))}

                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--muted)',
                          margin: '8px 0 4px',
                          borderTop: '1px solid var(--line-soft)',
                          paddingTop: '6px'
                        }}
                      >
                        Revisión
                      </div>
                      {(
                        [
                          { value: 'all', label: 'Cualquier estado' },
                          { value: 'solo_revisar', label: 'Solo por revisar' },
                          { value: 'sin_revisar', label: 'Sin marca de revisión' }
                        ] as { value: RevisionFilter; label: string }[]
                      ).map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setFilterRevision(o.value)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '5px 8px',
                            fontSize: '12.5px',
                            fontWeight: 400,
                            background: filterRevision === o.value ? '#eef2ff' : 'transparent',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            color: 'var(--ink)'
                          }}
                        >
                          {filterRevision === o.value ? '✓ ' : ''}
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filteredEmpresas.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)' }}>
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
                    <input type="checkbox" checked={selectedIds.has(emp.id)} onChange={() => toggleSelectOne(emp.id)} />
                  </td>
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
                    {emp.tipo_actor && emp.tipo_actor.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(emp.tipo_actor as TipoActor[]).map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '2px',
                              background: '#e0e7ff',
                              color: '#3730a3',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {DESCRIPCION_ACTORES[t]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {emp.revisar && (
                      <span className="badge-revisar" title={emp.nota_revision || 'Marcado para revisión'}>
                        🔍 Por revisar
                      </span>
                    )}
                    <div>
                      {emp.contacto_verificado ? (
                        <span className="badge-unverified" style={{ background: '#d1fae5', color: '#065f46' }}>
                          ✓ verificado
                        </span>
                      ) : (
                        <span className="badge-unverified">sin verificar</span>
                      )}
                    </div>
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
