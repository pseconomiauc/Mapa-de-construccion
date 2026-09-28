-- ==============================================================================
-- AUTOCOMPLETAR tipo_actor para empresas ya existentes
-- ==============================================================================
-- Requisito: haber corrido antes scripts/agregar_tipo_actor.sql (crea la columna).
--
-- Qué hace:
-- Para cada empresa que TODAVÍA no tiene tipo_actor asignado (recién creada la
-- columna, todas empiezan vacías), le asigna la unión de los roles típicos
-- ("actores") de TODAS las subcategorías a las que pertenece. Por ejemplo, si
-- una empresa está en "Fabricación de bloques" (típicamente Fabricante) y
-- también en "Ferretería" (típicamente Distribuidor), quedará marcada como
-- Fabricante Y Distribuidor.
--
-- Es solo un punto de partida automático basado en el sector: revisa después
-- caso por caso en el panel de gestión y ajusta con el botón "Editar" las
-- empresas que en realidad no encajen con el rol típico de su sector.
--
-- Es seguro ejecutarlo más de una vez: NUNCA pisa una empresa que ya tenga
-- algún tipo_actor asignado manualmente, solo completa las que están vacías.
--
-- Instrucciones: Supabase → SQL Editor → New query → pega y ejecuta.
-- ==============================================================================

WITH actor_union AS (
    SELECT
        ec.empresa_id,
        array_agg(DISTINCT a ORDER BY a) AS actores
    FROM public.empresa_categorias ec
    JOIN public.categorias c ON c.slug = ec.categoria_slug
    CROSS JOIN LATERAL unnest(c.actores) AS a
    GROUP BY ec.empresa_id
)
UPDATE public.empresas e
SET tipo_actor = au.actores
FROM actor_union au
WHERE e.id = au.empresa_id
  AND (e.tipo_actor IS NULL OR array_length(e.tipo_actor, 1) IS NULL);
