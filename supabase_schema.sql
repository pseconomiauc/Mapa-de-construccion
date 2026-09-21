-- ==============================================================================
-- CADENA DE LA CONSTRUCCIÓN EN CARABOBO
-- Script de Base de Datos y Seguridad (Supabase PostgreSQL)
-- ==============================================================================
-- Instrucciones:
-- 1. Ve a tu proyecto en Supabase (https://supabase.com/dashboard).
-- 2. Entra en el menú lateral en "SQL Editor".
-- 3. Crea una "New Query", pega todo este contenido y pulsa "Run" (Ejecutar).
-- ==============================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLA: categorias
-- Contiene las 8 ramas, 26 grupos y 76 subcategorías de la cadena productiva
CREATE TABLE IF NOT EXISTS public.categorias (
    slug text PRIMARY KEY,
    codigo text UNIQUE,
    rama_id integer NOT NULL,
    rama_codigo text NOT NULL,
    rama_nombre text NOT NULL,
    grupo_id integer NOT NULL,
    grupo_codigo text NOT NULL,
    grupo text NOT NULL,
    id_subcategoria integer,
    id_grupo integer,
    nombre text NOT NULL,
    actores text[] NOT NULL DEFAULT '{}',
    orden integer NOT NULL DEFAULT 0
);

-- Comentarios descriptivos
COMMENT ON TABLE public.categorias IS 'Subcategorías de la cadena de la construcción en Carabobo (8 ramas, 26 grupos, 76 subcategorías)';
COMMENT ON COLUMN public.categorias.slug IS 'Identificador legible y clave primaria estable (ej: 1.1.1)';
COMMENT ON COLUMN public.categorias.actores IS 'Arreglo con códigos de actor válidos: F, D, C, S, A';

-- 3. TABLA: empresas
-- Directorio de empresas del sector construcción de Carabobo
CREATE TABLE IF NOT EXISTS public.empresas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    direccion text,
    direccion_precisa boolean NOT NULL DEFAULT true,
    municipio text CHECK (
        municipio IS NULL OR municipio IN (
            'Bejuma',
            'Carlos Arvelo',
            'Diego Ibarra',
            'Guacara',
            'Juan José Mora',
            'Libertador',
            'Los Guayos',
            'Miranda',
            'Montalbán',
            'Naguanagua',
            'Puerto Cabello',
            'San Diego',
            'San Joaquín',
            'Valencia'
        )
    ),
    lat numeric(10, 7),
    lng numeric(10, 7),
    productos text,
    productos_original text,
    servicios text,
    marca text,
    telefono text,
    whatsapp text,
    correo text,
    revisar boolean NOT NULL DEFAULT false,
    nota_revision text,
    contacto_verificado boolean NOT NULL DEFAULT false,
    fuente text,
    tipo_registro text NOT NULL DEFAULT 'empresa' CHECK (tipo_registro IN ('empresa', 'referencia_generica')),
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.empresas IS 'Empresas registradas en la cadena de la construcción';
COMMENT ON COLUMN public.empresas.nombre IS 'Nombre o razón social de la empresa (único campo obligatorio)';
COMMENT ON COLUMN public.empresas.municipio IS 'Uno de los 14 municipios oficiales del estado Carabobo';

-- Trigger para mantener actualizado el campo actualizado_en automáticamente
CREATE OR REPLACE FUNCTION public.set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_empresas_actualizado_en ON public.empresas;
CREATE TRIGGER trigger_empresas_actualizado_en
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW
    EXECUTE FUNCTION public.set_actualizado_en();

-- 4. TABLA: empresa_categorias
-- Relación muchos a muchos entre empresas y subcategorías
CREATE TABLE IF NOT EXISTS public.empresa_categorias (
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    categoria_slug text NOT NULL REFERENCES public.categorias(slug) ON DELETE CASCADE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (empresa_id, categoria_slug)
);

COMMENT ON TABLE public.empresa_categorias IS 'Relación M:N entre empresas y subcategorías de la cadena';

-- Índices para búsquedas y consultas rápidas
CREATE INDEX IF NOT EXISTS idx_empresas_municipio ON public.empresas(municipio);
CREATE INDEX IF NOT EXISTS idx_empresas_coordenadas ON public.empresas(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresa_categorias_slug ON public.empresa_categorias(categoria_slug);
CREATE INDEX IF NOT EXISTS idx_categorias_rama ON public.categorias(rama_id, orden);

-- 5. ROLES Y CONTROL DE EDITORES
-- Tabla para registrar qué usuarios de auth.users tienen privilegios de edición
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('editor', 'admin')),
    creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_roles IS 'Roles asignados a usuarios del sistema';

-- Función de seguridad para comprobar si el usuario actual es editor o admin
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    current_uid uuid;
    is_in_roles boolean;
    has_jwt_role boolean;
BEGIN
    current_uid := auth.uid();
    IF current_uid IS NULL THEN
        RETURN false;
    END IF;

    -- Verificar en tabla user_roles
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = current_uid AND role IN ('editor', 'admin')
    ) INTO is_in_roles;

    IF is_in_roles THEN
        RETURN true;
    END IF;

    -- Verificar en JWT app_metadata (opcional si se usa asignación directa de Supabase)
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('editor', 'admin'),
        false
    ) INTO has_jwt_role;

    RETURN has_jwt_role;
