// Agenda: o banco confere quem pode alterar o atendimento (RLS de appointments).
import { supabase } from '../../lib/supabase';

/** Registra que a equipe abriu o lembrete do agendamento no WhatsApp. */
export async function marcarLembreteEnviado(id: string) {
  const { error } = await supabase.from('appointments').update({ lembrete_enviado_em: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
