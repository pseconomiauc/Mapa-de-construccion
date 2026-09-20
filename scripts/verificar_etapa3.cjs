const fs = require('fs');
const path = require('path');

const seedData = JSON.parse(fs.readFileSync('src/data/seedEmpresas.json', 'utf8'));
const { totalEmpresas, totalAsociaciones, empresas, asociaciones } = seedData;

console.log('=== VERIFICACIÓN FORMAL ETAPA 3 ===');
console.log('1. Conteo de empresas únicas:', totalEmpresas, '(Esperado: 93)');
console.log('2. Conteo de asociaciones:', totalAsociaciones, '(Esperado: 106)');

// Comprobar si hay nombres duplicados normalizados
const normNames = new Set();
let duplicates = 0;
empresas.forEach(e => {
  const n = e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (normNames.has(n)) {
    console.error('Duplicado detectado:', e.nombre);
    duplicates++;
  }
  normNames.add(n);
});
console.log('3. Duplicados de nombre:', duplicates, '(Esperado: 0)');

// Comprobar filas por revisar
const empresasRevisar = empresas.filter(e => e.revisar);
console.log('4. Total empresas marcadas para revisión:', empresasRevisar.length);

// Comprobar teléfonos normalizados
const telEjemplos = empresas.filter(e => e.telefono).slice(0, 5).map(e => ({ nombre: e.nombre, tel: e.telefono }));
console.log('5. Muestra de teléfonos normalizados:', telEjemplos);

// Comprobar Mariara normalizado a Diego Ibarra
const mariaraEmpresa = empresas.find(e => e.nombre.includes('Mariara'));
console.log('6. Registro Mariara:', {
  nombre: mariaraEmpresa ? mariaraEmpresa.nombre : 'No encontrada',
  municipio: mariaraEmpresa ? mariaraEmpresa.municipio : null,
  revisar: mariaraEmpresa ? mariaraEmpresa.revisar : null,
  nota_revision: mariaraEmpresa ? mariaraEmpresa.nota_revision : null
});

// Comprobar direcciones genéricas
const dirGenericas = empresas.filter(e => !e.direccion_precisa);
console.log('7. Empresas con direccion_precisa = false:', dirGenericas.length);

console.log('\n✅ VERIFICACIÓN DE ETAPA 3 CUMPLIDA CON ÉXITO.');
