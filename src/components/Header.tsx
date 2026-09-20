import React from 'react';
import { EditorBar } from './EditorBar';
import { ExcelToolbar } from './ExcelToolbar';

interface HeaderProps {
  totalRamas: number;
  totalSubcategorias: number;
  totalEmpresas: number;
  onNavigateHome: () => void;
  currentPath: string;
  isEditor: boolean;
  onToggleEditorMode: (enabled: boolean) => void;
  onExportExcel: () => void;
  onExportPlantilla: () => void;
  onImportFileSelected: (file: File) => void;
  excelStatus?: { text: string; isError: boolean } | null;
}

export const Header: React.FC<HeaderProps> = ({
  totalRamas,
  totalSubcategorias,
  totalEmpresas,
  onNavigateHome,
  currentPath,
  isEditor,
  onToggleEditorMode,
  onExportExcel,
  onExportPlantilla,
  onImportFileSelected,
  excelStatus
}) => {
  const empresasTexto =
    totalEmpresas === 1
      ? '1 empresa registrada'
      : `${totalEmpresas} empresas registradas`;

  return (
    <header className="top">
      <h1>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
          title="Ir al inicio de la cadena"
        >
          Cadena de la construcción en Carabobo
        </a>
      </h1>

      <div
        className="stats"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '8px 16px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px' }}>
          <span>
            {totalRamas} ramas · {totalSubcategorias} subcategorías · {empresasTexto}
          </span>
          {' · '}
          <ExcelToolbar
            onExportExcel={onExportExcel}
            onExportPlantilla={onExportPlantilla}
            onImportFileSelected={onImportFileSelected}
            isEditor={isEditor}
            statusMessage={excelStatus}
          />
          {currentPath !== '/mapa' && (
            <>
              {' · '}
              <a
                href="#/mapa"
                className="btn"
                style={{ fontWeight: 600, color: 'var(--link)' }}
              >
                Ver mapa industrial ↗
              </a>
            </>
          )}
          {currentPath !== '/' && (
            <>
              {' · '}
              <button
                type="button"
                className="btn"
                onClick={onNavigateHome}
              >
                ← Volver a la Cadena
              </button>
            </>
          )}
        </div>

        <EditorBar
          isEditor={isEditor}
          onToggleEditorMode={onToggleEditorMode}
        />
      </div>
    </header>
  );
};
