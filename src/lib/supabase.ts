import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// URL e chave PÚBLICA (publishable) vêm das variáveis de ambiente (SEG-01, SEG-03).
// O acesso real aos dados é controlado pelo RLS do banco (AUZ-04).
const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = env();

export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY);
