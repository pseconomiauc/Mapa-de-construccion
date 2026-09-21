import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import { TipoActor, Empresa } from './types/database';
import {
  BRANCHES,
  ALL_CATEGORIES,
  CATEGORIES_BY_SLUG,
  norm,
  RamaItem
} from './data/cadenaData';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { SearchBar } from './components/SearchBar';
import { Sidebar } from './components/Sidebar';
import { CategoryTree } from './components/CategoryTree';
import { CategoryDetailView } from './components/CategoryDetailView';
import {
  exportEmpresasExcel,
  exportPlantillaExcel,
  parseExcelFile,
  ImportValidationResult
} from './services/excelService';
import { ImportPreviewModal } from './components/ImportPreviewModal';
import { AdminPanel } from './components/AdminPanel';
import { AdminTabs } from './components/AdminTabs';
import { SearchPanel } from './components/SearchPanel';
import { MapView } from './components/Map/MapView';
import { getErrorMessage } from './utils/errorUtils';

export const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActors, setSelectedActors] = useState<Set<TipoActor>>(new Set());
  const [selectedBranchId, setSelectedBranchId] = useState<number | 'all'>('all');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [currentPath, setCurrentPath] = useState('/');
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);

  // Modo editor
  const [isEditor, setIsEditor] = useState(false);

  // Contadores de empresas desde Supabase
  const [totalEmpresas, setTotalEmpresas] = useState(0);
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({});

  // Estado para modal de importación de Excel
  const [importModal, setImportModal] = useState<{
    fileName: string;
    result: ImportValidationResult;
  } | null>(null);
  const [excelStatus, setExcelStatus] = useState<{ text: string; isError: boolean } | null>(null);

  // Cargar estadísticas y conteos de empresas desde Supabase (o fallback seed)
  const fetchCounts = useCallback(async () => {
    if (!isConfigured) {
      // Fallback a seedEmpresas.json
      try {
        const seedData = await import('./data/seedEmpresas.json');
        const realEmpresas = seedData.empresas.filter((e: { tipo_registro?: string }) => e.tipo_registro !== 'referencia_generica');
        setTotalEmpresas(realEmpresas.length);
        const counts: Record<string, number> = {};
        seedData.asociaciones.forEach((r: { categoriaSlug: string }) => {
          counts[r.categoriaSlug] = (counts[r.categoriaSlug] || 0) + 1;
        });
        setCompanyCounts(counts);
      } catch {
        // Continuar silenciosamente
      }
      return;
    }

    try {
      // Conteo total de empresas reales (excluyendo referencias genéricas)
      const { count: empCount, error: empErr } = await supabase
        .from('empresas')
        .select('*', { count: 'exact', head: true })
        .neq('tipo_registro', 'referencia_generica');

      if (!empErr && typeof empCount === 'number') {
        setTotalEmpresas(empCount);
      }

      // Conteo de empresas por subcategoría
      const { data: catRel, error: relErr } = await supabase
        .from('empresa_categorias')
        .select('categoria_slug');

      if (!relErr && catRel) {
        const counts: Record<string, number> = {};
        catRel.forEach((r: { categoria_slug: string }) => {
          counts[r.categoria_slug] = (counts[r.categoria_slug] || 0) + 1;
        });
        setCompanyCounts(counts);
      }
    } catch {
      // Continuar silenciosamente
    }
  }, []);

  useEffect(() => {
    fetchCounts();

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#/mapa' || hash.startsWith('#/mapa')) {
        setActiveCategorySlug(null);
        setCurrentPath('/mapa');
      } else if (hash === '#/admin/busqueda' || hash.startsWith('#/admin/busqueda')) {
        setActiveCategorySlug(null);
        setCurrentPath('/admin/busqueda');
      } else if (hash === '#/admin' || hash.startsWith('#/admin')) {
        setActiveCategorySlug(null);
        setCurrentPath('/admin');
      } else if (hash.startsWith('#/categoria/')) {
        const slug = hash.replace('#/categoria/', '');
        setActiveCategorySlug(slug);
        setCurrentPath(`/categoria/${slug}`);
      } else {
        setActiveCategorySlug(null);
        setCurrentPath('/');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    const channel = supabase
      .channel('global-counts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresas' },
        () => {
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresa_categorias' },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts]);

  // ---------- OPERACIONES DE EXCEL (PARTE 4) ----------

  // 1. Exportar Excel completo
  const handleExportExcel = async () => {
    setExcelStatus({ text: 'Preparando archivo Excel…', isError: false });
    try {
      // Obtener todas las empresas
      const { data: empresas, error: empErr } = await supabase
        .from('empresas')
        .select('*')
        .order('nombre', { ascending: true });

      if (empErr) throw empErr;

      // Obtener todas las relaciones
      const { data: rels, error: relErr } = await supabase
        .from('empresa_categorias')
        .select('empresa_id, categoria_slug');

      if (relErr) throw relErr;

      const companyCategoriesMap: Record<string, string[]> = {};
      (rels || []).forEach((r: { empresa_id: string; categoria_slug: string }) => {
        if (!companyCategoriesMap[r.empresa_id]) {
          companyCategoriesMap[r.empresa_id] = [];
        }
        companyCategoriesMap[r.empresa_id].push(r.categoria_slug);
      });

      exportEmpresasExcel(empresas || [], companyCategoriesMap, companyCounts);
      setExcelStatus({ text: 'Excel descargado exitosamente.', isError: false });
      setTimeout(() => setExcelStatus(null), 4000);
    } catch (err) {
      const msg = getErrorMessage(err);
      setExcelStatus({ text: `Error al exportar: ${msg}`, isError: true });
    }
  };

  // 2. Exportar Plantilla
  const handleExportPlantilla = () => {
    try {
      exportPlantillaExcel();
      setExcelStatus({ text: 'Plantilla descargada.', isError: false });
      setTimeout(() => setExcelStatus(null), 3000);
    } catch (err) {
      const msg = getErrorMessage(err);
      setExcelStatus({ text: `Error al descargar plantilla: ${msg}`, isError: true });
    }
  };

  // 3. Selección y parseo de archivo para importación
  const handleImportFileSelected = async (file: File) => {
    setExcelStatus({ text: 'Leyendo archivo…', isError: false });
    try {
      // Cargar empresas existentes para validar duplicados
      const { data: existing, error } = await supabase
        .from('empresas')
        .select('id, nombre');

      if (error) throw error;

      const result = await parseExcelFile(file, (existing || []) as Empresa[], activeCategorySlug);
      setImportModal({ fileName: file.name, result });
      setExcelStatus(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      setExcelStatus({ text: `No se pudo leer el archivo: ${msg}`, isError: true });
    }
  };

  // 4. Confirmar e insertar en Supabase
  const handleConfirmImport = async (
    onProgress: (current: number, total: number) => void
  ) => {
    if (!importModal) return;
    const { readyToImport, existingMerged } = importModal.result;
    const total = readyToImport.length + existingMerged.length;
    let processed = 0;

    // A) Insertar empresas nuevas
    for (const item of readyToImport) {
      const { categoriaSlugs, isExisting: _, existingId: __, tipo_actor: ___, warnings: ____, ...empresaFields } = item;

      // 1. Insertar empresa
      const { data: inserted, error: insErr } = await supabase
        .from('empresas')
        .insert([empresaFields])
        .select('id')
        .single();

      if (insErr) throw insErr;

      // 2. Insertar relaciones
      if (inserted?.id && categoriaSlugs.length > 0) {
        const relRows = categoriaSlugs.map((slug) => ({
          empresa_id: inserted.id,
          categoria_slug: slug
        }));

        const { error: relErr } = await supabase.from('empresa_categorias').insert(relRows);
        if (relErr) throw relErr;
      }

      processed++;
      onProgress(processed, total);
    }

    // B) Actualizar empresas existentes (fusión sin duplicados)
    for (const item of existingMerged) {
      if (!item.existingId) continue;

      const { categoriaSlugs, isExisting: _, existingId, tipo_actor: __, warnings: ___, ...empresaFields } = item;

      // 1. Actualizar campos opcionales no nulos
      const updateData: Record<string, unknown> = {};
      Object.entries(empresaFields).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') {
          updateData[k] = v;
        }
      });

      if (Object.keys(updateData).length > 0) {
        const { error: updErr } = await supabase
          .from('empresas')
          .update(updateData)
          .eq('id', existingId);
        if (updErr) throw updErr;
      }

      // 2. Consultar relaciones existentes para no duplicarlas
      const { data: currentRels, error: relSelErr } = await supabase
        .from('empresa_categorias')
        .select('categoria_slug')
        .eq('empresa_id', existingId);
      if (relSelErr) throw relSelErr;

      const existingSlugs = new Set((currentRels || []).map((r: { categoria_slug: string }) => r.categoria_slug));
      const newSlugsToInsert = categoriaSlugs.filter((s) => !existingSlugs.has(s));

      if (newSlugsToInsert.length > 0) {
        const relRows = newSlugsToInsert.map((slug) => ({
          empresa_id: existingId,
          categoria_slug: slug
        }));

        const { error: relInsErr } = await supabase.from('empresa_categorias').insert(relRows);
        if (relInsErr) throw relInsErr;
      }

      processed++;
      onProgress(processed, total);
    }

    await fetchCounts();
  };

  // Alternar filtros de actor
  const handleToggleActor = (actor: TipoActor) => {
    setSelectedActors((prev) => {
      const next = new Set(prev);
      if (next.has(actor)) {
        next.delete(actor);
      } else {
        next.add(actor);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const allKeys = new Set<string>();
    BRANCHES.forEach((b) => {
      b.groups.forEach((g) => {
        allKeys.add(`${b.id}::${g.name}`);
      });
    });
    setOpenGroups(allKeys);
  };

  const handleCollapseAll = () => {
    setOpenGroups(new Set());
  };

  const handleToggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const actorCounts = useMemo(() => {
    const counts: Record<TipoActor, number> = { F: 0, D: 0, C: 0, S: 0, A: 0 };
    ALL_CATEGORIES.forEach((cat) => {
      cat.actores.forEach((act) => {
        if (counts[act] !== undefined) {
          counts[act]++;
        }
      });
    });
    return counts;
  }, []);

  const filteredData = useMemo(() => {
    const nq = norm(searchQuery.trim());
    const hasActorFilter = selectedActors.size > 0;

    return BRANCHES.map((branch) => {
      if (selectedBranchId !== 'all' && branch.id !== selectedBranchId) {
        return { branch, groups: [] };
      }

      const groups = branch.groups.map((group) => {
        const groupMatches = nq ? norm(group.name).includes(nq) : false;

        const filteredItems = group.items.filter((item) => {
          const nameMatches = nq ? norm(item.nombre || '').includes(nq) : true;
          const searchOk = !nq || groupMatches || nameMatches;

          const actorOk =
            !hasActorFilter || (item.actores || []).some((a) => selectedActors.has(a));

          return searchOk && actorOk;
        });

        return { group, filteredItems };
      });

      return { branch, groups };
    });
  }, [searchQuery, selectedActors, selectedBranchId]);

  useEffect(() => {
    const nq = norm(searchQuery.trim());
    if (nq || selectedActors.size > 0) {
      const matchingGroups = new Set<string>();
      filteredData.forEach(({ branch, groups }) => {
        groups.forEach(({ group, filteredItems }) => {
          if (filteredItems.length > 0) {
            matchingGroups.add(`${branch.id}::${group.name}`);
          }
        });
      });
      setOpenGroups(matchingGroups);
    }
  }, [searchQuery, selectedActors, filteredData]);

  const branchCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const nq = norm(searchQuery.trim());
    const hasActorFilter = selectedActors.size > 0;

    BRANCHES.forEach((b: RamaItem) => {
      let count = 0;
      b.groups.forEach((g) => {
        const groupMatches = nq ? norm(g.name).includes(nq) : false;
        g.items.forEach((it) => {
          const nameMatches = nq ? norm(it.nombre || '').includes(nq) : true;
          const searchOk = !nq || groupMatches || nameMatches;
          const actorOk =
            !hasActorFilter || (it.actores || []).some((a) => selectedActors.has(a));
          if (searchOk && actorOk) count++;
        });
      });
      counts[b.id] = count;
    });

    return counts;
  }, [searchQuery, selectedActors]);

  const totalVisibleSubcategories = useMemo(() => {
    return Object.values(branchCounts).reduce((a, b) => a + b, 0);
  }, [branchCounts]);

  const handleNavigateHome = () => {
    window.location.hash = '';
    setActiveCategorySlug(null);
    setCurrentPath('/');
  };

  const handleSelectCategory = (slug: string) => {
    window.location.hash = `#/categoria/${slug}`;
  };

  const activeCategory = activeCategorySlug ? CATEGORIES_BY_SLUG[activeCategorySlug] : null;

  if (currentPath === '/mapa') {
    return <MapView onNavigateHome={handleNavigateHome} />;
  }

  return (
    <div className="wrap">
      <Header
        totalRamas={BRANCHES.length}
        totalSubcategorias={ALL_CATEGORIES.length}
        totalEmpresas={totalEmpresas}
        onNavigateHome={handleNavigateHome}
        currentPath={currentPath}
        isEditor={isEditor}
        onToggleEditorMode={setIsEditor}
        onExportExcel={handleExportExcel}
        onExportPlantilla={handleExportPlantilla}
        onImportFileSelected={handleImportFileSelected}
        excelStatus={excelStatus}
      />

      {/* Modal / Caja de Vista Previa de Importación */}
      {importModal && (
        <ImportPreviewModal
          fileName={importModal.fileName}
          result={importModal.result}
          onConfirmImport={handleConfirmImport}
          onClose={() => setImportModal(null)}
        />
      )}

      {currentPath === '/admin' || currentPath === '/admin/busqueda' ? (
        isEditor ? (
          <div style={{ maxWidth: '1100px' }}>
            <AdminTabs currentPath={currentPath} />
            {currentPath === '/admin/busqueda' ? (
              <SearchPanel onCountsChanged={fetchCounts} />
            ) : (
              <AdminPanel onNavigateHome={handleNavigateHome} onCountsChanged={fetchCounts} />
            )}
          </div>
        ) : (
          <div style={{ maxWidth: '640px', padding: '32px 16px' }}>
            <h2 className="ct">Acceso restringido</h2>
            <p style={{ color: 'var(--muted)' }}>
              El panel de gestión es exclusivo para usuarios con una cuenta iniciada. Inicia sesión (o regístrate)
              desde la esquina superior derecha para acceder.
            </p>
            <button type="button" className="btn" onClick={handleNavigateHome}>
              ← Volver a la Cadena
            </button>
          </div>
        )
      ) : activeCategory ? (
        <CategoryDetailView
          category={activeCategory}
          isEditor={isEditor}
          onNavigateHome={handleNavigateHome}
          onCountsChanged={fetchCounts}
        />
      ) : (
        <div id="vIndex">
          <Legend />

          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedActors={selectedActors}
            onToggleActor={handleToggleActor}
            actorCounts={actorCounts}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />

          <div className="layout">
            <Sidebar
              branches={BRANCHES}
              selectedBranchId={selectedBranchId}
              onSelectBranch={setSelectedBranchId}
              branchCounts={branchCounts}
              totalSubcategories={totalVisibleSubcategories}
            />

            <CategoryTree
              branches={filteredData}
              searchQuery={searchQuery}
              openGroups={openGroups}
              onToggleGroup={handleToggleGroup}
              companyCounts={companyCounts}
              onSelectCategory={handleSelectCategory}
            />
          </div>
        </div>
      )}
    </div>
  );
};
