import React from 'react';

interface AdminTabsProps {
  currentPath: string;
}

export const AdminTabs: React.FC<AdminTabsProps> = ({ currentPath }) => {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    fontSize: '13.5px',
    fontWeight: 600,
    textDecoration: 'none',
    color: active ? 'var(--ink)' : 'var(--link)',
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    background: 'transparent'
  });

  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--line)',
        marginBottom: '18px'
      }}
    >
      <a href="#/admin" style={tabStyle(currentPath === '/admin')}>
        Panel de gestión de empresas
      </a>
      <a href="#/admin/busqueda" style={tabStyle(currentPath === '/admin/busqueda')}>
        Panel de gestión de búsqueda
      </a>
    </div>
  );
};
