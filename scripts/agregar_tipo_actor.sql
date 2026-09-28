-- ==============================================================================
-- MIGRACIÓN: agregar columna "tipo_actor" a empresas
-- ==============================================================================
-- Permite marcar cada empresa con uno o varios roles en la cadena productiva:
-- Fabricante (F), Distribuidor (D), Contratista (C), Servicio profesional (S)
-- o Alquiler / logística (A). Una empresa puede ser, por ejemplo, fabricante
-- Y distribuidor a la vez.
--
-- Instrucciones:
-- 1. Ve a tu proyecto en Supabase (https://supabase.com/dashboard).
-- 2. Entra en el menú lateral en "SQL Editor".
-- 3. Crea una "New Query", pega todo este contenido y pulsa "Run" (Ejecutar).
-- Es seguro ejecutarlo más de una vez (usa IF NOT EXISTS).
-- ==============================================================================

ALTER TABLE public.empresas
    ADD COLUMN IF NOT EXISTS tipo_actor text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'empresas_tipo_actor_valido'
    ) THEN
        ALTER TABLE public.empresas
            ADD CONSTRAINT empresas_tipo_actor_valido
            CHECK (tipo_actor <@ ARRAY['F', 'D', 'C', 'S', 'A']::text[]);
    END IF;
END $$;

COMMENT ON COLUMN public.empresas.tipo_actor IS 'Roles de la empresa en la cadena: F=Fabricante, D=Distribuidor, C=Contratista, S=Servicio profesional, A=Alquiler/logística. Puede tener varios (ej: fabricante y distribuidor a la vez)';
