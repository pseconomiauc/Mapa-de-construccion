const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const filePath = path.join(__dirname, '..', 'cadena_construccion_clasificada.xlsx');
const workbook = xlsx.readFile(filePath);

const sheet1 = workbook.Sheets['Empresas Clasificadas'];
const sheet2 = workbook.Sheets['Catálogo de Categorías'];

const rowsEmpresas = xlsx.utils.sheet_to_json(sheet1, { defval: '' });
const rowsCategorias = xlsx.utils.sheet_to_json(sheet2, { defval: '' });

// Mapa de subcategoría nombre/código -> slug
const catMap = new Map();
rowsCategorias.forEach(c => {
  const code = String(c['Código Subcategoría']).trim();
  const name = String(c['Nombre Subcategoría']).trim();
  const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  catMap.set(normName, { slug: code, codigo: code, nombre: name });
  catMap.set(code, { slug: code, codigo: code, nombre: name });
});

// Normalización de nombres de empresa para agrupación
const normCompanyName = (name) => {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
};

// Normalización de teléfonos (+58 XXX XXXXXXX)
const normalizePhone = (phoneStr) => {
  if (!phoneStr) return '';
  const digits = String(phoneStr).replace(/\D/g, '');
  if (!digits) return String(phoneStr).trim();

  // Si empieza con 58 y tiene 12 dígitos (58 241 1234567) o 10/11 dígitos
  if (digits.startsWith('58') && digits.length === 12) {
    return `+58 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  } else if (digits.startsWith('0') && digits.length === 11) {
    return `+58 ${digits.slice(1, 4)} ${digits.slice(4)}`;
  } else if (digits.length === 10) {
    return `+58 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return String(phoneStr).trim();
};

// Limpieza de productos
const cleanProducts = (prodStr) => {
  if (!prodStr) return { clean: '', original: '' };
  const original = String(prodStr).trim();
  const parts = original.split('|').map(p => p.trim()).filter(Boolean);
  
  // Deduplicar fragmentos idénticos
  const uniqueParts = [];
  const seen = new Set();
  for (const p of parts) {
    const normP = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!seen.has(normP)) {
      seen.add(normP);
      uniqueParts.push(p);
    }
  }

  // Unir con punto y espacio si termina en punto o agregarlo
  const clean = uniqueParts.map(p => p.endsWith('.') ? p : p + '.').join(' ');
  return { clean, original };
};

// Nombres genéricos conocidos
const NOMBRES_GENERICOS = [
  "ferreteria y materiales de construccion en montalban (comercios locales y distribuidores)",
  "ferreteria y pinturas comercializadoras locales de bejuma",
  "ferreteria y materiales de construccion en la zona de bejuma",
  "suministros y materiales de construccion operando en la zona (ferremateriales locales)"
];

// Municipios válidos
const MUNICIPIOS_OFICIALES = [
  'Bejuma', 'Carlos Arvelo', 'Diego Ibarra', 'Guacara', 'Juan José Mora',
  'Libertador', 'Los Guayos', 'Miranda', 'Montalbán', 'Naguanagua',
  'Puerto Cabello', 'San Diego', 'San Joaquín', 'Valencia'
];

// Comprobación de dirección genérica
const esDireccionGenerica = (dir, muni) => {
  if (!dir) return true;
  const d = dir.trim().toLowerCase();
  const m = (muni || '').trim().toLowerCase();
  if (/^municipio\s+[a-zñáéíóú\s]+,\s*(?:estado\s+)?carabobo\.?$/i.test(d)) return true;
  if (/^municipio\s+[a-zñáéíóú\s]+$/i.test(d)) return true;
  if (d === `municipio ${m}, estado carabobo` || d === `municipio ${m}, carabobo`) return true;
  if (d === 'estado carabobo (operaciones regionales)') return true;
  if (d === 'valencia, estado carabobo' || d === 'bejuma, estado carabobo') return true;
  return false;
};

// Mapear y agrupar las 106 filas
const empresasMap = new Map();
const asociaciones = [];
let totalFilasRevisar = 0;

