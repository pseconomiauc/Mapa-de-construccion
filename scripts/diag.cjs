const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, '..', 'cadena_construccion_clasificada.xlsx');
const workbook = xlsx.readFile(filePath);

console.log('Sheet names:', workbook.SheetNames);

const sheet1Name = workbook.SheetNames[0];
const sheet2Name = workbook.SheetNames[1];

const sheet1 = workbook.Sheets[sheet1Name];
const sheet2 = workbook.Sheets[sheet2Name];

const dataEmpresas = xlsx.utils.sheet_to_json(sheet1, { defval: '' });
const dataCategorias = xlsx.utils.sheet_to_json(sheet2, { defval: '' });

console.log('=== HOJA 1: ', sheet1Name, '===');
console.log('Columnas:', Object.keys(dataEmpresas[0] || {}));
console.log('Total filas:', dataEmpresas.length);

console.log('=== HOJA 2: ', sheet2Name, '===');
console.log('Columnas:', Object.keys(dataCategorias[0] || {}));
console.log('Total filas categorias:', dataCategorias.length);

fs.writeFileSync('scripts/diag_raw.json', JSON.stringify({
  sheet1Cols: Object.keys(dataEmpresas[0] || {}),
  sheet2Cols: Object.keys(dataCategorias[0] || {}),
  totalRowsEmpresas: dataEmpresas.length,
  totalRowsCategorias: dataCategorias.length,
  dataEmpresas,
  dataCategorias
}, null, 2));

console.log('Saved raw diag to scripts/diag_raw.json');
