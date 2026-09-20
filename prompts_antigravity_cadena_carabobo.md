# Prompts para Antigravity: Cadena de la Construcción en Carabobo

## Cómo usar este documento
1. Adjunta a Antigravity los dos archivos de referencia: `referencia_cadena_carabobo.html` (prototipo de la cadena y el directorio) y `mapa_industrial_carabobo.html` (prototipo del mapa).
2. Pega primero el **Prompt maestro**. Luego pega las partes **una por una**, en orden. No pases a la siguiente hasta que la anterior funcione y la hayas probado.
3. Al final del documento (Anexo A) está el listado completo de ramas, subcategorías y tipos de actor. Pégalo cuando la Parte 2 lo pida.
4. Necesitarás crear una cuenta gratuita en Supabase (base de datos) y otra en Netlify o Vercel (publicar el sitio). Antigravity te guiará; nunca pegues contraseñas en el chat, solo las claves públicas que él te pida.

---

## PROMPT MAESTRO (pegar primero)

Eres un ingeniero de software senior. Vamos a construir por partes una aplicación web llamada **"Cadena de la construcción en Carabobo"**.

**Objetivo:** un directorio de empresas del sector construcción del estado Carabobo (Venezuela), organizado por la cadena productiva (ramas > grupos > subcategorías), con un mapa industrial real (estado, municipios, calles) donde se vea la ubicación de las empresas. Cuando alguien agrega o edita una empresa, el cambio debe verse en el mapa y en el directorio al instante, sin cargar archivos.

**Reglas de trabajo:**
1. Trabaja UNA parte a la vez. Antes de escribir código, muéstrame un plan corto. Al terminar, resume qué hiciste, cómo probarlo y qué decisiones tomaste, y detente hasta que yo escriba "continuar".
2. Toda la interfaz en español (Venezuela). Comentarios del código también en español.
3. El usuario final no es técnico: mensajes de error claros y accionables, sin jerga.
4. Nunca escribas claves o contraseñas en el código. Usa variables de entorno (`.env`) y explícame dónde obtener cada valor.
5. Diseño responsive (funciona en celular) y accesible (teclado, contraste).
6. Prefiere soluciones simples y con pocas dependencias. Si propones algo distinto al stack de abajo, justifícalo en dos líneas.

**Stack propuesto:** React + Vite + TypeScript; Supabase (Postgres, Auth, Realtime); Leaflet + leaflet.markercluster para el mapa; SheetJS (xlsx) para Excel; despliegue en Netlify o Vercel.

**Estilo visual (tipo Wikipedia, minimalista):**
- Fondo blanco siempre (sin modo oscuro), texto #202122, texto secundario #54595d, líneas #a2a9b1 y #eaecf0, enlaces azul #3366cc.
- Títulos en serif (Georgia / Linux Libertine) con línea inferior fina; cuerpo en sans-serif del sistema, 15 px.
- Nada de tarjetas con sombras ni colores llamativos. Listas con viñetas, bordes de 1 px, botones sobrios.
- Etiquetas de tipo de actor como pequeñas casillas grises con la letra (F, D, C, S, A).

**Tipos de actor** (indican qué clase de empresa ofrece cada producto o servicio; una subcategoría puede tener dos, por ejemplo F/A):
F = Fabricante · D = Distribuidor · C = Contratista · S = Servicio profesional · A = Alquiler / logística.

Confirma que entendiste y espera mi primera instrucción (Parte 1).

---

## PARTE 1: Proyecto, base de datos y seguridad

Crea el proyecto y la base de datos en Supabase.

**Tablas:**
- `categorias`: `slug` (texto, clave primaria), `rama_id` (número), `rama_nombre`, `grupo`, `nombre`, `actores` (arreglo de texto con valores F, D, C, S, A), `orden` (número).
- `empresas`: `id` (uuid), `nombre` (texto, **obligatorio**), `direccion`, `municipio` (uno de los 14 municipios de Carabobo, ver abajo), `lat` y `lng` (decimales, opcionales), `productos`, `servicios`, `marca`, `telefono`, `correo`, `creado_en`, `actualizado_en`, `creado_por`. Todos los campos excepto `nombre` son opcionales (pueden ser nulos).
- `empresa_categorias`: relación muchos a muchos entre empresa y subcategoría (`empresa_id`, `categoria_slug`). Una misma empresa suele ofrecer varios productos y debe aparecer una sola vez en el mapa.

