const fs = require('fs');
const path = require('path');

const diagRaw = JSON.parse(fs.readFileSync('scripts/diag_raw.json', 'utf8'));
const { dataEmpresas, dataCategorias } = diagRaw;

console.log('=== ANALISIS DE VERIFICACION DE CIFRAS ===');

// 1. Total filas y empresas distintas
const totalFilas = dataEmpresas.length;
const normName = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const empresasMap = new Map();
dataEmpresas.forEach((row, idx) => {
  const nName = normName(row['Empresa']);
  if (!empresasMap.has(nName)) {
    empresasMap.set(nName, { originalName: row['Empresa'], rows: [] });
  }
  empresasMap.get(nName).rows.push({ index: idx + 2, ...row });
});

console.log(`1. Filas totales: ${totalFilas}`);
console.log(`   Empresas distintas: ${empresasMap.size}`);

// 2. Ramas en Hoja 1
const ramasCount = {};
dataEmpresas.forEach(r => {
  const rama = r['Rama'];
  ramasCount[rama] = (ramasCount[rama] || 0) + 1;
});
console.log('2. Ramas en Hoja 1:', ramasCount);

// 3. Catalogo de Categorias
const ramasCat = new Set();
const gruposCat = new Set();
const subcatsCat = new Set();
const subcatCodes = new Map();

dataCategorias.forEach(c => {
  ramasCat.add(c['Código Rama'] + ' - ' + c['Nombre Rama']);
  gruposCat.add(c['Código Grupo'] + ' - ' + c['Nombre Grupo']);
  subcatsCat.add(c['Código Subcategoría'] + ' - ' + c['Nombre Subcategoría']);
  subcatCodes.set(c['Nombre Subcategoría'].trim(), c['Código Subcategoría']);
});

console.log(`3. Catálogo: ${ramasCat.size} ramas, ${gruposCat.size} grupos, ${subcatsCat.size} subcategorías`);

// Subcategorías con empresas
const subcatsConEmpresas = new Set();
dataEmpresas.forEach(r => {
  subcatsConEmpresas.add(r['Subcategoría'].trim());
});
console.log(`   Subcategorías con empresas en Hoja 1: ${subcatsConEmpresas.size}`);
console.log(`   Subcategorías vacías: ${subcatsCat.size - subcatsConEmpresas.size}`);

// 4. Columnas Servicios, Marca, Latitud, Longitud
let serviciosCount = 0, marcaCount = 0, latCount = 0, lonCount = 0;
let whatsappCount = 0, correoCount = 0;
dataEmpresas.forEach(r => {
  if (r['Servicios'] && r['Servicios'].toString().trim()) serviciosCount++;
  if (r['Marca'] && r['Marca'].toString().trim()) marcaCount++;
  if (r['Latitud'] && r['Latitud'].toString().trim()) latCount++;
  if (r['Longitud'] && r['Longitud'].toString().trim()) lonCount++;
  if (r['WhatsApp'] && r['WhatsApp'].toString().trim()) whatsappCount++;
  if (r['Correo'] && r['Correo'].toString().trim()) correoCount++;
});
console.log(`4. Vacíos: Servicios=${serviciosCount}, Marca=${marcaCount}, Latitud=${latCount}, Longitud=${lonCount}`);
console.log(`   Llenos: WhatsApp=${whatsappCount}, Correo=${correoCount}`);

// 5. Revisar = Sí
const filasRevisar = dataEmpresas.filter(r => (r['Revisar'] || '').toString().trim().toLowerCase() === 'sí' || (r['Revisar'] || '').toString().trim().toLowerCase() === 'si');
const empresasRevisar = new Set(filasRevisar.map(r => normName(r['Empresa'])));
console.log(`5. Filas Revisar=Sí: ${filasRevisar.length}, Empresas distintas a revisar: ${empresasRevisar.size}`);

// 6. Direcciones genéricas
const dirGenericas = dataEmpresas.filter(r => {
  const dir = (r['Dirección'] || '').trim();
  return /^Municipio\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+,\s*Estado\s*Carabobo\.?$/i.test(dir) || /^Municipio\s+/i.test(dir) && dir.split(',').length <= 2;
});
console.log(`6. Direcciones genéricas encontradas: ${dirGenericas.length}`);
console.log('   Muestras de direcciones genéricas:', dirGenericas.slice(0, 5).map(r => r['Dirección']));

// 7. Productos con texto repetido o unidos con " | "
const prodConPipe = dataEmpresas.filter(r => (r['Productos'] || '').includes('|'));
console.log(`7. Filas con ' | ' en Productos: ${prodConPipe.length}`);

