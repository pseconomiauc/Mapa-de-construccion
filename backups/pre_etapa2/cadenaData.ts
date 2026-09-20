import React from 'react';
import categoriesJson from './categories.json';
import { TipoActor, Categoria } from '../types/database';

export interface SubcategoriaItem {
  slug: string;
  nombre: string;
  actores: TipoActor[];
  orden: number;
}

export interface GrupoItem {
  name: string;
  tags: TipoActor[];
  leaf: boolean;
  items: SubcategoriaItem[];
}

export interface RamaItem {
  id: number;
  name: string;
  groups: GrupoItem[];
}

export const BRANCHES: RamaItem[] = categoriesJson.branches as unknown as RamaItem[];
export const ALL_CATEGORIES: Categoria[] = categoriesJson.allCategories as unknown as Categoria[];

// Mapa por slug para acceso O(1)
export const CATEGORIES_BY_SLUG: Record<string, Categoria> = {};
ALL_CATEGORIES.forEach((cat) => {
  CATEGORIES_BY_SLUG[cat.slug] = cat;
});

// Función para normalizar texto (ignorar mayúsculas y tildes)
export const norm = (s: string): string => {
  return [...s]
    .map((c) => c.normalize('NFD')[0])
    .join('')
    .toLowerCase();
};

// Generador de slugs seguros
export const slugify = (s: string): string => {
  return norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'item';
};

// Resaltado de coincidencias de búsqueda
export const highlightMatch = (text: string, query: string): React.ReactNode => {
  const nq = norm(query.trim());
  if (!nq) return text;

  const nText = norm(text);
  const parts: React.ReactNode[] = [];
  let i = 0;

  while (true) {
    const j = nText.indexOf(nq, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) {
      parts.push(text.slice(i, j));
    }
    parts.push(
      React.createElement(
        'mark',
        { key: `${i}-${j}`, style: { background: '#fef6c7', padding: '0 1px' } },
        text.slice(j, j + nq.length)
      )
    );
    i = j + nq.length;
  }

  return parts;
};