**Los 14 municipios de Carabobo:** Bejuma, Carlos Arvelo, Diego Ibarra, Guacara, Juan José Mora, Libertador, Los Guayos, Miranda, Montalbán, Naguanagua, Puerto Cabello, San Diego, San Joaquín, Valencia.

**Seguridad (Row Level Security):** cualquier persona puede leer; solo usuarios autenticados con rol "editor" pueden crear, editar o borrar empresas. Explícame cómo dar de alta editores. Pregúntame si prefiero que la lectura también requiera iniciar sesión.

**Criterio de aceptación:** las tablas existen, las reglas de seguridad están activas y puedes demostrarme con una consulta de prueba que un usuario anónimo puede leer pero no escribir.

---

## PARTE 2: Datos semilla y página de la cadena

1. Carga en `categorias` todo el listado del **Anexo A** (10 ramas, 82 subcategorías con sus tipos de actor). El `slug` de cada subcategoría debe ser el nombre sin tildes, en minúsculas y con guiones.
2. Construye la página principal:
   - Título "Cadena de la construcción en Carabobo" y un resumen ("10 ramas · 82 subcategorías · N empresas registradas").
   - Un recuadro con el significado de F, D, C, S, A.
   - Menú lateral izquierdo fijo con "Todas las ramas" y las 10 ramas, cada una con su contador. En celular pasa a barra horizontal.
   - Cada grupo (por ejemplo "2.3 Acero y metalurgia") es un bloque desplegable; dentro, la lista de subcategorías con sus etiquetas de actor y, al lado, "N empresas" cuando haya.
   - Buscador que ignora tildes y resalta coincidencias; filtros por tipo de actor; botones "Expandir todo" y "Contraer todo".
   - Cada subcategoría es un enlace a su propia página `/categoria/<slug>` (la construyes en la Parte 3).

**Criterio de aceptación:** se ven las 82 subcategorías, la búsqueda y los filtros funcionan y el diseño es sobrio y blanco como Wikipedia.

---

## PARTE 3: Directorio de empresas por subcategoría

Página `/categoria/<slug>`:
- Ruta de navegación (Cadena › rama › grupo), nombre de la subcategoría con sus etiquetas de actor y la lista de empresas registradas, ordenadas alfabéticamente.
- Cada empresa muestra solo los datos que tenga (dirección, municipio, coordenadas, productos, servicios, marca, teléfono como enlace `tel:`, correo como enlace `mailto:`), con botones Editar y Eliminar (con confirmación en la misma tarjeta, sin ventanas emergentes del navegador).
- Formulario "Agregar empresa": el **nombre es el único campo obligatorio**. Los demás son opcionales: el usuario marca con casillas cuáles quiere cargar y solo entonces aparece cada campo. El municipio es una lista desplegable.
- Al guardar, la empresa se asocia a esta subcategoría; permite además marcar otras subcategorías donde también aplica.
- Actualización en vivo con Supabase Realtime: si otra persona agrega una empresa, aparece sin recargar.
- Solo los editores ven los botones de escribir; los demás ven la lista en modo lectura.

**Criterio de aceptación:** puedo crear, editar y borrar empresas con solo el nombre, y con cualquier combinación de datos opcionales; los contadores de la página principal se actualizan solos.

---

## PARTE 4: Importar y exportar Excel

- Botón **Descargar Excel**: hoja "Empresas" con una fila por empresa (columnas: Subcategorías separadas por punto y coma, Empresa, Dirección, Municipio, Latitud, Longitud, Productos, Servicios, Marca, Teléfono, Correo) y hoja "Cadena" con las 82 subcategorías y su número de empresas.
- Botón **Plantilla**: Excel vacío con esas columnas y una hoja con los nombres exactos de las subcategorías válidas.
- Botón **Importar Excel** (.xlsx o .csv): lee la hoja "Empresas", muestra una vista previa con el resumen (nuevas, ya existentes que se omiten, filas con problemas y por qué) y solo guarda al confirmar. Reglas: sin nombre se omite; subcategoría inexistente se omite; misma empresa (mismo nombre, sin distinguir tildes ni mayúsculas) no se duplica sino que se le añaden las subcategorías nuevas; coordenadas fuera de Venezuela se rechazan.
- Muestra progreso durante la importación.

**Criterio de aceptación:** exporto, borro una empresa, reimporto el archivo y se restaura sin duplicados.

