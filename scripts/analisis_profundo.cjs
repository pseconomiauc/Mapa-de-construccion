const fs = require('fs');

const diagRaw = JSON.parse(fs.readFileSync('scripts/diag_raw.json', 'utf8'));
const { dataEmpresas, dataCategorias } = diagRaw;
const currentCategories = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));

// 1. Análisis de direcciones genéricas
let dirGenericas = [];
let dirEspecificas = [];
dataEmpresas.forEach((r, idx) => {
  const dir = (r['Dirección'] || '').trim();
  const muni = (r['Municipio'] || '').trim();
  // Comprobamos si es genérica tipo "Municipio X, Estado Carabobo" o similar
  const esGenerica = /^Municipio\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+,\s*(?:Estado\s+)?Carabobo\.?$/i.test(dir) 
    || /^Municipio\s+[A-Za-zÁÉÍÓÚáéíóúñÑ\s]+$/i.test(dir)
    || dir.toLowerCase() === `municipio ${muni.toLowerCase()}, estado carabobo`
    || dir.toLowerCase() === `municipio ${muni.toLowerCase()}, carabobo`;
  
  if (esGenerica) {
    dirGenericas.push({ fila: idx + 2, empresa: r['Empresa'], municipio: muni, direccion: dir });
  } else {
    dirEspecificas.push({ fila: idx + 2, empresa: r['Empresa'], municipio: muni, direccion: dir });
  }
});

console.log(`Direcciones genéricas: ${dirGenericas.length}`);
console.log(`Direcciones específicas: ${dirEspecificas.length}`);

// Veamos si hay alguna otra que sea genérica
dataEmpresas.forEach((r, idx) => {
  const dir = (r['Dirección'] || '').trim();
  if (dir.length < 45 && !dirGenericas.some(g => g.fila === idx + 2)) {
    console.log(`Fila ${idx+2}: [${r['Municipio']}] "${dir}"`);
  }
});

// 2. Análisis de pares Empresa - Teléfono
const telPairs = [];
dataEmpresas.forEach((r, idx) => {
  const tel = (r['Teléfono'] || '').toString().trim();
  if (tel) {
    telPairs.push({ fila: idx + 2, empresa: r['Empresa'], telefono: tel });
  }
});
const uniqueEmpresasConTel = new Set(telPairs.map(t => t.empresa.trim().toLowerCase()));
console.log(`Pares fila-teléfono: ${telPairs.length}, Empresas únicas con teléfono: ${uniqueEmpresasConTel.size}`);

// WhatsApp
const waPairs = [];
dataEmpresas.forEach((r, idx) => {
  const wa = (r['WhatsApp'] || '').toString().trim();
  if (wa) {
    waPairs.push({ fila: idx + 2, empresa: r['Empresa'], whatsapp: wa });
  }
});
const uniqueEmpresasConWa = new Set(waPairs.map(w => w.empresa.trim().toLowerCase()));
console.log(`Pares fila-WhatsApp: ${waPairs.length}, Empresas únicas con WhatsApp: ${uniqueEmpresasConWa.size}`);

// Correos
const corPairs = [];
dataEmpresas.forEach((r, idx) => {
  const cor = (r['Correo'] || '').toString().trim();
  if (cor) {
    corPairs.push({ fila: idx + 2, empresa: r['Empresa'], correo: cor });
  }
});
console.log(`Pares fila-Correo: ${corPairs.length}`);

// 3. Incoherencias de clasificación detectadas
const incoherencias = [];
dataEmpresas.forEach((r, idx) => {
  const emp = r['Empresa'] || '';
  const subcat = r['Subcategoría'] || '';
  const muni = r['Municipio'] || '';
  const dir = r['Dirección'] || '';
  const prod = r['Productos'] || '';

  // Concroca
  if (emp.toLowerCase().includes('concroca') || emp.toLowerCase().includes('concretera de occidente')) {
    incoherencias.push({
      fila: idx + 2,
      empresa: emp,
      motivo: `Subcategoría asignada "${subcat}", pero en Productos dice "${prod}", Municipio "${muni}", y Dirección menciona "${dir}".`
    });
  }

  // Verificar si hay otras discrepancias evidentes
  if (subcat.toLowerCase().includes('acero') && prod.toLowerCase().includes('pintura')) {
    incoherencias.push({ fila: idx + 2, empresa: emp, motivo: `Subcategoría ${subcat} pero producto menciona pintura` });
  }
});

// Guardar todo para el informe
fs.writeFileSync('scripts/diag_final.json', JSON.stringify({
  dirGenericas,
  dirEspecificas,
  telPairs,
  waPairs,
  corPairs,
  incoherencias
}, null, 2));
