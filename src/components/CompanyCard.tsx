import React, { useState } from 'react';
import { Empresa } from '../types/database';

interface CompanyCardProps {
  empresa: Empresa;
  isEditor: boolean;
  onEdit: (empresa: Empresa) => void;
  onDelete: (empresaId: string) => Promise<void>;
}

export const CompanyCard: React.FC<CompanyCardProps> = ({
  empresa,
  isEditor,
  onEdit,
  onDelete
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = async () => {
    setDeleting(true);
    try {
      await onDelete(empresa.id);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const hasAnyData =
    empresa.direccion ||
    empresa.municipio ||
    (empresa.lat && empresa.lng) ||
    empresa.productos ||
    empresa.servicios ||
    empresa.marca ||
    empresa.telefono ||
    empresa.whatsapp ||
    empresa.correo ||
    empresa.revisar;

  const isUnverified = !empresa.contacto_verificado;
  const isGeneric = empresa.tipo_registro === 'referencia_generica';

  return (
    <article className="co" id={`empresa-${empresa.id}`}>
      <div className="coh">
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
          <h4>{empresa.nombre}</h4>
          {isGeneric && (
            <span className="badge-generico" title="Referencia genérica: identificar la empresa real">
              ⚠ Referencia genérica
            </span>
          )}
          {empresa.revisar && (
            <span className="badge-revisar" title={empresa.nota_revision || 'Marcado para revisión'}>
              🔍 Por revisar
            </span>
          )}
        </div>

        {isEditor && (
          <div className="cob">
            {confirmingDelete ? (
              <span>
                ¿Eliminar esta empresa?{' '}
                <button
                  type="button"
                  className="btn danger"
                  onClick={handleDeleteClick}
                  disabled={deleting}
                >
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>{' '}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => onEdit(empresa)}
                >
                  Editar
                </button>{' '}
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Eliminar
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {empresa.nota_revision && (
        <div className="revision-note-box">
          <b>Nota de calidad / revisión:</b> {empresa.nota_revision}
        </div>
      )}

      {hasAnyData ? (
        <dl>
          {empresa.direccion && (
            <>
              <dt>Dirección</dt>
              <dd>
                {empresa.direccion}
                {!empresa.direccion_precisa && (
                  <span className="badge-unverified" title="Dirección genérica o a nivel de municipio/estado. No georreferenciada con precisión.">
                    dirección genérica
                  </span>
                )}
              </dd>
            </>
          )}

          {empresa.municipio && (
            <>
              <dt>Municipio</dt>
              <dd>{empresa.municipio}</dd>
            </>
          )}

          {empresa.lat && empresa.lng && (
            <>
              <dt>Coordenadas</dt>
              <dd>
                {empresa.lat}, {empresa.lng}{' '}
                <a
                  href={`https://www.google.com/maps?q=${empresa.lat},${empresa.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '12px' }}
                >
                  (Ver en Google Maps)
                </a>
              </dd>
            </>
          )}

          {empresa.productos && (
            <>
              <dt>Productos</dt>
              <dd>{empresa.productos}</dd>
            </>
          )}

          {empresa.servicios && (
            <>
              <dt>Servicios</dt>
              <dd>{empresa.servicios}</dd>
            </>
          )}

          {empresa.marca && (
            <>
              <dt>Marca</dt>
              <dd>{empresa.marca}</dd>
            </>
          )}

          {empresa.telefono && (
            <>
              <dt>Teléfono</dt>
              <dd>
                <a href={`tel:${empresa.telefono.replace(/\s+/g, '')}`}>
                  {empresa.telefono}
                </a>
                {isUnverified && (
                  <span className="badge-unverified" title="Contacto sin verificar oficialmente">
                    sin verificar
                  </span>
                )}
              </dd>
            </>
          )}

          {empresa.whatsapp && (
            <>
              <dt>WhatsApp</dt>
              <dd>
                <a
                  href={`https://wa.me/${empresa.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {empresa.whatsapp}
                </a>
                {isUnverified && (
                  <span className="badge-unverified" title="WhatsApp sin verificar oficialmente">
                    sin verificar
                  </span>
                )}
              </dd>
            </>
          )}

          {empresa.correo && (
            <>
              <dt>Correo</dt>
              <dd>
                <a href={`mailto:${empresa.correo}`}>{empresa.correo}</a>
                {isUnverified && (
                  <span className="badge-unverified" title="Correo sin verificar oficialmente">
                    sin verificar
                  </span>
                )}
              </dd>
            </>
          )}

          {empresa.fuente && (
            <>
              <dt>Fuente</dt>
              <dd style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                {empresa.fuente.startsWith('http') ? (
                  <a href={empresa.fuente} target="_blank" rel="noopener noreferrer">
                    {empresa.fuente}
                  </a>
                ) : (
                  empresa.fuente
                )}
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="none">Sin datos adicionales cargados.</p>
      )}
    </article>
  );
};
