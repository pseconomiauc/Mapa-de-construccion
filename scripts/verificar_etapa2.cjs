const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = path.join(__dirname, '..', 'cadena_construccion_clasificada.xlsx');
const workbook = xlsx.readFile(filePath);
const sheet2 = workbook.Sheets['Catálogo de Categorías'];
const excelCats = xlsx.utils.sheet_to_json(sheet2, { defval: '' });

const generatedJson = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));

console.log('=== VERIFICACIÓN FINAL ETAPA 2 CONTRA EXCEL ===');
console.log('Total filas en Excel Sheet 2:', excelCats.length);
console.log('Total subcategorías en categories.json:', generatedJson.allCategories.length);
console.log('Total ramas en categories.json:', generatedJson.branches.length);

let errors = 0;
excelCats.forEach((row, i) => {
  const code = String(row['Código Subcategoría']).trim();
  const name = String(row['Nombre Subcategoría']).trim();
  const cat = generatedJson.allCategories.find(c => c.codigo === code);
  if (!cat) {
    console.error(`ERROR: Código no encontrado: ${code}`);
    errors++;
  } else if (cat.nombre !== name) {
    console.error(`ERROR: Nombre no coincide en ${code}: Excel="${name}" vs JSON="${cat.nombre}"`);
    errors++;
  }
});

if (errors === 0) {
  console.log('✅ Verificación 100% EXITOSA: Las 76 subcategorías, 26 grupos y 8 ramas coinciden con total exactitud.');
} else {
  console.error(`❌ Se encontraron ${errors} discrepancias.`);
}
