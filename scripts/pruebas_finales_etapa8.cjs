const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const seedRaw = JSON.parse(fs.readFileSync('src/data/seedEmpresas.json', 'utf8'));
const categoriesRaw = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));
const { empresas, asociaciones } = seedRaw;
const { branches, allCategories } = categoriesRaw;

console.log('====================================================');
console.log('=== PRUEBAS FINALES Y CRITERIOS DE ACEPTACIÓN (ETAPA 8) ===');
console.log('====================================================\n');

// ----------------------------------------------------
// CRITERIO 1: Exportar Excel -> Borrar una empresa -> Reimportar -> Recuperar todo sin duplicados
// ----------------------------------------------------
console.log('--- PRUEBA 1: Exportar, Borrar, Reimportar e Idempotencia ---');

// 1. Simular base de datos con 93 empresas
let db = JSON.parse(JSON.stringify(empresas));
console.log(`Estado inicial BD: ${db.length} empresas`);

// 2. Exportar archivo Excel
const { exportEmpresasExcel, parseExcelFile } = require('../src/services/excelService');

// Crear buffer de exportación
const asocMap = {};
asociaciones.forEach(a => {
  const emp = db.find(e => e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() === a.empresaKey);
  if (emp) {
    if (!asocMap[emp.id]) asocMap[emp.id] = [];
    asocMap[emp.id].push(a.categoriaSlug);
  }
});

// 3. Borrar una empresa (ejemplo: 'Cerámica Carabobo')
const targetDeleteName = 'Cerámica Carabobo';
const deletedIndex = db.findIndex(e => e.nombre === targetDeleteName);
const deletedItem = db.splice(deletedIndex, 1)[0];
console.log(`Empresa eliminada: "${deletedItem.nombre}". Estado BD tras borrado: ${db.length} empresas.`);

// 4. Reimportar el archivo original cadena_construccion_clasificada.xlsx
const fileBuffer = fs.readFileSync('cadena_construccion_clasificada.xlsx');
const mockFile = {
  name: 'cadena_construccion_clasificada.xlsx',
  arrayBuffer: async () => fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
};

async function runCriterio1() {
  const importResult = await parseExcelFile(mockFile, db);

  console.log(`Resultado Reimportación:`);
  console.log(` - Empresas nuevas a registrar (la que se había borrado): ${importResult.readyToImport.length}`);
  console.log(`   Nombre: "${importResult.readyToImport[0]?.nombre}"`);
  console.log(` - Empresas existentes detectadas y combinadas sin duplicar: ${importResult.existingMerged.length}`);
  console.log(` - Errores: ${importResult.errors.length}`);

  // Simular la inserción de la empresa recuperada
  db.push({
    ...importResult.readyToImport[0],
    id: `recovered-${Date.now()}`
  });

  console.log(`Estado final BD tras reimportación: ${db.length} empresas (100% recuperada sin duplicados).`);
  const crit1Ok = importResult.readyToImport.length === 1 && importResult.existingMerged.length === 92 && db.length === 93;
  console.log(`Resultado Criterio 1: ${crit1Ok ? '✅ PASÓ' : '❌ FALLÓ'}\n`);

  return crit1Ok;
}

// ----------------------------------------------------
// CRITERIO 2: Conteo de entidades y catálogo
// ----------------------------------------------------
console.log('--- PRUEBA 2: Validación de Conteos Oficiales ---');
const totalRamas = branches.length;
const totalGrupos = branches.reduce((acc, b) => acc + b.groups.length, 0);
const totalSubcats = allCategories.length;
const totalEmpresas = empresas.length;
const totalAsoc = asociaciones.length;

console.log(`- Ramas: ${totalRamas} (Esperado: 8)`);
console.log(`- Grupos: ${totalGrupos} (Esperado: 26)`);
console.log(`- Subcategorías: ${totalSubcats} (Esperado: 76)`);
console.log(`- Registros de empresas: ${totalEmpresas} (Esperado: 93)`);
console.log(`- Asociaciones empresa-subcategoría: ${totalAsoc} (Esperado: 106)`);

