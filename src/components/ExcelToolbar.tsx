import React, { useRef } from 'react';

interface ExcelToolbarProps {
  onExportExcel: () => void;
  onExportPlantilla: () => void;
  onImportFileSelected: (file: File) => void;
  isEditor: boolean;
  statusMessage?: { text: string; isError: boolean } | null;
}

export const ExcelToolbar: React.FC<ExcelToolbarProps> = ({
  onExportExcel,
  onExportPlantilla,
  onImportFileSelected,
  isEditor,
  statusMessage
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFileSelected(file);
    }
    // Limpiar input para permitir seleccionar el mismo archivo de nuevo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px', fontSize: '13px' }}>
      <button
        type="button"
        className="btn"
        onClick={onExportExcel}
        title="Descargar listado completo de empresas y catálogo en Excel"
      >
        Descargar Excel
      </button>

      {' · '}

      {isEditor ? (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            title="Importar empresas desde archivo Excel o CSV"
          >
            Importar Excel
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {' · '}
        </>
      ) : null}

      <button
        type="button"
        className="btn"
        onClick={onExportPlantilla}
        title="Descargar plantilla de Excel vacía con subcategorías válidas"
      >
        Plantilla
      </button>

      {statusMessage && (
        <span
          style={{
            marginLeft: '6px',
            fontSize: '12.5px',
            color: statusMessage.isError ? 'var(--danger)' : 'var(--success)'
          }}
        >
          {statusMessage.text}
        </span>
      )}
    </div>
  );
};
