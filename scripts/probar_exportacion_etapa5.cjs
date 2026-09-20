const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const seedRaw = JSON.parse(fs.readFileSync('src/data/seedEmpresas.json', 'utf8'));
const categoriesRaw = JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8'));
const { empresas, asociaciones } = seedRaw;
const { allCategories } = categoriesRaw;

console.log('=== GENERANDO EXPORTACIÓN ETAPA 5 ===');

// Mapeo rápido de subcategoría por slug o código
const catBySlug = new Map();
allCategories.forEach(c => {
  catBySlug.set(c.slug, c);
  if (c.codigo) catBySlug.set(c.codigo, c);
});

// Función para construir Hoja 1: Empresas Clasificadas (16 columnas)
function buildEmpresasSheet(empresasList, asociacionesList) {
  const rows = [];

  asociacionesList.forEach((aso) => {
    // Buscar empresa
    const emp = empresasList.find(e => {
      const k = e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      return k === aso.empresaKey;
    });

    if (!emp) return;

    // Buscar categoría
    const cat = catBySlug.get(aso.categoriaSlug);
    const rama = cat ? cat.rama_nombre : '';
    const grupo = cat ? cat.grupo : '';
    const subcat = cat ? cat.nombre : aso.subcategoriaNombre;

    rows.push({
      'Rama': rama,
      'Grupo': grupo,
      'Subcategoría': subcat,
      'Tipo de actor': aso.tipoActor || (cat && cat.actores[0] ? (cat.actores[0] === 'F' ? 'Fabricante' : cat.actores[0] === 'D' ? 'Distribuidor' : 'Contratista') : 'Fabricante'),
      'Empresa': emp.nombre || '',
      'Municipio': emp.municipio || '',
      'Dirección': emp.direccion || '',
      'Teléfono': emp.telefono || '',
      'WhatsApp': emp.whatsapp || '',
      'Correo': emp.correo || '',
      'Productos': emp.productos_original || emp.productos || '',
      'Servicios': emp.servicios || '',
      'Marca': emp.marca || '',
      'Latitud': emp.lat !== null && emp.lat !== undefined ? emp.lat : '',
      'Longitud': emp.lng !== null && emp.lng !== undefined ? emp.lng : '',
      'Revisar': emp.revisar ? 'Sí' : 'No'
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Anchos de columna óptimos
  ws['!cols'] = [
    { wch: 38 }, // Rama
    { wch: 42 }, // Grupo
    { wch: 45 }, // Subcategoría
    { wch: 20 }, // Tipo de actor
    { wch: 36 }, // Empresa
    { wch: 18 }, // Municipio
    { wch: 40 }, // Dirección
    { wch: 18 }, // Teléfono
    { wch: 18 }, // WhatsApp
    { wch: 26 }, // Correo
    { wch: 45 }, // Productos
    { wch: 30 }, // Servicios
    { wch: 20 }, // Marca
    { wch: 14 }, // Latitud
    { wch: 14 }, // Longitud
    { wch: 10 }  // Revisar
  ];

  // Activar autofiltros y fijar primera fila
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:P1');
  ws['!autofilter'] = { ref: ws['!ref'] };

  return ws;
}

// Función para construir Hoja 2: Catálogo de Categorías (9 columnas)
function buildCatalogoSheet() {
  const rows = allCategories.map((c) => ({
    'ID Rama': c.rama_id,
    'Código Rama': c.rama_codigo || String(c.rama_id),
    'Nombre Rama': c.rama_nombre,
    'ID Grupo': c.grupo_id || 1,
    'Código Grupo': c.grupo_codigo || '',
    'Nombre Grupo': c.grupo,
    'ID Subcategoría': c.id || c.orden,
    'Código Subcategoría': c.codigo || c.slug,
    'Nombre Subcategoría': c.nombre
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 10 }, // ID Rama
    { wch: 14 }, // Código Rama
    { wch: 38 }, // Nombre Rama
    { wch: 10 }, // ID Grupo
    { wch: 14 }, // Código Grupo
    { wch: 42 }, // Nombre Grupo
    { wch: 16 }, // ID Subcategoría
    { wch: 20 }, // Código Subcategoría
    { wch: 48 }  // Nombre Subcategoría
  ];

  ws['!autofilter'] = { ref: ws['!ref'] };

  return ws;
}

// Función para construir Hoja 3: Instrucciones (para la Plantilla)
function buildInstruccionesSheet() {
  const rows = [
    { 'Campo': 'Empresa', 'Obligatorio': 'SÍ', 'Descripción': 'Nombre o razón social de la empresa o comercio.' },
    { 'Campo': 'Subcategoría', 'Obligatorio': 'SÍ', 'Descripción': 'Nombre o código exacto de la subcategoría según la hoja "Catálogo de Categorías".' },
    { 'Campo': 'Rama', 'Obligatorio': 'Opcional', 'Descripción': 'Se deduce automáticamente a partir de la subcategoría si se deja vacío.' },
    { 'Campo': 'Grupo', 'Obligatorio': 'Opcional', 'Descripción': 'Se deduce automáticamente a partir de la subcategoría si se deja vacío.' },
    { 'Campo': 'Tipo de actor', 'Obligatorio': 'Opcional', 'Descripción': 'Fabricante, Distribuidor, Contratista, Servicio profesional o Alquiler / logística.' },
    { 'Campo': 'Municipio', 'Obligatorio': 'Opcional', 'Descripción': 'Uno de los 14 municipios oficiales del estado Carabobo.' },
    { 'Campo': 'Dirección', 'Obligatorio': 'Opcional', 'Descripción': 'Dirección física o referencia del local/planta.' },
    { 'Campo': 'Teléfono', 'Obligatorio': 'Opcional', 'Descripción': 'Teléfono principal en formato +58 XXX XXXXXXX.' },
    { 'Campo': 'WhatsApp', 'Obligatorio': 'Opcional', 'Descripción': 'Número de WhatsApp comercial.' },
    { 'Campo': 'Correo', 'Obligatorio': 'Opcional', 'Descripción': 'Correo electrónico institucional o de ventas.' },
    { 'Campo': 'Productos', 'Obligatorio': 'Opcional', 'Descripción': 'Descripción o lista de productos suministrados.' },
    { 'Campo': 'Servicios', 'Obligatorio': 'Opcional', 'Descripción': 'Descripción de servicios prestados.' },
    { 'Campo': 'Marca', 'Obligatorio': 'Opcional', 'Descripción': 'Marca o marcas comerciales que representa.' },
    { 'Campo': 'Latitud', 'Obligatorio': 'Opcional', 'Descripción': 'Coordenada decimal en Venezuela (ej: 10.1620).' },
    { 'Campo': 'Longitud', 'Obligatorio': 'Opcional', 'Descripción': 'Coordenada decimal en Venezuela (ej: -68.0077).' },
    { 'Campo': 'Revisar', 'Obligatorio': 'Opcional', 'Descripción': 'Indicar "Sí" si algún dato requiere verificación posterior, "No" en caso contrario.' }
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 65 }
  ];
  return ws;
}

// 1. Generar libro de exportación completo
const wbExport = XLSX.utils.book_new();
const wsEmp = buildEmpresasSheet(empresas, asociaciones);
const wsCat = buildCatalogoSheet();

XLSX.utils.book_append_sheet(wbExport, wsEmp, 'Empresas Clasificadas');
XLSX.utils.book_append_sheet(wbExport, wsCat, 'Catálogo de Categorías');

const exportFilePath = 'export_etapa5.xlsx';
XLSX.writeFile(wbExport, exportFilePath);
console.log(`Archivo exportado guardado en ${exportFilePath}`);

// 2. Generar libro de plantilla
const wbPlantilla = XLSX.utils.book_new();
const wsEmpVacia = XLSX.utils.aoa_to_sheet([[
  'Rama', 'Grupo', 'Subcategoría', 'Tipo de actor', 'Empresa', 'Municipio',
  'Dirección', 'Teléfono', 'WhatsApp', 'Correo', 'Productos', 'Servicios',
  'Marca', 'Latitud', 'Longitud', 'Revisar'
]]);
wsEmpVacia['!cols'] = wsEmp['!cols'];
wsEmpVacia['!autofilter'] = { ref: 'A1:P1' };

XLSX.utils.book_append_sheet(wbPlantilla, wsEmpVacia, 'Empresas Clasificadas');
XLSX.utils.book_append_sheet(wbPlantilla, wsCat, 'Catálogo de Categorías');
XLSX.utils.book_append_sheet(wbPlantilla, buildInstruccionesSheet(), 'Instrucciones');

const plantillaFilePath = 'plantilla_etapa5.xlsx';
XLSX.writeFile(wbPlantilla, plantillaFilePath);
console.log(`Archivo de plantilla guardado en ${plantillaFilePath}`);

// 3. Comparación contra original
const originalWb = XLSX.readFile('cadena_construccion_clasificada.xlsx');
console.log('\n=== COMPARACIÓN DE ESTRUCTURA CON EL ORIGINAL ===');
console.log('Hojas original:', originalWb.SheetNames);
console.log('Hojas exportado:', wbExport.SheetNames);

const origSheet1 = originalWb.Sheets['Empresas Clasificadas'];
const origSheet2 = originalWb.Sheets['Catálogo de Categorías'];

const origData1 = XLSX.utils.sheet_to_json(origSheet1, { defval: '' });
const expData1 = XLSX.utils.sheet_to_json(wsEmp, { defval: '' });

console.log(`Hoja 1 filas: Original=${origData1.length}, Exportado=${expData1.length}`);
console.log('Hoja 1 Columnas Original:', Object.keys(origData1[0]));
console.log('Hoja 1 Columnas Exportado:', Object.keys(expData1[0]));

const origData2 = XLSX.utils.sheet_to_json(origSheet2, { defval: '' });
const expData2 = XLSX.utils.sheet_to_json(wsCat, { defval: '' });

console.log(`Hoja 2 filas: Original=${origData2.length}, Exportado=${expData2.length}`);
console.log('Hoja 2 Columnas Original:', Object.keys(origData2[0]));
console.log('Hoja 2 Columnas Exportado:', Object.keys(expData2[0]));