// 8. 4 nombres genéricos
const nombresGenericos = [
  "Ferretería y Materiales de Construcción en Montalbán (Comercios locales y distribuidores)",
  "Ferretería y Pinturas Comercializadoras locales de Bejuma",
  "Ferretería y Materiales de Construcción en la zona de Bejuma",
  "Suministros y Materiales de Construcción operando en la zona (Ferremateriales locales)"
];
const foundGen = nombresGenericos.map(n => {
  const exists = dataEmpresas.find(r => r['Empresa'].trim() === n);
  return { nombre: n, existe: !!exists };
});
console.log('8. Nombres genéricos encontrados:', foundGen);

// 9. Municipio Mariara
const mariaraRows = dataEmpresas.filter(r => (r['Municipio'] || '').trim().toLowerCase() === 'mariara');
console.log(`9. Filas con municipio Mariara: ${mariaraRows.length}`, mariaraRows.map(r => ({ empresa: r['Empresa'], muni: r['Municipio'] })));

// 10. Teléfonos y WhatsApp con patrones sospechosos
const telefonosList = [];
dataEmpresas.forEach(r => {
  if (r['Teléfono'] && r['Teléfono'].toString().trim()) {
    telefonosList.push({ empresa: r['Empresa'], tel: r['Teléfono'].toString().trim() });
  }
});
const whatsappList = [];
dataEmpresas.forEach(r => {
  if (r['WhatsApp'] && r['WhatsApp'].toString().trim()) {
    whatsappList.push({ empresa: r['Empresa'], wa: r['WhatsApp'].toString().trim() });
  }
});

console.log(`10. Total pares empresa-teléfono: ${telefonosList.length}`);
console.log(`    Total WhatsApp: ${whatsappList.length}`);

// Patrón sospechoso regex
const isSuspiciousPhone = (num) => {
  const clean = num.replace(/\D/g, '');
  if (/1234|2345|3456|4567|5678|6789/.test(clean)) return true;
  if (/0000|1111|2222|3333|4444|5555|6666|7777|8888|9999/.test(clean)) return true;
  if (/(\d)\1{3,}/.test(clean)) return true;
  if (/0001122|4332211|8710000|8712345|8381234/.test(clean)) return true;
  return false;
};

const suspiciousTels = telefonosList.filter(t => isSuspiciousPhone(t.tel));
const suspiciousWAs = whatsappList.filter(w => isSuspiciousPhone(w.wa));
console.log(`    Teléfonos sospechosos: ${suspiciousTels.length}/${telefonosList.length}`);
console.log(`    WhatsApp sospechosos: ${suspiciousWAs.length}/${whatsappList.length}`);

// 11. Empresas con filas en varias subcategorías
const multiSubcatEmpresas = [];
for (const [norm, val] of empresasMap.entries()) {
  if (val.rows.length > 1) {
    multiSubcatEmpresas.push({
      empresa: val.originalName,
      totalFilas: val.rows.length,
      subcategorias: val.rows.map(r => r['Subcategoría'])
    });
  }
}
console.log(`11. Empresas con múltiples subcategorías: ${multiSubcatEmpresas.length}`);

// Guardar resultado detallado
fs.writeFileSync('scripts/diag_analisis.json', JSON.stringify({
  totalFilas,
  totalEmpresas: empresasMap.size,
  ramasCount,
  catalogo: {
    totalRamas: ramasCat.size,
    totalGrupos: gruposCat.size,
    totalSubcats: subcatsCat.size,
    subcatsConEmpresas: Array.from(subcatsConEmpresas),
    subcatsVaciasCount: subcatsCat.size - subcatsConEmpresas.size
  },
  vacias: { serviciosCount, marcaCount, latCount, lonCount },
  llenas: { whatsappCount, correoCount },
  revisar: { filas: filasRevisar.length, empresas: empresasRevisar.size, list: filasRevisar.map(r => ({ empresa: r['Empresa'], subcat: r['Subcategoría'] })) },
  dirGenericas: dirGenericas.map(r => ({ empresa: r['Empresa'], dir: r['Dirección'], muni: r['Municipio'] })),
  prodConPipe: prodConPipe.map(r => ({ empresa: r['Empresa'], prod: r['Productos'] })),
  nombresGenericos: foundGen,
  mariaraRows,
  telefonos: { total: telefonosList.length, sospechosos: suspiciousTels, todos: telefonosList },
  whatsapps: { total: whatsappList.length, sospechosos: suspiciousWAs, todos: whatsappList },
  multiSubcatEmpresas
}, null, 2));

console.log('Detalle guardado en scripts/diag_analisis.json');
