# Registro das operações de tratamento (LGP-01, LGP-02)

**Rascunho gerado a partir do schema do banco, para análise jurídica.** Bases legais e prazos são sugestões e dependem de decisão do controlador (o estúdio).

Controlador: (razão social e CNPJ do estúdio). Encarregado: (definir, LGP-07).

| Dado | Onde (tabela.coluna) | Finalidade | Base legal sugerida (LGPD art. 7º) | Retenção sugerida | Operadores |
| --- | --- | --- | --- | --- | --- |
| Nome da cliente | `clients.name` | Identificar a cliente no agendamento e no atendimento | Execução de contrato (V) | Enquanto houver relação + prazo fiscal | Supabase, Vercel |
| Telefone/WhatsApp | `clients.phone` | Confirmar horário e enviar lembretes | Execução de contrato (V) | Enquanto houver relação | Supabase, Vercel |
| E-mail | `clients.email` | (confirmar uso; sem finalidade definida, não coletar) | (definir) | (definir) | Supabase |
| Data de nascimento / aniversário | `clients.birth_date`, `clients.birthday` | Mensagem de aniversário (marketing de relacionamento) | Consentimento (I) ou legítimo interesse (IX) | Até revogação | Supabase |
| Consentimento LGPD | `clients.lgpd_consent` | Registrar o consentimento | Cumprimento de obrigação (II) | Enquanto o dado existir | Supabase |
| Observações | `clients.notes`, `appointments.notes` | Registro do atendimento | Execução de contrato (V) | Enquanto houver relação | Supabase |
| Agendamentos | `appointments.*` | Agenda do estúdio | Execução de contrato (V) | 5 anos (sugestão) | Supabase |
| Pagamentos e comissões | `transactions.*`, `commissions.*` | Controle financeiro e fiscal | Cumprimento de obrigação legal (II) | Prazo fiscal (5 anos) [Confirmar] | Supabase |
| Finanças pessoais | `personal_finances.*` (inclui `receiver_name`, `barcode`) | Controle financeiro da administradora | Dados da própria titular (não se aplica a terceiros) / execução de contrato | (definir) | Supabase |
| Equipe | `users.name`, `users.role`, `users.active` | Acesso ao portal e atribuição de tarefas | Execução de contrato de trabalho (V) | Enquanto houver vínculo | Supabase |
| Conta de login | `auth.users` (e-mail, senha com hash) | Autenticação | Execução de contrato (V) | Enquanto houver vínculo | Supabase |
| Trilha de auditoria | `access_logs` (conta, IP, navegador) | Segurança e prova de acesso | Legítimo interesse (IX) e art. 46 | 5 anos (sugestão) | Supabase |
| Tarefas internas | `internal_tasks.*`, `tarefa_itens.*` | Organização do trabalho (pode citar cliente) | Execução de contrato (V) | (definir) | Supabase |

## Pontos para o controlador decidir

- Direitos do titular (LGPD art. 18): canal de atendimento e prazo de resposta; hoje não há função de exportação nem de exclusão no app (LGP-04).
- Contratos com operadores (Supabase, Vercel) e transferência internacional (servidores fora do Brasil) [Confirmar a região do projeto Supabase].
- Política de privacidade publicada e coerente com esta tabela (LGP-06).