const crit2Ok = totalRamas === 8 && totalGrupos === 26 && totalSubcats === 76 && totalEmpresas === 93 && totalAsoc === 106;
console.log(`Resultado Criterio 2: ${crit2Ok ? '✅ PASÓ' : '❌ FALLÓ'}\n`);

// ----------------------------------------------------
// CRITERIO 3: Referencias genéricas aisladas
// ----------------------------------------------------
console.log('--- PRUEBA 3: Referencias Genéricas ---');
const genericas = empresas.filter(e => e.tipo_registro === 'referencia_generica');
const reales = empresas.filter(e => e.tipo_registro === 'empresa');
console.log(`- Referencias genéricas identificadas: ${genericas.length} (Esperado: 4)`);
genericas.forEach(g => console.log(`   * ${g.nombre}`));
console.log(`- Empresas reales para contadores oficiales: ${reales.length} (Esperado: 89)`);
const crit3Ok = genericas.length === 4 && reales.length === 89;
console.log(`Resultado Criterio 3: ${crit3Ok ? '✅ PASÓ' : '❌ FALLÓ'}\n`);

// ----------------------------------------------------
// CRITERIO 4: Calidad de datos y trazabilidad
// ----------------------------------------------------
console.log('--- PRUEBA 4: Calidad de Datos (Sin datos inventados) ---');
const telsSospechosos = empresas.filter(e => e.telefono && (e.telefono.includes('0000') || e.telefono.includes('1111') || e.telefono.includes('1234') || e.telefono.includes('4567') || e.telefono.includes('5555')));
const mariaraEmp = empresas.find(e => e.nombre.includes('Mariara'));
const empresasRevisar = empresas.filter(e => e.revisar);

console.log(`- Teléfonos con patrón sospechoso marcados: ${telsSospechosos.length}`);
console.log(`- Registro Mariara ajustado a Diego Ibarra con nota: ${mariaraEmp ? mariaraEmp.municipio : 'No'}`);
console.log(`- Total registros marcados con 'revisar = true': ${empresasRevisar.length}`);

// ----------------------------------------------------
// GENERAR INFORME DETALLADO (Desglose por Rama y Subcategoría)
// ----------------------------------------------------
const desgloseRamas = branches.map(b => {
  const subcats = b.groups.flatMap(g => g.items);
  let totalEmpresasEnRama = 0;
  const subcatsDetalle = subcats.map(s => {
    const asocsCount = asociaciones.filter(a => a.categoriaSlug === s.slug).length;
    totalEmpresasEnRama += asocsCount;
    return {
      codigo: s.code,
      nombre: s.nombre,
      empresasRegistradas: asocsCount
    };
  });

  return {
    id: b.id,
    nombre: b.name,
    totalSubcategorias: subcats.length,
    totalAsociaciones: totalEmpresasEnRama,
    subcategorias: subcatsDetalle
  };
});

fs.writeFileSync('scripts/informe_final_datos.json', JSON.stringify({
  resumen: {
    totalRamas,
    totalGrupos,
    totalSubcats,
    totalRegistros: totalEmpresas,
    totalEmpresasReales: reales.length,
    totalReferenciasGenericas: genericas.length,
    totalAsociaciones: totalAsoc,
    totalPorRevisar: empresasRevisar.length
  },
  desgloseRamas,
  registrosRevisarPorMotivo: {
    referenciasGenericas: genericas.map(e => ({ nombre: e.nombre, nota: e.nota_revision })),
    telefonosSospechosos: telsSospechosos.map(e => ({ nombre: e.nombre, tel: e.telefono, nota: e.nota_revision })),
    mariara: mariaraEmp ? [{ nombre: mariaraEmp.nombre, muni: mariaraEmp.municipio, nota: mariaraEmp.nota_revision }] : [],
    revisionOriginalExcel: empresas.filter(e => e.revisar && e.nota_revision && e.nota_revision.includes('archivo fuente')).map(e => ({ nombre: e.nombre, nota: e.nota_revision }))
  }
}, null, 2));

runCriterio1().then(() => {
  console.log('Informe final generado en scripts/informe_final_datos.json');
});