END;
$$;

-- 6. SEGURIDAD (ROW LEVEL SECURITY - RLS)
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas previas si existieran
DROP POLICY IF EXISTS "Lectura publica de categorias" ON public.categorias;
DROP POLICY IF EXISTS "Editores pueden gestionar categorias" ON public.categorias;

DROP POLICY IF EXISTS "Lectura publica de empresas" ON public.empresas;
DROP POLICY IF EXISTS "Editores pueden insertar empresas" ON public.empresas;
DROP POLICY IF EXISTS "Editores pueden actualizar empresas" ON public.empresas;
DROP POLICY IF EXISTS "Editores pueden eliminar empresas" ON public.empresas;

DROP POLICY IF EXISTS "Lectura publica de empresa_categorias" ON public.empresa_categorias;
DROP POLICY IF EXISTS "Editores pueden insertar empresa_categorias" ON public.empresa_categorias;
DROP POLICY IF EXISTS "Editores pueden actualizar empresa_categorias" ON public.empresa_categorias;
DROP POLICY IF EXISTS "Editores pueden eliminar empresa_categorias" ON public.empresa_categorias;

DROP POLICY IF EXISTS "Lectura de roles propia o para editores" ON public.user_roles;

-- POLÍTICAS: categorias
-- Lectura pública para cualquier usuario (anónimo o autenticado)
CREATE POLICY "Lectura publica de categorias"
    ON public.categorias FOR SELECT
    USING (true);

-- Solo editores pueden modificar el catálogo de categorías
CREATE POLICY "Editores pueden gestionar categorias"
    ON public.categorias FOR ALL
    TO authenticated
    USING (public.is_editor())
    WITH CHECK (public.is_editor());

-- POLÍTICAS: empresas
-- Lectura pública
CREATE POLICY "Lectura publica de empresas"
    ON public.empresas FOR SELECT
    USING (true);

-- Inserción, actualización y borrado: cualquier usuario con cuenta registrada
-- (autenticado en Supabase Auth), sin requerir aprobación manual de un admin.
CREATE POLICY "Editores pueden insertar empresas"
    ON public.empresas FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Editores pueden actualizar empresas"
    ON public.empresas FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Editores pueden eliminar empresas"
    ON public.empresas FOR DELETE
    TO authenticated
    USING (true);

-- POLÍTICAS: empresa_categorias
CREATE POLICY "Lectura publica de empresa_categorias"
    ON public.empresa_categorias FOR SELECT
    USING (true);

CREATE POLICY "Editores pueden insertar empresa_categorias"
    ON public.empresa_categorias FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Editores pueden actualizar empresa_categorias"
    ON public.empresa_categorias FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Editores pueden eliminar empresa_categorias"
    ON public.empresa_categorias FOR DELETE
    TO authenticated
    USING (true);

-- POLÍTICAS: user_roles
-- Cada usuario puede ver su propio rol, y los editores pueden ver los roles
CREATE POLICY "Lectura de roles propia o para editores"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_editor());

-- 7. HABILITACIÓN DE SUPABASE REALTIME
-- Permite que la web reciba cambios en vivo al insertar/editar/borrar
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'empresas'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.empresas;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'empresa_categorias'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.empresa_categorias;
    END IF;
END $$;
