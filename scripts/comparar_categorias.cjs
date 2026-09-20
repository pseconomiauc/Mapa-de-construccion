const fs = require('fs');
const path = require('path');

const diagRaw = JSON.parse(fs.readFileSync('scripts/diag_raw.json', 'utf8'));
const { dataEmpresas, dataCategorias } = diagRaw;
const currentCategories = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));

console.log('=== COMPARACION DE CATEGORIAS ===');
console.log('Actual en JSON/DB:', {
  totalBranches: currentCategories.branches ? currentCategories.branches.length : 0,
  totalCategories: currentCategories.allCategories ? currentCategories.allCategories.length : 0
});

// Estructura del nuevo catálogo
const newBranchesMap = new Map();
const newGroupsMap = new Map();
const newSubcats = [];

dataCategorias.forEach(row => {
  const ramaCode = row['Código Rama'].toString().trim();
  const ramaName = row['Nombre Rama'].toString().trim();
  const ramaId = row['ID Rama'];

  const grupoCode = row['Código Grupo'].toString().trim();
  const grupoName = row['Nombre Grupo'].toString().trim();
  const grupoId = row['ID Grupo'];

  const subcatCode = row['Código Subcategoría'].toString().trim();
  const subcatName = row['Nombre Subcategoría'].toString().trim();
  const subcatId = row['ID Subcategoría'];

  if (!newBranchesMap.has(ramaCode)) {
    newBranchesMap.set(ramaCode, { id: ramaId, code: ramaCode, name: ramaName, groups: new Map() });
  }
  const branch = newBranchesMap.get(ramaCode);
  if (!branch.groups.has(grupoCode)) {
    branch.groups.set(grupoCode, { id: grupoId, code: grupoCode, name: grupoName, subcats: [] });
  }
  branch.groups.get(grupoCode).subcats.push({ id: subcatId, code: subcatCode, name: subcatName });

  newSubcats.push({ id: subcatId, code: subcatCode, name: subcatName, rama: ramaName, grupo: grupoName });
});

console.log(`Nuevo catálogo Excel: ${newBranchesMap.size} ramas, ${dataCategorias.length} subcategorías`);

// Comparar ramas
const oldBranches = currentCategories.branches || [];
console.log('\n--- RAMAS ACTUALES (10) vs NUEVAS (8) ---');
oldBranches.forEach(b => {
  console.log(`Vieja Rama ${b.id}: "${b.name}"`);
});

console.log('\n--- RAMAS NUEVAS (8) ---');
for (const [code, b] of newBranchesMap.entries()) {
  console.log(`Nueva Rama ${code} (ID ${b.id}): "${b.name}"`);
}

// Comparar subcategorías
const oldSubcats = currentCategories.allCategories || [];
const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

const oldSubcatMap = new Map();
oldSubcats.forEach(c => {
  oldSubcatMap.set(norm(c.nombre), c);
});

const newSubcatMap = new Map();
newSubcats.forEach(c => {
  newSubcatMap.set(norm(c.name), c);
});

// Coincidencias exactas por nombre normalizado
const exactMatches = [];
const onlyInOld = [];
const onlyInNew = [];

newSubcats.forEach(n => {
  const nKey = norm(n.name);
  if (oldSubcatMap.has(nKey)) {
    exactMatches.push({ new: n, old: oldSubcatMap.get(nKey) });
  } else {
    onlyInNew.push(n);
  }
});

oldSubcats.forEach(o => {
  const oKey = norm(o.nombre);
  if (!newSubcatMap.has(oKey)) {
    onlyInOld.push(o);
  }
});

console.log(`\nCoincidencias exactas de nombre: ${exactMatches.length}`);
console.log(`Subcategorías solo en catálogo viejo (desaparecen o cambian de nombre): ${onlyInOld.length}`);
console.log(`Subcategorías solo en catálogo nuevo (nuevas o renombradas): ${onlyInNew.length}`);

fs.writeFileSync('scripts/comparacion_cat_detalle.json', JSON.stringify({
  exactMatches,
  onlyInOld,
  onlyInNew,
  newBranches: Array.from(newBranchesMap.values()).map(b => ({
    ...b,
    groups: Array.from(b.groups.values())
  }))
}, null, 2));

console.log('Comparación guardada en scripts/comparacion_cat_detalle.json');
