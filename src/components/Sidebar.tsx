import React from 'react';
import { RamaItem } from '../data/cadenaData';

interface SidebarProps {
  branches: RamaItem[];
  selectedBranchId: number | 'all';
  onSelectBranch: (branchId: number | 'all') => void;
  branchCounts: Record<number, number>;
  totalSubcategories: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  branches,
  selectedBranchId,
  onSelectBranch,
  branchCounts,
  totalSubcategories
}) => {
  return (
    <nav className="branches" aria-label="Ramas de la cadena">
      <button
        type="button"
        className="nb"
        aria-current={selectedBranchId === 'all' ? 'true' : undefined}
        onClick={() => onSelectBranch('all')}
      >
        <span className="num">★</span>
        <span className="name">Todas las ramas</span>
        <span className="cnt">{totalSubcategories}</span>
      </button>

      {branches.map((b) => {
        const count = branchCounts[b.id] ?? 0;
        const isSelected = selectedBranchId === b.id;
        const isZero = count === 0;

        return (
          <button
            key={b.id}
            type="button"
            className={`nb ${isZero ? 'zero' : ''}`}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelectBranch(b.id)}
            title={b.name}
          >
            <span className="num">{b.id}.</span>
            <span className="name">{b.name}</span>
            <span className="cnt">{count}</span>
          </button>
        );
      })}
    </nav>
  );
};
