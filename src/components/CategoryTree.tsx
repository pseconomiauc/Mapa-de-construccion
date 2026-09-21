import React from 'react';
import { RamaItem, GrupoItem, SubcategoriaItem, highlightMatch } from '../data/cadenaData';
import { DESCRIPCION_ACTORES, TipoActor } from '../types/database';

interface CategoryTreeProps {
  branches: {
    branch: RamaItem;
    groups: {
      group: GrupoItem;
      filteredItems: SubcategoriaItem[];
    }[];
  }[];
  searchQuery: string;
  openGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
  companyCounts: Record<string, number>;
  onSelectCategory: (slug: string) => void;
}

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  branches,
  searchQuery,
  openGroups,
  onToggleGroup,
  companyCounts,
  onSelectCategory
}) => {
  const visibleCount = branches.reduce(
    (acc, b) => acc + b.groups.reduce((gAcc, g) => gAcc + g.filteredItems.length, 0),
    0
  );

  if (visibleCount === 0) {
    return (
      <main id="main">
        <div className="empty">
          No se encontraron productos o servicios que coincidan con la búsqueda o filtros aplicados.
        </div>
      </main>
    );
  }

  return (
    <main id="main">
      {branches.map(({ branch, groups }) => {
        const branchSubcatCount = groups.reduce(
          (sum, g) => sum + g.filteredItems.length,
          0
        );
        if (branchSubcatCount === 0) return null;

        const branchCompanyTotal = groups.reduce(
          (sum, g) =>
            sum + g.filteredItems.reduce((s, item) => s + (companyCounts[item.slug] || 0), 0),
          0
        );

        return (
          <section key={branch.id} className="br" id={`rama-${branch.id}`}>
            <h2>
              <span className="num">{branch.id}.</span>
              <span>
                {branch.name} ({branchCompanyTotal})
              </span>
              <span className="cnt">
                {branchSubcatCount} {branchSubcatCount === 1 ? 'subcategoría' : 'subcategorías'}
              </span>
            </h2>

            {groups.map(({ group, filteredItems }) => {
              if (filteredItems.length === 0) return null;
              const groupKey = `${branch.id}::${group.name}`;
              const isOpen = openGroups.has(groupKey);

              // Si el grupo es una hoja (él mismo es la subcategoría directa)
              if (group.leaf && filteredItems.length === 1) {
                const leafItem = filteredItems[0];
                const cCount = companyCounts[leafItem.slug] || 0;

                return (
                  <div key={groupKey} className="leaf-item">
                    <a
                      href={`#/categoria/${leafItem.slug}`}
                      className="it"
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectCategory(leafItem.slug);
                      }}
                    >
                      {highlightMatch(leafItem.nombre, searchQuery)}
                    </a>
                    <span className="tags">
                      {(leafItem.actores || []).map((actor: TipoActor) => (
                        <span
                          key={actor}
                          className="tg"
                          title={DESCRIPCION_ACTORES[actor]}
                        >
                          {actor}
                        </span>
                      ))}
                    </span>
                    <span className={cCount > 0 ? 'ec on' : 'ec'}>({cCount})</span>
                  </div>
                );
              }

              // Grupo normal con subcategorías anidadas
              const groupTotal = filteredItems.reduce(
                (sum, item) => sum + (companyCounts[item.slug] || 0),
                0
              );

              return (
                <details
                  key={groupKey}
                  className="g"
                  open={isOpen}
                  onToggle={(e) => {
                    const isElementOpen = (e.currentTarget as HTMLDetailsElement).open;
                    if (isElementOpen !== isOpen) {
                      onToggleGroup(groupKey);
                    }
                  }}
                >
                  <summary>
                    <span className="group-title">
                      {highlightMatch(group.name, searchQuery)} ({groupTotal})
                    </span>
                    <span className="gc">
                      {filteredItems.length} {filteredItems.length === 1 ? 'ítem' : 'ítems'}
                    </span>
                  </summary>

                  <ul className="items">
                    {filteredItems.map((item) => {
                      const count = companyCounts[item.slug] || 0;

                      return (
                        <li key={item.slug}>
                          <a
                            href={`#/categoria/${item.slug}`}
                            className="it"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectCategory(item.slug);
                            }}
                          >
                            {highlightMatch(item.nombre, searchQuery)}
                          </a>
                          <span className="tags">
                            {(item.actores || []).map((actor: TipoActor) => (
                              <span
                                key={actor}
                                className="tg"
                                title={DESCRIPCION_ACTORES[actor]}
                              >
                                {actor}
                              </span>
                            ))}
                          </span>
                          <span className={count > 0 ? 'ec on' : 'ec'}>({count})</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </section>
        );
      })}
    </main>
  );
};