---

## PARTE 5: Mapa industrial

Página `/mapa` con mapa a pantalla completa y panel lateral:
- **Mapa base:** OpenStreetMap (Leaflet). Incluir selector de capas: calles, satélite (Esri World Imagery) y topográfico. Atribución visible.
- **Límites:** contorno del estado Carabobo y de sus 14 municipios. No los descargues en cada visita: descárgalos UNA vez durante el desarrollo desde OpenStreetMap con Overpass (estado `admin_level=4` con nombre Carabobo; municipios `admin_level=6` dentro de él; verifica los niveles, ajústalos si difieren), simplifícalos y guárdalos en el proyecto como `public/data/carabobo_municipios.geojson`. Al pasar el cursor por un municipio se muestra su nombre; al hacer clic se filtran sus empresas.
- **Empresas:** un marcador por empresa con coordenadas (no uno por subcategoría), con agrupación automática cuando hay muchos, coloreado según su tipo de actor (F azul, D verde, C ocre, S morado, A rosa). Al pulsar: nombre, subcategorías, datos disponibles y enlace "Cómo llegar" a Google Maps.
- **Municipio automático:** si una empresa tiene coordenadas pero no municipio, calcúlalo con punto-en-polígono usando el GeoJSON.
- **Panel lateral:** buscador, filtros por rama, tipo de actor y municipio, leyenda con conteos, lista de empresas (clic = acercar al punto y abrir el detalle) y una lista aparte "Sin ubicación" con las empresas que aún no tienen coordenadas.
- **Datos en vivo:** lee de Supabase y se actualiza solo cuando se agrega o cambia una empresa (Realtime). Sin cargar archivos.

**Criterio de aceptación:** al guardar una empresa con coordenadas en la Parte 3, aparece en el mapa en segundos sin recargar; los filtros y el clic en municipios funcionan.

---

## PARTE 6: Ubicar empresas fácilmente

En el formulario de empresa (Parte 3) agrega:
- Botón **"Marcar en el mapa"**: abre un mapa donde el usuario hace clic o arrastra un pin; al confirmar se rellenan latitud, longitud y municipio.
- Campo de coordenadas que acepta pegar el par completo copiado de Google Maps (por ejemplo `10.1620, -68.0077`) y lo separa solo. Valida que esté dentro de Venezuela.
- Botón opcional **"Buscar dirección"** con Nominatim (OpenStreetMap): solo cuando el usuario lo pulse, máximo una consulta por segundo y con el encabezado de identificación que exige su política de uso. Aclara en pantalla que las direcciones en Venezuela suelen ser imprecisas y que siempre se debe verificar y ajustar el pin.

**Criterio de aceptación:** puedo ubicar una empresa en menos de 20 segundos con cualquiera de los tres métodos.

---

## PARTE 7: Acceso, pulido y publicación

- Inicio de sesión para editores (correo y contraseña o enlace mágico de Supabase). Página sencilla para ver quién está conectado. Los lectores no necesitan cuenta (salvo que yo lo haya pedido en la Parte 1).
- Revisión de accesibilidad, rendimiento (probar con 1.000 empresas) y comportamiento en celular.
- Publica en Netlify o Vercel con el mapa funcionando bajo https (necesario para OpenStreetMap). Explícame paso a paso cómo conectar las variables de entorno y el dominio.
- Escribe un `README.md` en español con: cómo agregar editores, cómo hacer copias de seguridad (exportar Excel), cómo actualizar el listado de subcategorías y cómo restaurar.
- Prueba final de extremo a extremo: crear empresa con ubicación, verla en el mapa, editarla, exportar, importar.

---

## ANEXO A: Ramas, subcategorías y tipos de actor

Formato: `## rama`, `### grupo`, `- subcategoría [tipos de actor]`. Un grupo sin viñetas debajo es en sí mismo una subcategoría.

