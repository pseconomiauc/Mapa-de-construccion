import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || 'https://szippfislyfvfpjwbcuv.supabase.co';
// Se limpia /rest/v1/ o barras finales ya que el SDK de Supabase requiere la URL base del proyecto
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_34A9RMnvtPrNz2zE2LaEvw_cyaeZNTm';

export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('tu-proyecto') &&
  !supabaseAnonKey.includes('tu-clave')
);

// Cliente Supabase instanciado con la clave pública anónima
export const supabase = createClient(
  supabaseUrl || 'https://szippfislyfvfpjwbcuv.supabase.co',
  supabaseAnonKey || 'sb_publishable_34A9RMnvtPrNz2zE2LaEvw_cyaeZNTm'
);
