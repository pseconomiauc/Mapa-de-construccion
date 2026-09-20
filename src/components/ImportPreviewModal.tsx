import React, { useState } from 'react';
import { ImportValidationResult } from '../services/excelService';

interface ImportPreviewModalProps {
  fileName: string;
  result: ImportValidationResult;
  onConfirmImport: (
    onProgress: (current: number, total: number) => void
  ) => Promise<void>;
  onClose: () => void;
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  fileName,
  result,
  onConfirmImport,
  onClose
}) => {
  const [importing, setImporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [finished, setFinished] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const totalToProcess = result.readyToImport.length + result.existingMerged.length;

  const handleStartImport = async () => {
    setImporting(true);
    setErrorStatus(null);

    try {
      await onConfirmImport((current, total) => {
        setProgressText(`Importando ${current} de ${total}…`);
      });
      setFinished(true);
      setProgressText(`¡Listo! Se procesaron ${totalToProcess} empresas correctamente.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorStatus(`La importación se detuvo: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="impbox" style={{ margin: '14px 0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <b>{fileName}</b> · {result.totalRows} {result.totalRows === 1 ? 'fila leída' : 'filas leídas'}
        {!importing && (
          <button type="button" className="btn" onClick={onClose} style={{ fontSize: '12px' }}>
            ✕ Cerrar
          </button>
        )}
      </div>

      <ul style={{ margin: '6px 0 10px 22px', fontSize: '13.5px', lineHeight: '1.6' }}>
        <li>
          <b>{result.readyToImport.length}</b> {result.readyToImport.length === 1 ? 'empresa nueva lista' : 'empresas nuevas listas'} para registrar.
        </li>

        {result.existingMerged.length > 0 && (
          <li>
            <b>{result.existingMerged.length}</b> empresas existentes que se combinarán (agregándoles sus nuevas subcategorías sin duplicar).
          </li>
        )}

        {result.revisarRows.length > 0 && (
          <li style={{ color: '#856404' }}>
            <b>{result.revisarRows.length}</b> empresas marcadas para revisión (datos de contacto no verificados, referencias genéricas o municipio Mariara).
          </li>
        )}

        {result.warnings && result.warnings.length > 0 && (
          <li style={{ color: 'var(--muted)' }}>
            <b>{result.warnings.length}</b> avisos de corrección automática (ej: Rama/Grupo inferidos o ajustados a la subcategoría).
          </li>
        )}

        {result.errors.length > 0 && (
          <li className="bad" style={{ color: 'var(--danger)' }}>
            <b>{result.errors.length}</b> {result.errors.length === 1 ? 'fila con problemas que se omitirá' : 'filas con problemas que se omitirán'}:
            <ul style={{ maxHeight: '140px', overflowY: 'auto', margin: '4px 0 4px 18px', fontSize: '13px' }}>
              {result.errors.map((err, idx) => (
                <li key={idx}>
                  Fila {err.row} ({err.empresa}): {err.reason}
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>

      {progressText && (
        <div
          style={{
            margin: '8px 0',
            fontSize: '13.5px',
            color: errorStatus ? 'var(--danger)' : 'var(--success)',
            fontWeight: 500
          }}
        >
          {progressText}
        </div>
      )}

      {errorStatus && (
        <div style={{ margin: '8px 0', fontSize: '13px', color: 'var(--danger)' }}>
          {errorStatus}
        </div>
      )}

      <div className="frow" style={{ marginTop: '10px' }}>
        {!finished && totalToProcess > 0 && (
          <button
            type="button"
            className="primary"
            onClick={handleStartImport}
            disabled={importing}
          >
            {importing
              ? 'Procesando importación...'
              : `Confirmar e Importar ${totalToProcess} ${totalToProcess === 1 ? 'empresa' : 'empresas'}`}
          </button>
        )}

        <button
          type="button"
          className="btn"
          onClick={onClose}
          disabled={importing}
        >
          {finished || totalToProcess === 0 ? 'Cerrar' : 'Cancelar'}
        </button>
      </div>
    </div>
  );
};
