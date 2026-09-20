-- ==============================================================================
-- CONSULTAS DE PRUEBA Y COMPROBACIÓN DE SEGURIDAD (RLS)
-- ==============================================================================
-- Ejecuta estas consultas en el SQL Editor de Supabase para validar
-- los criterios de aceptación de la Parte 1.
-- ==============================================================================

-- 1. CONSULTA DE PRUEBA DE LECTURA PÚBLICA (Debe permitir leer sin error):
SELECT count(*) AS total_categorias FROM public.categorias;
SELECT count(*) AS total_empresas FROM public.empresas;

-- 2. COMPROBACIÓN DE QUE EL ROL ANÓNIMO NO PUEDE ESCRIBIR:
-- Simulamos una sesión anónima en SQL de Postgres:
SET ROLE anon;

-- a) Intento de lectura anónima (Debe tener éxito):
SELECT count(*) AS lectura_anonima_ok FROM public.empresas;

-- b) Intento de inserción anónima (DEBE FALLAR con error de RLS: "new row violates row-level security policy"):
-- Descomenta la siguiente línea para comprobar el bloqueo de seguridad:
-- INSERT INTO public.empresas (nombre) VALUES ('Empresa No Autorizada');

-- Restaurar el rol normal de superusuario/postgres:
RESET ROLE;

-- 3. CÓMO DAR DE ALTA UN EDITOR:
-- Una vez que un usuario se haya registrado con su correo en Supabase Auth,
-- copia su UUID (disponible en Authentication > Users) y ejecuta:
--
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('PEGA-AQUI-EL-UUID-DEL-USUARIO', 'editor')
-- ON CONFLICT (user_id) DO UPDATE SET role = 'editor';
