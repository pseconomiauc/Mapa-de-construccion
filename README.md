# 🏗️ Cadena de la Construcción en Carabobo

Directorio industrial y mapa interactivo de la cadena de la construcción en el estado Carabobo, Venezuela.

## Descripción

Aplicación web que organiza **82 subcategorías** en **10 ramas industriales** del sector construcción. Cada subcategoría puede contener empresas con datos de contacto, ubicación geográfica y clasificación por tipo de actor (fabricante, distribuidor, contratista, servicio profesional, alquiler/logística).

Incluye un **mapa interactivo** con Leaflet que muestra la ubicación de las empresas sobre los 14 municipios de Carabobo, con agrupación por clusters y polígonos GeoJSON.

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Base de datos | Supabase (PostgreSQL + RLS) |
| Mapa | Leaflet + leaflet.markercluster |
| Excel | SheetJS (xlsx) |
| Estilo | CSS puro, estética Wikipedia |

## Requisitos Previos

- [Node.js](https://nodejs.org/) v18 o superior
- Una cuenta en [Supabase](https://supabase.com/) con el proyecto configurado

## Instalación Local

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd cadena-construccion-carabobo

# 2. Instalar dependencias
npm install

# 3. Crear archivo .env con las credenciales de Supabase
#    (ver sección "Variables de entorno")
cp .env.example .env

# 4. Ejecutar en modo desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`.

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica-anon
```

> **Nota:** Usa la **clave pública (anon/publishable)**, nunca la clave `service_role`.

## Estructura de la Base de Datos

El esquema SQL completo está en `supabase_schema.sql`. Las tablas principales son:

| Tabla | Descripción |
|---|---|
| `categorias` | 82 subcategorías organizadas en 10 ramas y grupos |
| `empresas` | Datos de cada empresa (nombre, dirección, coordenadas, contacto) |
| `empresa_categorias` | Relación muchos-a-muchos entre empresas y subcategorías |

Las políticas RLS (Row Level Security) están habilitadas para proteger los datos.

---

## Guía de Administración

### 📝 Agregar Editores

Los editores son usuarios que pueden crear, editar y eliminar empresas desde la aplicación.

1. **Crear usuario en Supabase Auth:**
   - Ve al panel de Supabase → **Authentication** → **Users**.
   - Pulsa **Add user** → **Create new user**.
   - Escribe el correo y una contraseña temporal.
   - Marca **Auto Confirm User** si quieres que se active inmediatamente.

2. **Asignar rol de editor** (opcional, para control granular):
   - En el **SQL Editor** de Supabase, ejecuta:
     ```sql
     INSERT INTO user_roles (user_id, role)
     VALUES ('<uuid-del-usuario>', 'editor');
     ```
   - Puedes encontrar el UUID en la tabla de usuarios de Auth.

3. El editor ya puede iniciar sesión desde la aplicación con el botón **"Iniciar sesión"** en la esquina superior derecha.

### 💾 Hacer Copias de Seguridad (Exportar Excel)

1. Inicia sesión como editor.
2. En la barra superior, pulsa **"Descargar Excel"**.
3. Se descargará un archivo `.xlsx` con todas las empresas y sus categorías.
4. Guarda este archivo como respaldo periódico.

### 📥 Restaurar Datos (Importar Excel)

1. Inicia sesión como editor.
2. En la barra superior, pulsa **"Importar Excel"** y selecciona el archivo `.xlsx`.
3. La aplicación mostrará una vista previa con:
   - Empresas nuevas a insertar.
   - Empresas existentes que se actualizarán (fusión sin duplicados).
   - Filas con errores (coordenadas fuera de Venezuela, subcategorías no reconocidas, etc.).
4. Revisa la vista previa y pulsa **"Confirmar importación"**.

### 📋 Actualizar Subcategorías

Las subcategorías se cargan desde la tabla `categorias` de Supabase.

1. Ve al panel de Supabase → **Table Editor** → `categorias`.
2. Para agregar una subcategoría:
   - Crea un nuevo registro con los campos: `slug`, `rama_id`, `rama_nombre`, `grupo`, `nombre`, `actores`, `orden`.
   - El `slug` debe ser único y en formato `kebab-case` (ej: `bloques-cemento`).
3. Para editar una existente, modifica los campos directamente.
4. Recarga la aplicación para ver los cambios.

> **Importante:** Los datos estáticos del árbol de categorías también están en `src/data/cadenaData.ts`. Si agregas subcategorías en Supabase pero quieres que aparezcan en la navegación lateral, también debes actualizar ese archivo y reconstruir la aplicación.

---

## Despliegue

### Opción A: GitHub Pages

El repositorio incluye el workflow `.github/workflows/deploy-pages.yml`. Para activarlo:

1. Sube el proyecto a GitHub. La ruta base se ajusta automáticamente al nombre del repositorio durante el workflow.
2. En GitHub, abre **Settings → Secrets and variables → Actions** y crea estos secretos del repositorio:
   - `VITE_SUPABASE_URL` → URL pública de tu proyecto Supabase.
   - `VITE_SUPABASE_ANON_KEY` → clave pública `anon`/publishable.
3. En **Settings → Pages**, selecciona **GitHub Actions** como fuente de publicación.
4. Haz push a `main` o `master`. El workflow compilará y publicará automáticamente la aplicación.

La URL quedará con este formato: `https://<usuario>.github.io/Mapa-de-construccion/`.
Las credenciales `VITE_*` quedan incorporadas al bundle del navegador, por lo que deben ser únicamente la URL pública y la clave `anon`/publishable. La seguridad depende de las políticas RLS de Supabase; nunca uses una clave `service_role`.

### Opción B: Netlify

1. Sube el repositorio a GitHub/GitLab.
2. Ve a [Netlify](https://app.netlify.com/) → **Add new site** → **Import an existing project**.
3. Conecta tu repositorio.
4. Configuración de build:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. En **Environment variables**, agrega:
   - `VITE_SUPABASE_URL` → tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` → tu clave pública
6. Pulsa **Deploy site**.

> El archivo `public/_redirects` ya está incluido para que las rutas SPA funcionen correctamente.

### Opción C: Vercel

1. Sube el repositorio a GitHub/GitLab.
2. Ve a [Vercel](https://vercel.com/) → **Add New** → **Project**.
3. Importa tu repositorio.
4. Vercel detectará automáticamente que es un proyecto Vite.
5. En **Environment Variables**, agrega:
   - `VITE_SUPABASE_URL` → tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` → tu clave pública
6. Pulsa **Deploy**.

> El archivo `vercel.json` ya está incluido para las reescrituras SPA.

### Dominio Personalizado

Tanto Netlify como Vercel permiten conectar un dominio personalizado:

1. En la configuración del sitio, busca **Domains** o **Custom Domains**.
2. Agrega tu dominio (ej: `construccion-carabobo.com`).
3. Sigue las instrucciones para configurar los registros DNS (generalmente un CNAME).
4. Ambas plataformas generan automáticamente un certificado SSL/HTTPS.

---

## Comandos Útiles

```bash
# Desarrollo local
npm run dev

# Compilar para producción
npm run build

# Vista previa del build de producción
npm run preview
```

## Estructura del Proyecto

```
├── index.html                 # Punto de entrada HTML
├── public/
│   ├── data/
│   │   └── carabobo_municipios.geojson  # Polígonos de los 14 municipios
│   └── _redirects             # Reglas de redirección para Netlify
├── src/
│   ├── App.tsx                # Componente principal y enrutamiento
│   ├── main.tsx               # Punto de entrada React con ErrorBoundary
│   ├── index.css              # Estilos globales (estética Wikipedia)
│   ├── components/
│   │   ├── Header.tsx         # Cabecera con estadísticas y navegación
│   │   ├── EditorBar.tsx      # Autenticación de editores
│   │   ├── Sidebar.tsx        # Panel lateral con ramas
│   │   ├── CategoryTree.tsx   # Árbol de subcategorías
│   │   ├── CategoryDetailView.tsx  # Vista detalle de subcategoría + CRUD
│   │   ├── CompanyForm.tsx    # Formulario de empresa con geolocalización
│   │   ├── ExcelToolbar.tsx   # Botones de exportar/importar Excel
│   │   ├── ImportPreviewModal.tsx  # Vista previa de importación
│   │   ├── LocationPickerModal.tsx # Selector visual de ubicación en mapa
│   │   └── Map/
│   │       └── MapView.tsx    # Mapa industrial con Leaflet
│   ├── data/
│   │   └── cadenaData.ts      # Datos estáticos del árbol de categorías
│   ├── lib/
│   │   └── supabase.ts        # Cliente Supabase
│   ├── services/
│   │   ├── excelService.ts    # Lógica de exportación/importación Excel
│   │   └── nominatimService.ts # Geocodificación con Nominatim (OSM)
│   ├── types/
│   │   └── database.ts        # Tipos TypeScript
│   └── utils/
│       └── geoUtils.ts        # Utilidades geográficas (punto-en-polígono)
├── supabase_schema.sql        # Esquema SQL completo
├── vercel.json                # Configuración de Vercel
├── vite.config.ts             # Configuración de Vite
└── .env                       # Variables de entorno (no subir a Git)
```

## Licencia

Proyecto privado. Todos los derechos reservados.
