const fs = require('fs');
const path = require('path');

const seedRaw = JSON.parse(fs.readFileSync('src/data/seedEmpresas.json', 'utf8'));
const { empresas, asociaciones } = seedRaw;

// 1. Nombres genéricos
const NOMBRES_GENERICOS = [
  "ferreteria y materiales de construccion en montalban (comercios locales y distribuidores)",
  "ferreteria y pinturas comercializadoras locales de bejuma",
  "ferreteria y materiales de construccion en la zona de bejuma",
  "suministros y materiales de construccion operando en la zona (ferremateriales locales)"
];

// Función para detectar números sospechosos
function isSuspiciousPhone(num) {
  if (!num) return false;
  const clean = num.replace(/\D/g, '');
  if (/1234|2345|3456|4567|5678|6789|4321/.test(clean)) return true;
  if (/0000|1111|2222|3333|4444|5555|6666|7777|8888|9999/.test(clean)) return true;
  if (/(\d)\1{3,}/.test(clean)) return true;
  if (/0001122|4332211|8710000|8712345|8381234|8301111|5611111|8324567|8321111|8661234|8341234|8615555|8081234|5651111|3720000/.test(clean)) return true;
  return false;
}

const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const reporteGenericos = [];
const reporteTelefonosSospechosos = [];
const reporteWhatsAppSospechosos = [];
const reporteDireccionesGenericas = [];
const reporteMariara = [];
const reporteExcelRevisar = [];

empresas.forEach(emp => {
  const normNom = norm(emp.nombre);
  const esGenerico = NOMBRES_GENERICOS.some(g => normNom.includes(g) || g.includes(normNom));

  const notas = [];

  // Regla 1: Referencia genérica
  if (esGenerico) {
    emp.tipo_registro = 'referencia_generica';
    emp.revisar = true;
    notas.push('Referencia genérica: identificar la empresa real');
    reporteGenericos.push({ id: emp.id, nombre: emp.nombre, motivo: 'Nombre genérico comercial' });
  } else {
    emp.tipo_registro = 'empresa';
  }

  // Regla 2: Teléfono sospechoso
  if (emp.telefono && isSuspiciousPhone(emp.telefono)) {
    emp.revisar = true;
    notas.push(`Teléfono con patrón sospechoso: ${emp.telefono}`);
    reporteTelefonosSospechosos.push({ id: emp.id, nombre: emp.nombre, telefono: emp.telefono });
  }

  // Regla 3: WhatsApp sospechoso
  if (emp.whatsapp && isSuspiciousPhone(emp.whatsapp)) {
    emp.revisar = true;
    notas.push(`WhatsApp con patrón sospechoso: ${emp.whatsapp}`);
    reporteWhatsAppSospechosos.push({ id: emp.id, nombre: emp.nombre, whatsapp: emp.whatsapp });
  }

  // Regla 4: Mariara
  if (emp.municipio === 'Diego Ibarra' && emp.nota_revision && emp.nota_revision.includes('Mariara')) {
    emp.revisar = true;
    notas.push('Municipio corregido de Mariara a Diego Ibarra');
    reporteMariara.push({ id: emp.id, nombre: emp.nombre });
  }

  // Regla 5: Dirección genérica
  if (!emp.direccion_precisa) {
    reporteDireccionesGenericas.push({ id: emp.id, nombre: emp.nombre, direccion: emp.direccion });
  }

  // Regla 6: Revisar original del Excel
  if (emp.revisar && emp.nota_revision && emp.nota_revision.includes('archivo fuente')) {
    reporteExcelRevisar.push({ id: emp.id, nombre: emp.nombre });
  }

  // Contacto verificado por defecto falso
  emp.contacto_verificado = false;
  if (!emp.fuente) emp.fuente = 'cadena_construccion_clasificada.xlsx';

  if (notas.length > 0) {
    emp.nota_revision = Array.from(new Set([...(emp.nota_revision ? [emp.nota_revision] : []), ...notas])).join('. ');
  }
});

// Guardar seed actualizado
fs.writeFileSync('src/data/seedEmpresas.json', JSON.stringify({
  totalRegistros: empresas.length,
  totalEmpresasReales: empresas.filter(e => e.tipo_registro === 'empresa').length,
  totalReferenciasGenericas: empresas.filter(e => e.tipo_registro === 'referencia_generica').length,
  totalAsociaciones: asociaciones.length,
  empresas,
  asociaciones
}, null, 2));

// Guardar reporte detallado
fs.writeFileSync('scripts/reporte_etapa4.json', JSON.stringify({
  totalRegistros: empresas.length,
  totalEmpresasReales: empresas.filter(e => e.tipo_registro === 'empresa').length,
  reporteGenericos,
  reporteTelefonosSospechosos,
  reporteWhatsAppSospechosos,
  reporteDireccionesGenericas,
  reporteMariara,
  totalRevisarFinal: empresas.filter(e => e.revisar).length,
  listaRevisarFinal: empresas.filter(e => e.revisar).map(e => ({
    id: e.id,
    nombre: e.nombre,
    tipo_registro: e.tipo_registro,
    nota_revision: e.nota_revision,
    telefono: e.telefono,
    whatsapp: e.whatsapp
  }))
}, null, 2));

console.log('Reporte Etapa 4 generado.');
console.log(`- Referencias genéricas: ${reporteGenericos.length}`);
console.log(`- Teléfonos sospechosos: ${reporteTelefonosSospechosos.length}`);
console.log(`- WhatsApp sospechosos: ${reporteWhatsAppSospechosos.length}`);
console.log(`- Direcciones genéricas: ${reporteDireccionesGenericas.length}`);
console.log(`- Total empresas/registros con revisar = true: ${empresas.filter(e => e.revisar).length}`);
console.log(`- Empresas reales: ${empresas.filter(e => e.tipo_registro === 'empresa').length}`);
