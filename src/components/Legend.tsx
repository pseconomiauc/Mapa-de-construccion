import React from 'react';

export const Legend: React.FC = () => {
  return (
    <div className="legend">
      <b>Tipo de actor:</b>{' '}
      <span><span className="tg" title="Fabricante">F</span> = Fabricante</span> ·{' '}
      <span><span className="tg" title="Distribuidor">D</span> = Distribuidor</span> ·{' '}
      <span><span className="tg" title="Contratista">C</span> = Contratista</span> ·{' '}
      <span><span className="tg" title="Servicio profesional">S</span> = Servicio profesional</span> ·{' '}
      <span><span className="tg" title="Alquiler / logística">A</span> = Alquiler / logística</span>.{' '}
      <span>Dos letras (ej. <span className="tg">F/A</span>) significa que ambos tipos pueden ofrecerlo.</span>{' '}
      <b>Haz clic en cualquier subcategoría</b> para ver o registrar las empresas del sector.
    </div>
  );
};