rowsEmpresas.forEach((row, idx) => {
  const rawNombre = String(row['Empresa']).trim();
  const key = normCompanyName(rawNombre);
  const subcatNombre = String(row['Subcategoría']).trim();
  const normSubcat = subcatNombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const catInfo = catMap.get(normSubcat);

  if (!catInfo) {
    console.error(`Fila ${idx + 2}: Subcategoría no encontrada en catálogo: "${subcatNombre}"`);
  }

  const slug = catInfo ? catInfo.slug : normSubcat;
  const revisarVal = String(row['Revisar']).trim().toLowerCase();
  const esRevisarFila = revisarVal === 'sí' || revisarVal === 'si';
  if (esRevisarFila) totalFilasRevisar++;

  const rawMuni = String(row['Municipio']).trim();
  let municipio = rawMuni;
  let notaRevisionMuni = null;

  if (rawMuni.toLowerCase() === 'mariara') {
    municipio = 'Diego Ibarra';
    notaRevisionMuni = 'Municipio registrado originalmente como Mariara (capital del Municipio Diego Ibarra). Requiere verificación.';
  }

  const rawDir = String(row['Dirección']).trim();
  const esGen = esDireccionGenerica(rawDir, rawMuni);
  const direccionPrecisa = !esGen && rawDir.length > 0;

  const rawTel = String(row['Teléfono']).trim();
  const telNorm = normalizePhone(rawTel);

  const rawWa = String(row['WhatsApp']).trim();
  const waNorm = normalizePhone(rawWa);

  const rawCorreo = String(row['Correo']).trim();

  const { clean: prodClean, original: prodOriginal } = cleanProducts(row['Productos']);
  const tipoActor = String(row['Tipo de actor']).trim();

  const esNombreGenerico = NOMBRES_GENERICOS.some(g => key.includes(g) || g.includes(key));
  const tipoRegistro = esNombreGenerico ? 'referencia_generica' : 'empresa';

  if (!empresasMap.has(key)) {
    // Generar UUID determinista o consistente
    const empresaId = `emp-${String(empresasMap.size + 1).padStart(3, '0')}`;
    
    empresasMap.set(key, {
      id: empresaId,
      nombre: rawNombre,
      municipio: municipio || null,
      direccion: rawDir || null,
      direccion_precisa: direccionPrecisa,
      telefono: telNorm || null,
      whatsapp: waNorm || null,
      correo: rawCorreo || null,
      productos: prodClean || null,
      productos_original: prodOriginal || null,
      servicios: String(row['Servicios']).trim() || null,
      marca: String(row['Marca']).trim() || null,
      lat: null,
      lng: null,
      revisar: esRevisarFila || !!notaRevisionMuni || esNombreGenerico,
      nota_revision: notaRevisionMuni || (esNombreGenerico ? 'Referencia genérica: identificar la empresa real' : (esRevisarFila ? 'Marcado para revisión en archivo fuente' : null)),
      contacto_verificado: false,
      fuente: 'cadena_construccion_clasificada.xlsx',
      tipo_registro: tipoRegistro,
      subcategorias: new Set([slug]),
      actores: new Set(tipoActor ? [tipoActor] : [])
    });
  } else {
    // Fusión de datos para empresas en múltiples filas
    const emp = empresasMap.get(key);
    emp.subcategorias.add(slug);
    if (tipoActor) emp.actores.add(tipoActor);
    if (esRevisarFila) emp.revisar = true;
    if (notaRevisionMuni && !emp.nota_revision) emp.nota_revision = notaRevisionMuni;

    // Combinar productos si son distintos
    if (prodClean && (!emp.productos || !emp.productos.includes(prodClean))) {
      emp.productos = emp.productos ? `${emp.productos} ${prodClean}` : prodClean;
    }
    if (prodOriginal && (!emp.productos_original || !emp.productos_original.includes(prodOriginal))) {
      emp.productos_original = emp.productos_original ? `${emp.productos_original} | ${prodOriginal}` : prodOriginal;
    }

    // Conservar datos de contacto si no estaban
    if (!emp.telefono && telNorm) emp.telefono = telNorm;
    if (!emp.whatsapp && waNorm) emp.whatsapp = waNorm;
    if (!emp.correo && rawCorreo) emp.correo = rawCorreo;
    if (!emp.direccion && rawDir) {
      emp.direccion = rawDir;
      emp.direccion_precisa = direccionPrecisa;
    }
  }

  asociaciones.push({
    empresaNombre: rawNombre,
    empresaKey: key,
    categoriaSlug: slug,
    subcategoriaNombre: subcatNombre,
    tipoActor: tipoActor || 'Fabricante',
    fila: idx + 2
  });
});

