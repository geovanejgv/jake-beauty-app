-- =============================================================================
-- Lembrete do agendamento por WhatsApp (tela Agenda): guarda quando a equipe abriu
-- a mensagem de lembrete para a cliente, separado da confirmação (whatsapp_sent_at).
--  - Só uma coluna nova em appointments; vale o RLS já existente (quem edita o
--    atendimento marca o lembrete; profissional só com permissão de editar a agenda).
--  - Coluna fora do congelamento do fechamento de comissão (não afeta pagamento).
--  - Sem DROP, DELETE ou UPDATE de dados existentes.
-- =============================================================================

begin;

alter table public.appointments add column if not exists lembrete_enviado_em timestamptz;

comment on column public.appointments.lembrete_enviado_em is
  'Quando a equipe abriu o lembrete do agendamento no WhatsApp para a cliente.';

commit;
