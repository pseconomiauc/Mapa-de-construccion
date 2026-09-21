import React, { useState, useEffect, useMemo } from 'react';
import { Categoria, Empresa, DESCRIPCION_ACTORES } from '../types/database';
import { CompanyCard } from './CompanyCard';
import { CompanyForm } from './CompanyForm';
import { supabase, isConfigured } from '../lib/supabase';
import { getErrorMessage } from '../utils/errorUtils';

interface CategoryDetailViewProps {
  category: Categoria;
  isEditor: boolean;
  onNavigateHome: () => void;
  onCountsChanged: () => void;
}

export const CategoryDetailView: React.FC<CategoryDetailViewProps> = ({
  category,
  isEditor,
  onNavigateHome,
  onCountsChanged
}) => {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [editingCategories, setEditingCategories] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar empresas de esta subcategoría desde Supabase (con fallback seed)
  const loadEmpresas = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isConfigured) {
        const seed = await import('../data/seedEmpresas.json');
        const asocs = seed.asociaciones.filter((a: { categoriaSlug: string }) => a.categoriaSlug === category.slug);
        const keys = new Set(asocs.map((a: { empresaKey: string }) => a.empresaKey));
        const matched = seed.empresas.filter((e: { nombre: string }) => {
          const k = e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return keys.has(k);
        });
        setEmpresas(matched as unknown as Empresa[]);
        setLoading(false);
        return;
      }

      // 1. Obtener los IDs de empresas asociadas a este slug
      const { data: rels, error: relError } = await supabase
        .from('empresa_categorias')
        .select('empresa_id')
        .eq('categoria_slug', category.slug);

      if (relError) {
        throw relError;
      }

      const empresaIds = (rels || []).map((r: { empresa_id: string }) => r.empresa_id);

      if (empresaIds.length === 0) {
        setEmpresas([]);
        setLoading(false);
        return;
      }

      // 2. Cargar los datos completos de esas empresas
      const { data: empData, error: empError } = await supabase
        .from('empresas')
        .select('*')
        .in('id', empresaIds);

      if (empError) {
        throw empError;
      }

      setEmpresas(empData || []);
    } catch (err) {
      const msg = getErrorMessage(err);
      setErrorMessage(`No se pudieron cargar las empresas: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpresas();
    setEditingEmpresa(null);
  }, [category.slug]);

  // Suscripción Realtime para actualizar la lista automáticamente
  useEffect(() => {
    const channel = supabase
      .channel(`cat-${category.slug}-realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresa_categorias' },
        () => {
          loadEmpresas();
          onCountsChanged();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresas' },
        () => {
          loadEmpresas();
          onCountsChanged();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [category.slug, onCountsChanged]);

  // Lista ordenada alfabéticamente por nombre
  const sortedEmpresas = useMemo(() => {
    return [...empresas].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [empresas]);

  // Manejador para iniciar edición
  const handleStartEdit = async (emp: Empresa) => {
    setEditingEmpresa(emp);
    try {
      const { data } = await supabase
        .from('empresa_categorias')
        .select('categoria_slug')
        .eq('empresa_id', emp.id);

      if (data) {
        setEditingCategories(data.map((d: { categoria_slug: string }) => d.categoria_slug));
      }
    } catch {
      setEditingCategories([category.slug]);
    }

    const formEl = document.getElementById('formBox');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Manejador para guardar o actualizar empresa
  const handleSaveCompany = async (
    data: Partial<Empresa> & { nombre: string },
    selectedCategorySlugs: string[]
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      let empresaId = editingEmpresa?.id;

      if (editingEmpresa) {
        // Actualizar empresa existente
        const { error: updateErr } = await supabase
          .from('empresas')
          .update(data)
          .eq('id', editingEmpresa.id);

        if (updateErr) throw updateErr;
      } else {
        // Insertar nueva empresa
        const { data: inserted, error: insertErr } = await supabase
          .from('empresas')
          .insert([data])
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        empresaId = inserted.id;
      }

      if (!empresaId) throw new Error('No se obtuvo el identificador de la empresa.');

      // Sincronizar relaciones de categorías
      // 1. Eliminar relaciones previas si estamos editando
      if (editingEmpresa) {
        await supabase
          .from('empresa_categorias')
          .delete()
          .eq('empresa_id', empresaId);
      }

      // 2. Insertar las relaciones seleccionadas (asegurando incluir la actual)
      const uniqueSlugs = Array.from(new Set([...selectedCategorySlugs, category.slug]));
      const relRows = uniqueSlugs.map((slug) => ({
        empresa_id: empresaId,
        categoria_slug: slug
      }));

      const { error: relInsertErr } = await supabase
        .from('empresa_categorias')
        .insert(relRows);

      if (relInsertErr) throw relInsertErr;

      setEditingEmpresa(null);
      await loadEmpresas();
      onCountsChanged();

      return { ok: true };
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      const code = e?.code;
      if (code === '42501') {
        return {
          ok: false,
          error: 'Permiso denegado por seguridad (RLS): solo usuarios autorizados con rol de editor pueden crear o modificar empresas.'
        };
      }
      return {
        ok: false,
        error: e?.message || 'Ocurrió un error inesperado al guardar la empresa.'
      };
    }
  };

  // Manejador para eliminar empresa
  const handleDeleteCompany = async (empresaId: string) => {
    try {
      const { error } = await supabase
        .from('empresas')
        .delete()
        .eq('id', empresaId);

      if (error) throw error;

      await loadEmpresas();
      onCountsChanged();
    } catch (err: unknown) {
      const e = err as { message?: string; code?: string };
      if (e?.code === '42501') {
        alert('No tienes permiso de editor para eliminar empresas.');
      } else {
        alert(`No se pudo eliminar la empresa: ${e?.message || 'error desconocido'}`);
      }
    }
  };

  return (
    <div id="vCat" style={{ maxWidth: '820px' }}>
      {/* Migas de pan */}
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
        › Rama {category.rama_id}: {category.rama_nombre} › {category.grupo}
      </div>

      {/* Título de la subcategoría */}
      <h2 className="ct">
        {category.nombre}
        <span className="tags">
          {(category.actores || []).map((actor) => (
            <span
              key={actor}
              className="tg"
              title={DESCRIPCION_ACTORES[actor]}
            >
              {actor}
            </span>
          ))}
        </span>
      </h2>

      {/* Lista de empresas registradas */}
      <div id="list">
        <h3 className="lh">
          Empresas registradas{' '}
          <span className="ec on">
            {sortedEmpresas.length}{' '}
            {sortedEmpresas.length === 1 ? 'empresa' : 'empresas'}
          </span>
        </h3>

        {errorMessage && <p className="warn">{errorMessage}</p>}

        {loading ? (
          <p className="empty">Cargando directorio de empresas…</p>
        ) : sortedEmpresas.length === 0 ? (
          <p className="empty">
            Aún no hay empresas registradas en esta subcategoría.
            {isEditor
              ? ' Usa el formulario de abajo para agregar la primera.'
              : ' Inicia sesión como editor para agregar una empresa.'}
          </p>
        ) : (
          sortedEmpresas.map((emp) => (
            <CompanyCard
              key={emp.id}
              empresa={emp}
              isEditor={isEditor}
              onEdit={handleStartEdit}
              onDelete={handleDeleteCompany}
            />
          ))
        )}
      </div>

      {/* Formulario solo visible para editores (o mensaje informativo en modo lectura) */}
      {isEditor ? (
        <CompanyForm
          currentCategorySlug={category.slug}
          empresaToEdit={editingEmpresa}
          associatedCategories={editingCategories}
          onSave={handleSaveCompany}
          onCancelEdit={() => setEditingEmpresa(null)}
        />
      ) : (
        <div style={{ marginTop: '24px', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--line-soft)', fontSize: '13.5px', color: 'var(--muted)' }}>
          Estás navegando en <b>modo lectura</b>. Los botones para agregar, editar y eliminar empresas están reservados para editores autenticados.
        </div>
      )}
    </div>
  );
};
