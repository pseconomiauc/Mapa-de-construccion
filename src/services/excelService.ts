import * as XLSX from 'xlsx';
import { Empresa, MunicipioCarabobo, MUNICIPIOS_CARABOBO, DESCRIPCION_ACTORES, TipoActor } from '../types/database';
import { ALL_CATEGORIES, CATEGORIES_BY_SLUG, CATEGORIES_BY_CODE, CATEGORIES_BY_NAME, norm } from '../data/cadenaData';

// Coordenadas válidas para Venezuela
export function isValidVenezuelaCoord(lat: number, lng: number): boolean {
  return lat >= 0.5 && lat <= 12.6 && lng >= -73.5 && lng <= -59.5;
}

// Convertir s2ab para descarga de archivos en navegador
function s2ab(s: string) {
  const buf = new ArrayBuffer(s.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xff;
  return buf;
}

// Descargar archivo Excel en el navegador
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
  const blob = new Blob([s2ab(wbout)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1. DESCARGAR EXCEL:
 * Hoja "Empresas Clasificadas" (16 columnas exactas) y hoja "Catálogo de Categorías" (9 columnas exactas)
 */
export function exportEmpresasExcel(
  empresas: Empresa[],
  companyCategoriesMap: Record<string, string[]>, // empresa_id -> categoria_slugs
  _companyCounts?: Record<string, number>
) {
  // 1. Hoja Empresas Clasificadas (una fila por cada par empresa, subcategoría)
  const rowsEmpresas: Record<string, unknown>[] = [];

  empresas.forEach((emp) => {
    const catSlugs = companyCategoriesMap[emp.id] || [];
    const slugsToUse = catSlugs.length > 0 ? catSlugs : ['1.1.1'];

    slugsToUse.forEach((slug) => {
      const cat = CATEGORIES_BY_SLUG[slug];
      const defaultActor = cat && cat.actores && cat.actores.length > 0
        ? DESCRIPCION_ACTORES[cat.actores[0] as TipoActor]
        : 'Fabricante';

      rowsEmpresas.push({
        'Rama': cat ? cat.rama_nombre : '',
        'Grupo': cat ? cat.grupo : '',
        'Subcategoría': cat ? cat.nombre : slug,
        'Tipo de actor': defaultActor,
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
  });

  const wsEmpresas = XLSX.utils.json_to_sheet(rowsEmpresas);
  wsEmpresas['!cols'] = [
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
  wsEmpresas['!autofilter'] = { ref: wsEmpresas['!ref'] || 'A1:P1' };

  // 2. Hoja Catálogo de Categorías (9 columnas)
  const rowsCatalogo = ALL_CATEGORIES.map((cat) => ({
    'ID Rama': cat.rama_id,
    'Código Rama': cat.rama_codigo || String(cat.rama_id),
    'Nombre Rama': cat.rama_nombre,
    'ID Grupo': cat.grupo_id || 1,
    'Código Grupo': cat.grupo_codigo || '',
    'Nombre Grupo': cat.grupo,
    'ID Subcategoría': cat.id || cat.orden,
    'Código Subcategoría': cat.codigo || cat.slug,
    'Nombre Subcategoría': cat.nombre
  }));

  const wsCatalogo = XLSX.utils.json_to_sheet(rowsCatalogo);
  wsCatalogo['!cols'] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 38 },
    { wch: 10 },
    { wch: 14 },
    { wch: 42 },
    { wch: 16 },
    { wch: 20 },
    { wch: 48 }
  ];
  wsCatalogo['!autofilter'] = { ref: wsCatalogo['!ref'] || 'A1:I1' };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsEmpresas, 'Empresas Clasificadas');
  XLSX.utils.book_append_sheet(wb, wsCatalogo, 'Catálogo de Categorías');

  downloadWorkbook(wb, 'cadena_construccion_clasificada.xlsx');
}

/**
 * 2. DESCARGAR PLANTILLA EXCEL
 */
export function exportPlantillaExcel() {
  const headers = [
    'Rama',
    'Grupo',
    'Subcategoría',
    'Tipo de actor',
    'Empresa',
    'Municipio',
    'Dirección',
    'Teléfono',
    'WhatsApp',
    'Correo',
    'Productos',
    'Servicios',
    'Marca',
    'Latitud',
    'Longitud',
    'Revisar'
  ];

  const wsEmpresas = XLSX.utils.aoa_to_sheet([headers]);
  wsEmpresas['!cols'] = [
    { wch: 38 },
    { wch: 42 },
    { wch: 45 },
    { wch: 20 },
    { wch: 36 },
    { wch: 18 },
    { wch: 40 },
    { wch: 18 },
    { wch: 18 },
    { wch: 26 },
    { wch: 45 },
    { wch: 30 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 }
  ];
  wsEmpresas['!autofilter'] = { ref: 'A1:P1' };

  // Catálogo completo
  const rowsCatalogo = ALL_CATEGORIES.map((cat) => ({
    'ID Rama': cat.rama_id,
    'Código Rama': cat.rama_codigo || String(cat.rama_id),
    'Nombre Rama': cat.rama_nombre,
    'ID Grupo': cat.grupo_id || 1,
    'Código Grupo': cat.grupo_codigo || '',
    'Nombre Grupo': cat.grupo,
    'ID Subcategoría': cat.id || cat.orden,
    'Código Subcategoría': cat.codigo || cat.slug,
    'Nombre Subcategoría': cat.nombre
  }));

  const wsCatalogo = XLSX.utils.json_to_sheet(rowsCatalogo);
  wsCatalogo['!cols'] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 38 },
    { wch: 10 },
    { wch: 14 },
    { wch: 42 },
    { wch: 16 },
    { wch: 20 },
    { wch: 48 }
  ];
  wsCatalogo['!autofilter'] = { ref: wsCatalogo['!ref'] || 'A1:I1' };

  // Instrucciones
  const rowsInstrucciones = [
    { 'Campo': 'Empresa', 'Obligatorio': 'SÍ', 'Descripción': 'Nombre o razón social de la empresa o comercio.' },
    { 'Campo': 'Subcategoría', 'Obligatorio': 'SÍ', 'Descripción': 'Nombre o código de la subcategoría según la hoja "Catálogo de Categorías".' },
    { 'Campo': 'Rama', 'Obligatorio': 'Opcional', 'Descripción': 'Se deduce automáticamente a partir de la subcategoría si se deja en blanco.' },
    { 'Campo': 'Grupo', 'Obligatorio': 'Opcional', 'Descripción': 'Se deduce automáticamente a partir de la subcategoría si se deja en blanco.' },
    { 'Campo': 'Tipo de actor', 'Obligatorio': 'Opcional', 'Descripción': 'Fabricante, Distribuidor, Contratista, Servicio profesional o Alquiler / logística.' },
    { 'Campo': 'Municipio', 'Obligatorio': 'Opcional', 'Descripción': 'Uno de los 14 municipios oficiales de Carabobo.' },
    { 'Campo': 'Dirección', 'Obligatorio': 'Opcional', 'Descripción': 'Dirección física o referencia del local/planta.' },
    { 'Campo': 'Teléfono', 'Obligatorio': 'Opcional', 'Descripción': 'Teléfono en formato +58 XXX XXXXXXX.' },
    { 'Campo': 'WhatsApp', 'Obligatorio': 'Opcional', 'Descripción': 'WhatsApp comercial en formato +58 XXX XXXXXXX.' },
    { 'Campo': 'Correo', 'Obligatorio': 'Opcional', 'Descripción': 'Correo electrónico institucional o de ventas.' },
    { 'Campo': 'Productos', 'Obligatorio': 'Opcional', 'Descripción': 'Descripción o lista de productos suministrados.' },
    { 'Campo': 'Servicios', 'Obligatorio': 'Opcional', 'Descripción': 'Descripción de servicios prestados.' },
    { 'Campo': 'Marca', 'Obligatorio': 'Opcional', 'Descripción': 'Marca o marcas comerciales que representa.' },
    { 'Campo': 'Latitud', 'Obligatorio': 'Opcional', 'Descripción': 'Coordenada decimal dentro de Venezuela (ej: 10.1620).' },
    { 'Campo': 'Longitud', 'Obligatorio': 'Opcional', 'Descripción': 'Coordenada decimal dentro de Venezuela (ej: -68.0077).' },
    { 'Campo': 'Revisar', 'Obligatorio': 'Opcional', 'Descripción': 'Indicar "Sí" si algún dato requiere revisión posterior, o "No".' }
  ];

  const wsInstrucciones = XLSX.utils.json_to_sheet(rowsInstrucciones);
  wsInstrucciones['!cols'] = [
    { wch: 20 },
    { wch: 15 },
    { wch: 65 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsEmpresas, 'Empresas Clasificadas');
  XLSX.utils.book_append_sheet(wb, wsCatalogo, 'Catálogo de Categorías');
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

  downloadWorkbook(wb, 'plantilla_cadena_construccion.xlsx');
}

export const TIPOS_ACTOR_VALIDOS = [
  'Fabricante',
  'Distribuidor',
  'Contratista',
  'Servicio profesional',
  'Alquiler / logística',
  'F', 'D', 'C', 'S', 'A'
];

export interface ParsedImportItem {
  nombre: string;
  direccion?: string | null;
  municipio?: MunicipioCarabobo | null;
  lat?: number | null;
  lng?: number | null;
  productos?: string | null;
  productos_original?: string | null;
  servicios?: string | null;
  marca?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  correo?: string | null;
  revisar?: boolean;
  nota_revision?: string | null;
  direccion_precisa?: boolean;
  contacto_verificado?: boolean;
  fuente?: string | null;
  tipo_registro?: 'empresa' | 'referencia_generica';
  tipo_actor?: string | null;
  categoriaSlugs: string[];
  isExisting: boolean;
  existingId?: string;
  warnings?: string[];
}

export interface ImportValidationResult {
  totalRows: number;
  totalUniqueCompanies: number;
  readyToImport: ParsedImportItem[];
  existingMerged: ParsedImportItem[];
  revisarRows: ParsedImportItem[];
  errors: { row: number; empresa: string; reason: string }[];
  warnings: { row: number; empresa: string; reason: string }[];
}

// Búsqueda inteligente de subcategoría por código, slug, nombre o normalizado
export function findCategory(text: string) {
  const clean = (text || '').trim();
  if (!clean) return null;

  // 1. Coincidencia por código o slug
  if (CATEGORIES_BY_CODE[clean]) return CATEGORIES_BY_CODE[clean];
  if (CATEGORIES_BY_SLUG[clean]) return CATEGORIES_BY_SLUG[clean];

  // 2. Coincidencia normalizada
  const n = norm(clean);
  if (CATEGORIES_BY_NAME[n]) return CATEGORIES_BY_NAME[n];

  const found = ALL_CATEGORIES.find((c) => norm(c.nombre) === n || norm(c.slug) === n || (c.codigo && norm(c.codigo) === n));
  return found || null;
}

export async function parseExcelFile(
  file: File,
  existingCompanies: Empresa[],
  defaultCategorySlug?: string | null
): Promise<ImportValidationResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });

  // Hoja 'Empresas Clasificadas', 'Empresas' o la primera hoja
  let sheetName = wb.SheetNames[0];
  if (wb.SheetNames.includes('Empresas Clasificadas')) {
    sheetName = 'Empresas Clasificadas';
  } else if (wb.SheetNames.includes('Empresas')) {
    sheetName = 'Empresas';
  }

  const ws = wb.Sheets[sheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const errors: { row: number; empresa: string; reason: string }[] = [];
  const warnings: { row: number; empresa: string; reason: string }[] = [];

  // Mapa de empresas existentes por nombre normalizado
  const existingByName = new Map<string, Empresa>();
  existingCompanies.forEach((emp) => {
    existingByName.set(norm(emp.nombre.trim()), emp);
  });

  // Agrupador de filas del archivo por nombre normalizado de empresa
  const consolidatedMap = new Map<string, ParsedImportItem>();

  const NOMBRES_GENERICOS = [
    "ferreteria y materiales de construccion en montalban (comercios locales y distribuidores)",
    "ferreteria y pinturas comercializadoras locales de bejuma",
    "ferreteria y materiales de construccion en la zona de bejuma",
    "suministros y materiales de construccion operando en la zona (ferremateriales locales)"
  ];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 por cabecera y base 1

    // Mapeo flexible de columnas
    const getVal = (colNames: string[]): string => {
      for (const col of colNames) {
        const key = Object.keys(row).find(k => norm(k.replace(/[^a-zA-Z0-9]/g, '')) === norm(col.replace(/[^a-zA-Z0-9]/g, '')));
        if (key && row[key] !== undefined && row[key] !== null) {
          return String(row[key]).trim();
        }
      }
      return '';
    };

    const nombre = getVal(['Empresa', 'Nombre', 'Razon Social']);
    const subcatRaw = getVal(['Subcategoría', 'Subcategoria', 'Subcategorías']);
    const ramaRaw = getVal(['Rama', 'ID Rama', 'Nombre Rama']);
    const grupoRaw = getVal(['Grupo', 'Nombre Grupo']);
    const actorRaw = getVal(['Tipo de actor', 'Actor', 'Tipo Actor']);
    const muniRaw = getVal(['Municipio']);
    const dirRaw = getVal(['Dirección', 'Direccion']);
    const telRaw = getVal(['Teléfono', 'Telefono', 'Tel']);
    const waRaw = getVal(['WhatsApp', 'Whatsapp', 'WA']);
    const correoRaw = getVal(['Correo', 'Email']);
    const prodRaw = getVal(['Productos', 'Producto']);
    const servRaw = getVal(['Servicios', 'Servicio']);
    const marcaRaw = getVal(['Marca']);
    const latRaw = getVal(['Latitud', 'Lat']);
    const lngRaw = getVal(['Longitud', 'Lng', 'Lon']);
    const revisarRaw = getVal(['Revisar', 'Por Revisar']);

    // Regla: Sin empresa, se omite
    if (!nombre) {
      if (Object.values(row).some(v => String(v).trim() !== '')) {
        errors.push({
          row: rowNumber,
          empresa: '(Sin nombre)',
          reason: 'Fila omitida: no tiene nombre de empresa (campo obligatorio).'
        });
      }
      return;
    }

    // Regla: Subcategoría
    const cat = findCategory(subcatRaw || defaultCategorySlug || '');
    if (!cat) {
      errors.push({
        row: rowNumber,
        empresa: nombre,
        reason: `Fila omitida: la subcategoría "${subcatRaw}" no existe en el catálogo de 76 subcategorías.`
      });
      return;
    }

    // Comprobación de coherencia de Rama y Grupo
    if (ramaRaw) {
      const nRama = norm(ramaRaw);
      const nCatRama = norm(cat.rama_nombre);
      if (!nCatRama.includes(nRama) && !nRama.includes(nCatRama) && !nRama.includes(String(cat.rama_id))) {
        warnings.push({
          row: rowNumber,
          empresa: nombre,
          reason: `Aviso: La Rama "${ramaRaw}" no coincide con la subcategoría "${cat.nombre}" (pertenece a "${cat.rama_nombre}"). Se corrige automáticamente.`
        });
      }
    }

    if (grupoRaw) {
      const nGrupo = norm(grupoRaw);
      const nCatGrupo = norm(cat.grupo);
      if (!nCatGrupo.includes(nGrupo) && !nGrupo.includes(nCatGrupo)) {
        warnings.push({
          row: rowNumber,
          empresa: nombre,
          reason: `Aviso: El Grupo "${grupoRaw}" no coincide con la subcategoría "${cat.nombre}" (pertenece a "${cat.grupo}"). Se corrige automáticamente.`
        });
      }
    }

    // Validar Tipo de actor
    let validActor = actorRaw;
    if (actorRaw && !TIPOS_ACTOR_VALIDOS.some(v => norm(v) === norm(actorRaw))) {
      warnings.push({
        row: rowNumber,
        empresa: nombre,
        reason: `Tipo de actor "${actorRaw}" no estándar. Se ajusta según la subcategoría.`
      });
      validActor = cat.actores && cat.actores.length > 0 ? DESCRIPCION_ACTORES[cat.actores[0] as TipoActor] : 'Fabricante';
    }

    // Validar Municipio
    let municipio: MunicipioCarabobo | null = null;
    let esMariara = false;
    if (muniRaw) {
      const nMun = norm(muniRaw);
      if (nMun === 'mariara') {
        municipio = 'Diego Ibarra';
        esMariara = true;
      } else {
        const foundMun = MUNICIPIOS_CARABOBO.find((m) => norm(m) === nMun);
        if (foundMun) {
          municipio = foundMun;
        } else {
          warnings.push({
            row: rowNumber,
            empresa: nombre,
            reason: `Municipio "${muniRaw}" no pertenece a los 14 municipios oficiales de Carabobo.`
          });
        }
      }
    }

    // Validar coordenadas si vienen indicadas
    let lat: number | null = null;
    let lng: number | null = null;
    if (latRaw || lngRaw) {
      const pLat = parseFloat(latRaw.replace(',', '.'));
      const pLng = parseFloat(lngRaw.replace(',', '.'));

      if (isNaN(pLat) || isNaN(pLng)) {
        warnings.push({
          row: rowNumber,
          empresa: nombre,
          reason: 'Coordenadas inválidas: no son números decimales válidos (se omiten).'
        });
      } else if (!isValidVenezuelaCoord(pLat, pLng)) {
        warnings.push({
          row: rowNumber,
          empresa: nombre,
          reason: `Coordenadas (${pLat}, ${pLng}) fuera de los límites de Venezuela (se rechazan).`
        });
      } else {
        lat = Math.round(pLat * 1e7) / 1e7;
        lng = Math.round(pLng * 1e7) / 1e7;
      }
    }

    // Limpieza de productos
    let prodLimpio = prodRaw;
    if (prodRaw.includes('|')) {
      const parts = prodRaw.split('|').map(p => p.trim()).filter(Boolean);
      const seen = new Set<string>();
      const uniq: string[] = [];
      for (const p of parts) {
        const np = norm(p);
        if (!seen.has(np)) {
          seen.add(np);
          uniq.push(p);
        }
      }
      prodLimpio = uniq.map(p => p.endsWith('.') ? p : p + '.').join(' ');
    }

    // Revisar y notas
    const esRevisarFila = norm(revisarRaw) === 'si' || norm(revisarRaw) === 'sí';
    const esGenerico = NOMBRES_GENERICOS.some(g => norm(nombre).includes(g) || g.includes(norm(nombre)));
    const notasList: string[] = [];
    if (esGenerico) notasList.push('Referencia genérica: identificar la empresa real');
    if (esMariara) notasList.push('Municipio registrado como Mariara (capital de Diego Ibarra)');
    if (esRevisarFila) notasList.push('Marcado para revisión en archivo');

    const normKey = norm(nombre);
    const existing = existingByName.get(normKey);

    if (!consolidatedMap.has(normKey)) {
      consolidatedMap.set(normKey, {
        nombre,
        direccion: dirRaw || null,
        municipio,
        lat,
        lng,
        productos: prodLimpio || null,
        productos_original: prodRaw || null,
        servicios: servRaw || null,
        marca: marcaRaw || null,
        telefono: telRaw || null,
        whatsapp: waRaw || null,
        correo: correoRaw || null,
        revisar: esRevisarFila || esGenerico || esMariara,
        nota_revision: notasList.length > 0 ? notasList.join('. ') : null,
        direccion_precisa: !dirRaw || dirRaw.toLowerCase().startsWith('municipio ') ? false : true,
        contacto_verificado: false,
        fuente: 'Importación Excel',
        tipo_registro: esGenerico ? 'referencia_generica' : 'empresa',
        tipo_actor: validActor || null,
        categoriaSlugs: [cat.slug],
        isExisting: !!existing,
        existingId: existing ? existing.id : undefined,
        warnings: []
      });
    } else {
      // Fusión dentro del mismo archivo
      const existingItem = consolidatedMap.get(normKey)!;
      if (!existingItem.categoriaSlugs.includes(cat.slug)) {
        existingItem.categoriaSlugs.push(cat.slug);
      }
      if (esRevisarFila || esGenerico || esMariara) {
        existingItem.revisar = true;
      }
      if (notasList.length > 0) {
        const currentNote = existingItem.nota_revision || '';
        const combined = Array.from(new Set([...currentNote.split('. ').filter(Boolean), ...notasList])).join('. ');
        existingItem.nota_revision = combined;
      }
      if (!existingItem.telefono && telRaw) existingItem.telefono = telRaw;
      if (!existingItem.whatsapp && waRaw) existingItem.whatsapp = waRaw;
      if (!existingItem.correo && correoRaw) existingItem.correo = correoRaw;
      if (!existingItem.direccion && dirRaw) existingItem.direccion = dirRaw;
      if (lat && lng && !existingItem.lat) {
        existingItem.lat = lat;
        existingItem.lng = lng;
      }
      if (prodLimpio && existingItem.productos && !existingItem.productos.includes(prodLimpio)) {
        existingItem.productos = `${existingItem.productos} ${prodLimpio}`;
      }
    }
  });

  const allItems = Array.from(consolidatedMap.values());
  const readyToImport = allItems.filter(i => !i.isExisting);
  const existingMerged = allItems.filter(i => i.isExisting);
  const revisarRows = allItems.filter(i => i.revisar);

  return {
    totalRows: rawRows.length,
    totalUniqueCompanies: allItems.length,
    readyToImport,
    existingMerged,
    revisarRows,
    errors,
    warnings
  };
}
