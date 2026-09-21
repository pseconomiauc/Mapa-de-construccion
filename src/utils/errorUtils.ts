/**
 * Extrae un mensaje legible de cualquier error, incluyendo errores de
 * Supabase (PostgrestError), que son objetos planos con `message` pero
 * no son instancias de `Error` (por lo que `String(err)` da "[object Object]").
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }

  if (typeof err === 'string') return err;

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
