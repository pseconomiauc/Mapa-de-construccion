const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = path.join(__dirname, '..', 'cadena_construccion_clasificada.xlsx');
const workbook = xlsx.readFile(filePath);

const sheet2 = workbook.Sheets['Catálogo de Categorías'];
const rawCats = xlsx.utils.sheet_to_json(sheet2, { defval: '' });

console.log(`Leídas ${rawCats.length} filas del catálogo.`);

// Mapeo de actores por rama / grupo por defecto
const getActoresForSubcat = (ramaId, grupoCode) => {
  switch (ramaId) {
    case 1: return ['F'];
    case 2: return ['F'];
    case 3: 
      if (grupoCode === '3.4') return ['A'];
      return ['D'];
    case 4: return ['S'];
    case 5: return ['C'];
    case 6:
      if (grupoCode === '6.1' || grupoCode === '6.2') return ['F', 'A'];
      return ['F', 'S'];
    case 7: return ['S'];
    case 8:
      if (grupoCode === '8.2') return ['C'];
      if (grupoCode === '8.3') return ['F', 'S'];
      return ['S'];
    default: return ['F'];
  }
};

const branchesMap = new Map();
const allCategories = [];

rawCats.forEach(row => {
  const ramaId = Number(row['ID Rama']);
  const ramaCode = String(row['Código Rama']).trim();
  const ramaNombre = String(row['Nombre Rama']).trim().replace(/^\d+\.\s*/, ''); // quitar número inicial si se desea mostrar limpio o conservar

  const grupoId = Number(row['ID Grupo']);
  const grupoCode = String(row['Código Grupo']).trim();
  const grupoNombre = String(row['Nombre Grupo']).trim();

  const subcatId = Number(row['ID Subcategoría']);
  const subcatCode = String(row['Código Subcategoría']).trim();
  const subcatNombre = String(row['Nombre Subcategoría']).trim();

  const slug = subcatCode; // Clave primaria estable (ej: '1.1.1')
  const actores = getActoresForSubcat(ramaId, grupoCode);

  const catObj = {
    id: subcatId,
    codigo: subcatCode,
    slug: slug,
    rama_id: ramaId,
    rama_codigo: ramaCode,
    rama_nombre: String(row['Nombre Rama']).trim(),
    grupo_id: grupoId,
    grupo_codigo: grupoCode,
    grupo: grupoNombre,
    nombre: subcatNombre,
    actores: actores,
    orden: subcatId
  };

  allCategories.push(catObj);

  if (!branchesMap.has(ramaCode)) {
    branchesMap.set(ramaCode, {
      id: ramaId,
      code: ramaCode,
      name: String(row['Nombre Rama']).trim().replace(/^\d+\.\s*/, ''),
      fullName: String(row['Nombre Rama']).trim(),
      groups: new Map()
    });
  }

  const branch = branchesMap.get(ramaCode);
  if (!branch.groups.has(grupoCode)) {
    branch.groups.set(grupoCode, {
      id: grupoId,
      code: grupoCode,
      name: grupoNombre,
      tags: actores,
      leaf: false,
      items: []
    });
  }

  branch.groups.get(grupoCode).items.push({
    id: subcatId,
    code: subcatCode,
    slug: slug,
    nombre: subcatNombre,
    actores: actores,
    orden: subcatId,
    t: subcatNombre,
    tags: actores
  });
});

const branches = Array.from(branchesMap.values()).map(b => ({
  id: b.id,
  code: b.code,
  name: b.name,
  fullName: b.fullName,
  groups: Array.from(b.groups.values())
}));

const resultJson = {
  version: "2.0-excel",
  totalRamas: branches.length,
  totalGrupos: rawCats.reduce((acc, r) => acc.add(r['Código Grupo']), new Set()).size,
  totalSubcategorias: allCategories.length,
  branches,
  allCategories
};

fs.writeFileSync('src/data/categories.json', JSON.stringify(resultJson, null, 2));
console.log('src/data/categories.json generado con éxito.');
console.log(`Ramas: ${resultJson.totalRamas}, Grupos: ${resultJson.totalGrupos}, Subcategorías: ${resultJson.totalSubcategorias}`);

// Generar nuevo supabase_seed.sql
let seedSql = `-- ==============================================================================
-- DATOS SEMILLA: 8 RAMAS, 26 GRUPOS Y 76 SUBCATEGORÍAS (FUENTE DE VERDAD EXCEL)
-- ==============================================================================
-- Generado automáticamente desde cadena_construccion_clasificada.xlsx
-- ==============================================================================

TRUNCATE TABLE public.empresa_categorias CASCADE;
TRUNCATE TABLE public.categorias CASCADE;

INSERT INTO public.categorias (slug, rama_id, rama_nombre, grupo, nombre, actores, orden, codigo, rama_codigo, grupo_codigo, id_subcategoria, id_grupo)
VALUES
`;

const valuesArr = allCategories.map(c => {
  const actoresStr = `ARRAY[${c.actores.map(a => `'${a}'`).join(',')}]::text[]`;
  const escapeSql = s => s.replace(/'/g, "''");
  return `('${escapeSql(c.slug)}', ${c.rama_id}, '${escapeSql(c.rama_nombre)}', '${escapeSql(c.grupo)}', '${escapeSql(c.nombre)}', ${actoresStr}, ${c.orden}, '${escapeSql(c.codigo)}', '${escapeSql(c.rama_codigo)}', '${escapeSql(c.grupo_codigo)}', ${c.id}, ${c.grupo_id})`;
});

seedSql += valuesArr.join(',\n') + ';\n';

fs.writeFileSync('supabase_seed.sql', seedSql);
console.log('supabase_seed.sql generado con éxito.');
