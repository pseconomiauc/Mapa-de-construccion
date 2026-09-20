const fs = require('fs');

const diagRaw = JSON.parse(fs.readFileSync('scripts/diag_raw.json', 'utf8'));
const { dataCategorias } = diagRaw;
const currentCategories = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));

const oldCats = currentCategories.allCategories || [];
const newCats = dataCategorias;

const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Tabla detallada de nuevas subcategorías y su correspondencia con las viejas
const reportCategories = newCats.map(nc => {
  const nName = nc['Nombre Subcategoría'].trim();
  const nCode = nc['Código Subcategoría'].trim();
  const nRama = nc['Nombre Rama'].trim();
  const nGrupo = nc['Nombre Grupo'].trim();

  // Buscar coincidencia exacta o cercana en oldCats
  const exact = oldCats.find(oc => norm(oc.nombre) === norm(nName));
  let matchType = 'NUEVA';
  let oldInfo = null;

  if (exact) {
    matchType = 'CONSERVA_NOMBRE';
    oldInfo = { slug: exact.slug, nombre: exact.nombre, rama: exact.rama_nombre, grupo: exact.grupo };
  } else {
    // Buscar similitud
    const similar = oldCats.find(oc => {
      const oNorm = norm(oc.nombre);
      const nNorm = norm(nName);
      return (oNorm.includes(nNorm.slice(0, 8)) || nNorm.includes(oNorm.slice(0, 8))) && oc.rama_id === nc['ID Rama'];
    });
    if (similar) {
      matchType = 'RENOMBRADA / AJUSTADA';
      oldInfo = { slug: similar.slug, nombre: similar.nombre, rama: similar.rama_nombre, grupo: similar.grupo };
    }
  }

  return {
    codigo: nCode,
    nombre: nName,
    rama: nRama,
    grupo: nGrupo,
    matchType,
    oldInfo
  };
});

// Viejas que desaparecen
const disappearingOld = oldCats.filter(oc => {
  if (oc.rama_id === 9 || oc.rama_id === 10) return true;
  const isUsed = reportCategories.some(rc => rc.oldInfo && rc.oldInfo.slug === oc.slug);
  return !isUsed;
});

fs.writeFileSync('scripts/cat_report.json', JSON.stringify({
  reportCategories,
  disappearingOld: disappearingOld.map(o => ({ slug: o.slug, nombre: o.nombre, rama: o.rama_nombre, grupo: o.grupo, rama_id: o.rama_id }))
}, null, 2));

console.log('Reporte de categorías generado. Viejas eliminadas/no mapeadas:', disappearingOld.length);
