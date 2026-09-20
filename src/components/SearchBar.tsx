import React from 'react';
import { TipoActor, DESCRIPCION_ACTORES } from '../types/database';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedActors: Set<TipoActor>;
  onToggleActor: (actor: TipoActor) => void;
  actorCounts: Record<TipoActor, number>;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedActors,
  onToggleActor,
  actorCounts,
  onExpandAll,
  onCollapseAll
}) => {
  const actorsList: TipoActor[] = ['F', 'D', 'C', 'S', 'A'];

  return (
    <div className="tools">
      <div className="search">
        <input
          id="q"
          type="search"
          placeholder="Buscar producto o servicio: cabilla, PVC, topografía…"
          autoComplete="off"
          aria-label="Buscar producto o servicio"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="chips" role="group" aria-label="Filtrar por tipo de actor">
        {actorsList.map((actor) => {
          const isSelected = selectedActors.has(actor);
          return (
            <button
              key={actor}
              type="button"
              className="chip"
              aria-pressed={isSelected}
              onClick={() => onToggleActor(actor)}
              title={`Filtrar por ${DESCRIPCION_ACTORES[actor]}`}
            >
              <span className="k">{actor}</span>
              {DESCRIPCION_ACTORES[actor]}
              <span className="n">{actorCounts[actor] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="acts">
        <button className="btn" type="button" onClick={onExpandAll}>
          Expandir todo
        </button>
        <button className="btn" type="button" onClick={onCollapseAll}>
          Contraer todo
        </button>
      </div>
    </div>
  );
};