const empresasList = Array.from(empresasMap.values()).map(e => ({
  ...e,
  subcategorias: Array.from(e.subcategorias),
  actores: Array.from(e.actores)
}));

console.log('=== RESULTADOS PROCESAMIENTO ETAPA 3 ===');
console.log(`Total filas leídas: ${rowsEmpresas.length}`);
console.log(`Empresas únicas resultantes: ${empresasList.length}`);
console.log(`Total asociaciones empresa-subcategoría: ${asociaciones.length}`);
console.log(`Total filas con Revisar = Sí en Excel: ${totalFilasRevisar}`);
console.log(`Empresas marcadas con revisar = true: ${empresasList.filter(e => e.revisar).length}`);
console.log(`Referencias genéricas detectadas: ${empresasList.filter(e => e.tipo_registro === 'referencia_generica').length}`);
console.log(`Empresas con dirección precisa = false: ${empresasList.filter(e => !e.direccion_precisa).length}`);

// Guardar seed JSON
fs.writeFileSync('src/data/seedEmpresas.json', JSON.stringify({
  totalEmpresas: empresasList.length,
  totalAsociaciones: asociaciones.length,
  empresas: empresasList,
  asociaciones
}, null, 2));

// Generar script SQL completo supabase_seed_empresas.sql
let sqlSeed = `-- ==============================================================================
-- CARGA DE EMPRESAS Y ASOCIACIONES (106 FILAS -> 93 EMPRESAS ÚNICAS)
-- Fuente: cadena_construccion_clasificada.xlsx (Hoja 1)
-- ==============================================================================

-- 1. Actualizar esquema si no existen las columnas nuevas
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS productos_original text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS revisar boolean DEFAULT false;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS nota_revision text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS direccion_precisa boolean DEFAULT true;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS contacto_verificado boolean DEFAULT false;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS fuente text;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS tipo_registro text DEFAULT 'empresa';

-- 2. Limpieza idempotente
DELETE FROM public.empresa_categorias;
DELETE FROM public.empresas;

`;

// Insertar empresas
empresasList.forEach((emp, i) => {
  const esc = s => s ? `'${s.replace(/'/g, "''")}'` : 'NULL';
  sqlSeed += `INSERT INTO public.empresas (id, nombre, municipio, direccion, direccion_precisa, telefono, whatsapp, correo, productos, productos_original, servicios, marca, revisar, nota_revision, contacto_verificado, fuente, tipo_registro)
VALUES ('a0000000-0000-0000-0000-${String(i+1).padStart(12, '0')}', ${esc(emp.nombre)}, ${esc(emp.municipio)}, ${esc(emp.direccion)}, ${emp.direccion_precisa}, ${esc(emp.telefono)}, ${esc(emp.whatsapp)}, ${esc(emp.correo)}, ${esc(emp.productos)}, ${esc(emp.productos_original)}, ${esc(emp.servicios)}, ${esc(emp.marca)}, ${emp.revisar}, ${esc(emp.nota_revision)}, ${emp.contacto_verificado}, ${esc(emp.fuente)}, '${emp.tipo_registro}');\n`;
});

// Insertar asociaciones
asociaciones.forEach((aso) => {
  const emp = empresasList.find(e => normCompanyName(e.nombre) === aso.empresaKey);
  const empIdx = empresasList.indexOf(emp);
  const uuid = `a0000000-0000-0000-0000-${String(empIdx+1).padStart(12, '0')}`;
  sqlSeed += `INSERT INTO public.empresa_categorias (empresa_id, categoria_slug) VALUES ('${uuid}', '${aso.categoriaSlug}') ON CONFLICT DO NOTHING;\n`;
});

fs.writeFileSync('supabase_seed_empresas.sql', sqlSeed);
console.log('Generados src/data/seedEmpresas.json y supabase_seed_empresas.sql');
