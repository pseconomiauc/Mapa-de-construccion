import React, { useState, useEffect } from 'react';
import { Empresa, MunicipioCarabobo, MUNICIPIOS_CARABOBO } from '../types/database';
import { ALL_CATEGORIES } from '../data/cadenaData';
import { LocationPickerModal } from './LocationPickerModal';
import {
  parseCoordinatesString,
  isValidVenezuelaCoords,
  getMunicipioFromGeoJSON
} from '../utils/geoUtils';
import { searchAddressNominatim } from '../services/nominatimService';
import { getErrorMessage } from '../utils/errorUtils';

interface CompanyFormProps {
  /** Subcategoría "fija" del contexto actual. Pasa '' cuando el formulario se usa fuera de una subcategoría (ej. panel de gestión) para dejar la selección de sectores completamente libre. */
  currentCategorySlug: string;
  empresaToEdit?: Empresa | null;
  associatedCategories?: string[];
  onSave: (
    empresaData: Partial<Empresa> & { nombre: string },
    selectedCategorySlugs: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  onCancelEdit?: () => void;
}

type OptionalFieldKey =
  | 'direccion'
  | 'municipio'
  | 'coordenadas'
  | 'productos'
  | 'servicios'
  | 'marca'
  | 'telefono'
  | 'whatsapp'
  | 'correo'
  | 'revision_calidad'
  | 'fuente'
  | 'otras_categorias';

const OPTIONAL_FIELDS: { key: OptionalFieldKey; label: string }[] = [
  { key: 'direccion', label: 'Dirección' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'coordenadas', label: 'Coordenadas (Latitud y Longitud)' },
  { key: 'productos', label: 'Productos' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'marca', label: 'Marca' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'correo', label: 'Correo electrónico' },
  { key: 'revision_calidad', label: 'Estado de revisión / Calidad' },
  { key: 'fuente', label: 'Fuente del dato (URL o referencia)' },
  { key: 'otras_categorias', label: 'Otras subcategorías donde también aplica' }
];

export const CompanyForm: React.FC<CompanyFormProps> = ({
  currentCategorySlug,
  empresaToEdit,
  associatedCategories = [],
  onSave,
  onCancelEdit
}) => {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [municipio, setMunicipio] = useState<MunicipioCarabobo | ''>('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [productos, setProductos] = useState('');
  const [servicios, setServicios] = useState('');
  const [marca, setMarca] = useState('');
  const [telefono, setTelefono] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [correo, setCorreo] = useState('');
  const [contactoVerificado, setContactoVerificado] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [notaRevision, setNotaRevision] = useState('');
  const [fuente, setFuente] = useState('');
  const [tipoRegistro, setTipoRegistro] = useState<'empresa' | 'referencia_generica'>('empresa');
  const [selectedCats, setSelectedCats] = useState<Set<string>>(
    new Set(currentCategorySlug ? [currentCategorySlug] : [])
  );

  // Casillas activas
  const [activeTicks, setActiveTicks] = useState<Set<OptionalFieldKey>>(new Set());

  // Estados para Parte 6 (Ubicar empresas fácilmente)
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pasteCoordsText, setPasteCoordsText] = useState('');
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Cargar GeoJSON de Carabobo para cálculo de municipio en el cliente
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/carabobo_municipios.geojson`)
      .then((res) => res.json())
      .then((data) => setGeojsonData(data))
      .catch((err) => console.warn('No se pudo cargar GeoJSON en CompanyForm:', err));
  }, []);

  // Inicializar o resetear formulario según empresaToEdit
  useEffect(() => {
    if (empresaToEdit) {
      setNombre(empresaToEdit.nombre || '');
      setDireccion(empresaToEdit.direccion || '');
      setMunicipio(empresaToEdit.municipio || '');
      setLat(empresaToEdit.lat !== null && empresaToEdit.lat !== undefined ? String(empresaToEdit.lat) : '');
      setLng(empresaToEdit.lng !== null && empresaToEdit.lng !== undefined ? String(empresaToEdit.lng) : '');
      setProductos(empresaToEdit.productos || '');
      setServicios(empresaToEdit.servicios || '');
      setMarca(empresaToEdit.marca || '');
      setTelefono(empresaToEdit.telefono || '');
      setWhatsapp(empresaToEdit.whatsapp || '');
      setCorreo(empresaToEdit.correo || '');
      setContactoVerificado(!!empresaToEdit.contacto_verificado);
      setRevisar(!!empresaToEdit.revisar);
      setNotaRevision(empresaToEdit.nota_revision || '');
      setFuente(empresaToEdit.fuente || '');
      setTipoRegistro(empresaToEdit.tipo_registro || 'empresa');

      const initialTicks = new Set<OptionalFieldKey>();
      if (empresaToEdit.direccion) initialTicks.add('direccion');
      if (empresaToEdit.municipio) initialTicks.add('municipio');
      if (empresaToEdit.lat || empresaToEdit.lng) initialTicks.add('coordenadas');
      if (empresaToEdit.productos) initialTicks.add('productos');
      if (empresaToEdit.servicios) initialTicks.add('servicios');
      if (empresaToEdit.marca) initialTicks.add('marca');
      if (empresaToEdit.telefono) initialTicks.add('telefono');
      if (empresaToEdit.whatsapp) initialTicks.add('whatsapp');
      if (empresaToEdit.correo) initialTicks.add('correo');
      if (empresaToEdit.revisar || empresaToEdit.nota_revision || empresaToEdit.contacto_verificado || empresaToEdit.tipo_registro === 'referencia_generica') {
        initialTicks.add('revision_calidad');
      }
      if (empresaToEdit.fuente) initialTicks.add('fuente');

      const cats = new Set(
        associatedCategories.length > 0
          ? associatedCategories
          : currentCategorySlug
          ? [currentCategorySlug]
          : []
      );
      if (cats.size > 1 || !currentCategorySlug) initialTicks.add('otras_categorias');
      setSelectedCats(cats);
      setActiveTicks(initialTicks);
    } else {
      setNombre('');
      setDireccion('');
      setMunicipio('');
      setLat('');
      setLng('');
      setProductos('');
      setServicios('');
      setMarca('');
      setTelefono('');
      setWhatsapp('');
      setCorreo('');
      setContactoVerificado(false);
      setRevisar(false);
      setNotaRevision('');
      setFuente('');
      setTipoRegistro('empresa');
      setActiveTicks(currentCategorySlug ? new Set() : new Set<OptionalFieldKey>(['otras_categorias']));
      setSelectedCats(new Set(currentCategorySlug ? [currentCategorySlug] : []));
    }
    setMessage(null);
    setLocationFeedback(null);
  }, [empresaToEdit, currentCategorySlug, associatedCategories]);

  const toggleTick = (key: OptionalFieldKey) => {
    setActiveTicks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleCategory = (slug: string) => {
    if (slug === currentCategorySlug) return;
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  // Función común para fijar coordenadas y resolver municipio automáticamente
  const applyCoordinates = (numLat: number, numLng: number, explicitMun?: MunicipioCarabobo) => {
    if (!isValidVenezuelaCoords(numLat, numLng)) {
      setLocationFeedback({
        text: 'Las coordenadas ingresadas deben estar dentro del territorio de Venezuela (Lat 0.5 a 13.0, Lng -73.5 a -59.5).',
        isError: true
      });
      return false;
    }

    setLat(String(numLat));
    setLng(String(numLng));
    setActiveTicks((prev) => {
      const next = new Set(prev);
      next.add('coordenadas');
      return next;
    });

    let detected = explicitMun;
    if (!detected && geojsonData) {
      const autoMun = getMunicipioFromGeoJSON(numLat, numLng, geojsonData);
      if (autoMun) detected = autoMun;
    }

    if (detected) {
      setMunicipio(detected);
      setActiveTicks((prev) => {
        const next = new Set(prev);
        next.add('municipio');
        return next;
      });
      setLocationFeedback({
        text: `Coordenadas fijadas (${numLat.toFixed(4)}, ${numLng.toFixed(4)}) · Municipio detectado: ${detected}`,
        isError: false
      });
    } else {
      setLocationFeedback({
        text: `Coordenadas fijadas (${numLat.toFixed(4)}, ${numLng.toFixed(4)})`,
        isError: false
      });
    }

    return true;
  };

  // Método 2: Pegado inteligente de par copiado de Google Maps
  const handleApplyPastedCoords = () => {
    const raw = pasteCoordsText.trim();
    if (!raw) return;

    const parsed = parseCoordinatesString(raw);
    if (!parsed) {
      setLocationFeedback({
        text: 'No se reconoció el formato. Pega un par de Google Maps (ej: 10.1620, -68.0077), formato DMS o enlace.',
        isError: true
      });
      return;
    }

    const ok = applyCoordinates(parsed.lat, parsed.lng);
    if (ok) {
      setPasteCoordsText('');
    }
  };

  // Pegado directo en las casillas de latitud / longitud
  const handleSmartPasteOnInput = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseCoordinatesString(pasted);
    if (parsed) {
      e.preventDefault();
      applyCoordinates(parsed.lat, parsed.lng);
    }
  };

  // Método 3: Búsqueda con Nominatim (OpenStreetMap)
  const handleSearchAddress = async () => {
    const query = direccion.trim();
    if (!query) {
      setLocationFeedback({
        text: 'Escribe una dirección antes de buscar.',
        isError: true
      });
      return;
    }

    setSearchingAddress(true);
    setLocationFeedback({
      text: 'Consultando OpenStreetMap (Nominatim)…',
      isError: false
    });

    try {
      const results = await searchAddressNominatim(query);
      if (results.length > 0) {
        const best = results[0];
        applyCoordinates(best.lat, best.lng);
        setLocationFeedback({
          text: `Ubicación aproximada encontrada: "${best.displayName.substring(0, 65)}…". Puedes afinar la posición pulsando "Marcar en el mapa".`,
          isError: false
        });
      } else {
        setLocationFeedback({
          text: 'No se encontraron coordenadas para esa dirección. Puedes ubicarla con precisión pulsando "Marcar en el mapa".',
          isError: true
        });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setLocationFeedback({
        text: `Error al consultar Nominatim: ${msg}`,
        isError: true
      });
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombre.trim();
    if (!cleanNombre) {
      setMessage({
        text: 'Escribe el nombre de la empresa: es el único dato obligatorio.',
        isError: true
      });
      return;
    }

    if (selectedCats.size === 0) {
      setMessage({
        text: 'Selecciona al menos una subcategoría a la que pertenece la empresa.',
        isError: true
      });
      return;
    }

    // Parseo y validación de coordenadas
    let parsedLat: number | null = null;
    let parsedLng: number | null = null;
    if (activeTicks.has('coordenadas') && (lat.trim() || lng.trim())) {
      const latNum = parseFloat(lat.trim().replace(',', '.'));
      const lngNum = parseFloat(lng.trim().replace(',', '.'));

      if (isNaN(latNum) || isNaN(lngNum)) {
        setMessage({
          text: 'Las coordenadas deben ser números válidos (ejemplo: 10.1620 y -68.0077).',
          isError: true
        });
        return;
      }

      if (!isValidVenezuelaCoords(latNum, lngNum)) {
        setMessage({
          text: 'Las coordenadas ingresadas deben estar dentro del territorio de Venezuela (Lat 0.5 a 13.0, Lng -73.5 a -59.5).',
          isError: true
        });
        return;
      }

      parsedLat = latNum;
      parsedLng = lngNum;

      // Asignar municipio si aún no se ha seleccionado pero cae en Carabobo
      if (!municipio && geojsonData) {
        const autoMun = getMunicipioFromGeoJSON(latNum, lngNum, geojsonData);
        if (autoMun) {
          setMunicipio(autoMun);
        }
      }
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload: Partial<Empresa> & { nombre: string } = {
        nombre: cleanNombre,
        direccion: activeTicks.has('direccion') && direccion.trim() ? direccion.trim() : null,
        municipio: activeTicks.has('municipio') && municipio ? (municipio as MunicipioCarabobo) : null,
        lat: parsedLat,
        lng: parsedLng,
        productos: activeTicks.has('productos') && productos.trim() ? productos.trim() : null,
        servicios: activeTicks.has('servicios') && servicios.trim() ? servicios.trim() : null,
        marca: activeTicks.has('marca') && marca.trim() ? marca.trim() : null,
        telefono: activeTicks.has('telefono') && telefono.trim() ? telefono.trim() : null,
        whatsapp: activeTicks.has('whatsapp') && whatsapp.trim() ? whatsapp.trim() : null,
        correo: activeTicks.has('correo') && correo.trim() ? correo.trim() : null,
        contacto_verificado: contactoVerificado,
        revisar: activeTicks.has('revision_calidad') ? revisar : false,
        nota_revision: activeTicks.has('revision_calidad') && notaRevision.trim() ? notaRevision.trim() : null,
        fuente: activeTicks.has('fuente') && fuente.trim() ? fuente.trim() : null,
        tipo_registro: tipoRegistro
      };

      const result = await onSave(payload, Array.from(selectedCats));
      if (result.ok) {
        setMessage({
          text: empresaToEdit ? 'Cambios guardados con éxito.' : 'Empresa registrada con éxito.',
          isError: false
        });

        if (!empresaToEdit) {
          setNombre('');
          setDireccion('');
          setMunicipio('');
          setLat('');
          setLng('');
          setProductos('');
          setServicios('');
          setMarca('');
          setTelefono('');
          setWhatsapp('');
          setCorreo('');
          setContactoVerificado(false);
          setRevisar(false);
          setNotaRevision('');
          setFuente('');
          setTipoRegistro('empresa');
          setActiveTicks(currentCategorySlug ? new Set() : new Set<OptionalFieldKey>(['otras_categorias']));
          setSelectedCats(new Set(currentCategorySlug ? [currentCategorySlug] : []));
        }
      } else {
        setMessage({
          text: result.error || 'No se pudo guardar. Verifica tus permisos de editor.',
          isError: true
        });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setMessage({
        text: `Error al procesar: ${msg}`,
        isError: true
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="formBox">
      {/* Modal interactivo de selección en el mapa (Método 1) */}
      {showLocationPicker && (
        <LocationPickerModal
          initialLat={lat ? parseFloat(lat) : null}
          initialLng={lng ? parseFloat(lng) : null}
          initialMunicipio={municipio || null}
          onConfirm={({ lat: newLat, lng: newLng, municipio: newMun }) => {
            applyCoordinates(newLat, newLng, newMun);
            setShowLocationPicker(false);
          }}
          onClose={() => setShowLocationPicker(false)}
        />
      )}

      <form id="cf" onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
          <h3 className="lh" style={{ margin: 0 }}>
            {empresaToEdit ? 'Editar empresa' : 'Agregar empresa'}
          </h3>
          <button
            type="button"
            className="btn"
            style={{ fontWeight: 600, color: 'var(--link)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => setShowLocationPicker(true)}
          >
            📍 Marcar en el mapa
          </button>
        </div>

        <label className="req" style={{ marginTop: '10px' }}>
          Nombre de la empresa <em>(obligatorio)</em>
          <input
            id="f_nombre"
            type="text"
            maxLength={120}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ejemplo: Bloquera del Centro C.A."
            autoComplete="off"
            required
          />
        </label>

        <fieldset>
          <legend>Datos opcionales: marca solo los que quieras cargar</legend>
          <div className="ticks">
            {OPTIONAL_FIELDS.map((f) => (
              <label key={f.key} className="tick">
                <input
                  type="checkbox"
                  checked={activeTicks.has(f.key)}
                  onChange={() => toggleTick(f.key)}
                />{' '}
                {f.label}
              </label>
            ))}
          </div>

          {/* Feedback de acciones de ubicación */}
          {locationFeedback && (
            <div
              style={{
                fontSize: '12.5px',
                padding: '6px 10px',
                borderRadius: '2px',
                marginBottom: '10px',
                background: locationFeedback.isError ? '#fdf2f2' : '#f0fdf4',
                border: `1px solid ${locationFeedback.isError ? '#f8b4b4' : '#bbf7d0'}`,
                color: locationFeedback.isError ? '#b32424' : '#166534'
              }}
            >
              {locationFeedback.text}
            </div>
          )}

          <div className="optbox">
            {/* DIRECCIÓN & BÚSQUEDA NOMINATIM (Método 3) */}
            {activeTicks.has('direccion') && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="opt">
                  Dirección
                  <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                    <input
                      type="text"
                      maxLength={250}
                      placeholder="Ej: Zona Industrial San Diego, Avenida 68, Galpón 4"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={handleSearchAddress}
                      disabled={searchingAddress || !direccion.trim()}
                      style={{
                        whiteSpace: 'nowrap',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        padding: '6px 12px',
                        borderRadius: '2px',
                        cursor: searchingAddress ? 'default' : 'pointer'
                      }}
                      title="Buscar coordenadas en OpenStreetMap"
                    >
                      {searchingAddress ? 'Buscando…' : '🔍 Buscar dirección'}
                    </button>
                  </div>
                </label>
                <div style={{ fontSize: '12px', color: '#54595d', marginTop: '4px', fontStyle: 'italic' }}>
                  💡 Las direcciones en Venezuela suelen ser imprecisas en mapas digitales. Siempre verifica y ajusta el pin en el mapa.
                </div>
              </div>
            )}

            {/* MUNICIPIO */}
            {activeTicks.has('municipio') && (
              <label className="opt">
                Municipio de Carabobo
                <select
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value as MunicipioCarabobo | '')}
                >
                  <option value="">Elige un municipio</option>
                  {MUNICIPIOS_CARABOBO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* COORDENADAS: LATITUD, LONGITUD, PEGAR GMAPS & MARCAR EN MAPA */}
            {activeTicks.has('coordenadas') && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  border: '1px solid var(--line-soft)',
                  padding: '10px 12px',
                  borderRadius: '2px',
                  background: 'var(--surface)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Ubicación geográfica
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowLocationPicker(true)}
                    style={{ fontSize: '12.5px', color: 'var(--link)', fontWeight: 600 }}
                  >
                    📍 Marcar o ajustar en el mapa ↗
                  </button>
                </div>

                {/* Pegado inteligente de Google Maps (Método 2) */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="Pegar de Google Maps (ej: 10.1620, -68.0077 o enlace copiado)"
                      value={pasteCoordsText}
                      onChange={(e) => setPasteCoordsText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyPastedCoords();
                        }
                      }}
                      style={{ flex: 1, fontSize: '13px', padding: '5px 8px' }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyPastedCoords}
                      className="btn"
                      style={{
                        background: '#ffffff',
                        border: '1px solid var(--line)',
                        padding: '4px 12px',
                        fontSize: '12.5px',
                        borderRadius: '2px'
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    Pega el par completo copiado de Google Maps y se separará automáticamente.
                  </span>
                </div>

                {/* Campos numéricos de Latitud y Longitud */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <label className="opt" style={{ flex: '1 1 180px' }}>
                    Latitud
                    <input
                      type="text"
                      placeholder="Ej: 10.1620"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      onPaste={handleSmartPasteOnInput}
                    />
                  </label>
                  <label className="opt" style={{ flex: '1 1 180px' }}>
                    Longitud
                    <input
                      type="text"
                      placeholder="Ej: -68.0077"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      onPaste={handleSmartPasteOnInput}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* PRODUCTOS */}
            {activeTicks.has('productos') && (
              <label className="opt" style={{ gridColumn: '1 / -1' }}>
                Productos que ofrece
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Ej: Bloques de concreto 15cm y 10cm, tabelones"
                  value={productos}
                  onChange={(e) => setProductos(e.target.value)}
                />
              </label>
            )}

            {/* SERVICIOS */}
            {activeTicks.has('servicios') && (
              <label className="opt" style={{ gridColumn: '1 / -1' }}>
                Servicios que presta
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder="Ej: Transporte de agregados a obra, asesoría técnica"
                  value={servicios}
                  onChange={(e) => setServicios(e.target.value)}
                />
              </label>
            )}

            {/* MARCA */}
            {activeTicks.has('marca') && (
              <label className="opt">
                Marca comercial
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Ej: Vencemos, Tubrica"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                />
              </label>
            )}

            {/* TELÉFONO */}
            {activeTicks.has('telefono') && (
              <label className="opt">
                Teléfono de contacto
                <input
                  type="tel"
                  maxLength={50}
                  placeholder="Ej: +58 241 1234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </label>
            )}

            {/* WHATSAPP */}
            {activeTicks.has('whatsapp') && (
              <label className="opt">
                WhatsApp de contacto
                <input
                  type="tel"
                  maxLength={50}
                  placeholder="Ej: +58 412 1234567"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </label>
            )}

            {/* CORREO */}
            {activeTicks.has('correo') && (
              <label className="opt">
                Correo electrónico
                <input
                  type="email"
                  maxLength={120}
                  placeholder="Ej: ventas@empresa.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                />
              </label>
            )}

            {/* FUENTE */}
            {activeTicks.has('fuente') && (
              <label className="opt" style={{ gridColumn: '1 / -1' }}>
                Fuente del dato (URL, documento o referencia)
                <input
                  type="text"
                  maxLength={250}
                  placeholder="Ej: https://instagram.com/empresa o Ficha RIF / Directorio oficial"
                  value={fuente}
                  onChange={(e) => setFuente(e.target.value)}
                />
              </label>
            )}

            {/* REVISIÓN Y CALIDAD DE DATOS */}
            {activeTicks.has('revision_calidad') && (
              <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line-soft)', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Control de Calidad y Estado de Verificación</span>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  <label className="tick" style={{ fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={contactoVerificado}
                      onChange={(e) => setContactoVerificado(e.target.checked)}
                    />
                    <span>Contacto verificado oficialmente</span>
                  </label>

                  <label className="tick" style={{ fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={revisar}
                      onChange={(e) => setRevisar(e.target.checked)}
                    />
                    <span style={{ color: '#b32424', fontWeight: 600 }}>Marcar para revisión</span>
                  </label>

                  <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tipo de registro:
                    <select
                      value={tipoRegistro}
                      onChange={(e) => setTipoRegistro(e.target.value as 'empresa' | 'referencia_generica')}
                      style={{ padding: '2px 6px', fontSize: '12.5px' }}
                    >
                      <option value="empresa">Empresa real</option>
                      <option value="referencia_generica">Referencia genérica (no cuenta en totales ni mapa)</option>
                    </select>
                  </label>
                </div>

                <label style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  Nota o motivo de revisión:
                  <input
                    type="text"
                    maxLength={250}
                    placeholder="Ej: Teléfono no verificado / Falta confirmar ubicación exacta"
                    value={notaRevision}
                    onChange={(e) => setNotaRevision(e.target.value)}
                    style={{ padding: '4px 8px', fontSize: '12.5px' }}
                  />
                </label>
              </div>
            )}

            {/* OTRAS SUBCATEGORÍAS */}
            {activeTicks.has('otras_categorias') && (
              <div style={{ gridColumn: '1 / -1', marginTop: '6px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  {currentCategorySlug
                    ? 'Marcar otras subcategorías donde también aplica esta empresa:'
                    : 'Selecciona las subcategorías a las que pertenece esta empresa:'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                  (Aparecerá en los listados de cada una pero una sola vez en el mapa industrial)
                </span>
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid var(--line-soft)',
                    padding: '8px 10px',
                    background: 'var(--surface)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                    gap: '4px 12px'
                  }}
                >
                  {ALL_CATEGORIES.map((cat) => {
                    const isCurrent = cat.slug === currentCategorySlug;
                    const isChecked = selectedCats.has(cat.slug);
                    return (
                      <label
                        key={cat.slug}
                        className="tick"
                        style={{
                          fontSize: '12.5px',
                          color: isCurrent ? 'var(--ink)' : 'inherit',
                          fontWeight: isCurrent ? 600 : 400
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isCurrent}
                          onChange={() => toggleCategory(cat.slug)}
                        />
                        <span>
                          {cat.nombre} {isCurrent && <em style={{ fontSize: '11px', color: 'var(--muted)' }}>(actual)</em>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </fieldset>

        <div className="frow">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Guardando…' : empresaToEdit ? 'Guardar cambios' : 'Guardar empresa'}
          </button>
          {empresaToEdit && onCancelEdit && (
            <button
              type="button"
              className="btn"
              onClick={onCancelEdit}
              disabled={saving}
              style={{ border: '1px solid var(--line)', padding: '6px 14px', borderRadius: '2px' }}
            >
              Cancelar edición
            </button>
          )}
          {message && (
            <span id="msg" className={message.isError ? 'bad' : 'ok'} role="status">
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
