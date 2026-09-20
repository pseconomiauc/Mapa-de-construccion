const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Importar módulo de servicio
const { parseExcelFile } = require('../src/services/excelService');

// Cargar archivo original en memoria como buffer
const filePath = 'cadena_construccion_clasificada.xlsx';
const fileBuffer = fs.readFileSync(filePath);

// Simular objeto File de navegador
const mockFile = {
  name: 'cadena_construccion_clasificada.xlsx',
  arrayBuffer: async () => fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
};

async function runDemo() {
  console.log('=== DEMOSTRACIÓN IMPORTADOR ETAPA 6 ===');

  // PRUEBA 1: Importación inicial con base de datos vacía
  console.log('\n--- PRUEBA 1: Base de datos vacía ---');
  const result1 = await parseExcelFile(mockFile, []);
  console.log(`Total filas leídas del archivo: ${result1.totalRows}`);
  console.log(`Total empresas únicas consolidadas: ${result1.totalUniqueCompanies}`);
  console.log(`Empresas listas para insertar como nuevas: ${result1.readyToImport.length}`);
  console.log(`Empresas que ya existían: ${result1.existingMerged.length}`);
  console.log(`Empresas con bandera para revisión: ${result1.revisarRows.length}`);
  console.log(`Errores (filas rechazadas): ${result1.errors.length}`);
  console.log(`Avisos de advertencia: ${result1.warnings.length}`);

  // Simular la inserción en base de datos
  const mockDatabase = result1.readyToImport.map((item, idx) => ({
    id: `db-emp-${idx + 1}`,
    nombre: item.nombre,
    municipio: item.municipio,
    direccion: item.direccion,
    telefono: item.telefono,
    whatsapp: item.whatsapp,
    correo: item.correo,
    productos: item.productos,
    lat: item.lat,
    lng: item.lng,
    revisar: item.revisar,
    tipo_registro: item.tipo_registro,
    categoriaSlugs: item.categoriaSlugs
  }));

  // PRUEBA 2: Reimportar el mismo archivo sobre la base de datos poblada (Idempotencia / No duplicación)
  console.log('\n--- PRUEBA 2: Reimportar mismo archivo sobre base de datos poblada ---');
  const result2 = await parseExcelFile(mockFile, mockDatabase);
  console.log(`Total filas leídas del archivo: ${result2.totalRows}`);
  console.log(`Total empresas únicas consolidadas: ${result2.totalUniqueCompanies}`);
  console.log(`Empresas listas para insertar como nuevas: ${result2.readyToImport.length} (Esperado: 0)`);
  console.log(`Empresas existentes detectadas y combinadas: ${result2.existingMerged.length} (Esperado: 93)`);
  console.log(`Errores: ${result2.errors.length}`);

  if (result1.readyToImport.length === 93 && result2.readyToImport.length === 0 && result2.existingMerged.length === 93) {
    console.log('\n✅ DEMOSTRACIÓN EXITOSA: La importación es 100% idempotente y no genera empresas duplicadas.');
  } else {
    console.error('\n❌ Discrepancia en la prueba de idempotencia.');
  }
}

runDemo().catch(console.error);