```
## 1. Extracción y recursos primarios
### 1.1 Minería no metálica
- Áridos (grava, arena) [F]
- Rocas ornamentales (granito, mármol) [F]
- Calizas y arcillas [F]
### 1.2 Minería metálica
- Hierro, bauxita, cobre [F]
### 1.3 Otros recursos
- Madera cruda (sector forestal) [F]
- Agua industrial [S]
- Hidrocarburos y derivados [F]
## 2. Manufactura de materiales
### 2.1 Cemento, concreto y prefabricados
- Cemento (gris, blanco, especial) y clinker [F]
- Concreto premezclado y morteros [F]
- Cal y yeso [F]
- Bloques, adoquines y tuberías de concreto [F]
- Vigas pretensadas y losacero [F]
### 2.2 Cerámica, vidrio y sistemas livianos
- Ladrillos y tejas [F]
- Baldosas y porcelanatos [F]
- Piezas sanitarias [F]
- Vidrio (plano, templado, laminado) [F]
- Drywall y fibrocemento [F]
### 2.3 Acero y metalurgia
- Cabillas, mallas y estribos [F]
- Perfiles y planchas estructurales [F]
- Láminas de techo (galvanizadas, termoacústicas, zinc) [F]
- Aluminio para ventanas [F]
- Clavos, tornillos y anclajes [F]
### 2.4 Plásticos y química
- Tuberías PVC, CPVC, PEAD y PPR [F]
- Tanques de polietileno [F]
- Pinturas, masillas y anticorrosivos [F]
- Impermeabilizantes, mantos asfálticos y selladores [F]
- Aditivos, pegamentos y resinas [F]
### 2.5 Material eléctrico
- Cables (baja, media y alta tensión) [F]
- Canalizaciones (EMT, IMC, bandejas) [F]
- Tableros y breakers [F]
- Tomacorrientes, apagadores y luminarias [F]
### 2.6 Madera y derivados
- Madera para encofrado y andamiaje [F]
- Tableros (plywood, MDF, MDP) [F]
- Puertas, marcos y carpintería [F]
### 2.7 Prefabricación y ensamblaje
- Estructuras modulares y paneles SIP [F]
- Fachadas y ventanas preensambladas [F]
## 3. Distribución y comercio de materiales
### 3.1 Ferreterías y depósitos de materiales [D]
### 3.2 Distribuidores especializados
- Acero [D]
- Material eléctrico [D]
- Sanitarios y grifería [D]
- Pinturas [D]
- Acabados [D]
### 3.3 Importadores [D]
### 3.4 Transporte y fletes de carga [A]
## 4. Servicios profesionales y técnicos
### 4.1 Estudios previos
- Topografía y geotecnia [S]
- Estudios ambientales [S]
### 4.2 Diseño e ingeniería
- Arquitectura y BIM [S]
- Cálculo estructural [S]
- Proyectos MEP [S]
### 4.3 Gestión y control
- Permisos y licencias [S]
- Gerencia e inspección de obra [S]
- Laboratorios de control de calidad [S]
- Seguridad industrial y dotación (EPP) [S]
## 5. Ejecución de obra
### 5.1 Tipos de contratista
- Edificación residencial y no residencial [C]
- Obras civiles e infraestructura [C]
- Subcontratistas por especialidad [C]
### 5.2 Etapas de obra
- Preliminares y cimentación (movimiento de tierras, pilotes, zapatas) [C]
- Obra negra: estructura, columnas, vigas y losas [C]
- Obra gris: instalaciones MEP, HVAC, domótica y cableado [C]
- Obra blanca: pisos, estucos, pintura, carpintería y paisajismo [C]
## 6. Equipos, maquinaria y suministros especiales
### 6.1 Maquinaria pesada
- Grúas, excavadoras, mezcladoras [F/A]
### 6.2 Andamios y encofrados [F/A]
### 6.3 Equipos de edificación
- Ascensores y escaleras mecánicas [F/S]
- HVAC [F/S]
- Bombas e hidroneumáticos [F/S]
- Transformadores [F/S]
## 7. Financiamiento y comercialización
### 7.1 Banca, fiducias y créditos puente [S]
### 7.2 Seguros (todo riesgo) [S]
### 7.3 Inmobiliarias, corretaje y avalúos [S]
### 7.4 Notarías y registros [S]
## 8. Operación y fin de ciclo
### 8.1 Facility management y mantenimiento [S]
### 8.2 Demolición técnica [C]
### 8.3 Reciclaje de residuos (RCD), retorna a la rama 2 [F/S]
## 9. Demanda final
### Quién compra
- Familias
- Sector público: gobernación, alcaldías y ministerios
- Empresas privadas e industria
## 10. Referencia territorial: Carabobo
### Municipios y zonas
- Valencia
- Los Guayos
- Guacara
- San Diego
- Puerto Cabello
- Otros municipios
```
