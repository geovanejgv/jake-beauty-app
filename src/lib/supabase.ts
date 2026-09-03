import { createClient } from '@supabase/supabase-js';

// Coloque sua URL e Chave reais entre as aspas simples:
const supabaseUrl = 'https://mkjruwxiyjonqgnefkbw.supabase.co';
const supabaseKey = 'sb_publishable_HrJE3pOHfvKBl6AwcOUABQ_nKjJrEC9';

export const supabase = createClient(supabaseUrl, supabaseKey);