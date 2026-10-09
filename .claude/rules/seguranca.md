# Regras de segurança do agente

Fonte única: `docs/seguranca/requisitos.md`. Esta regra só aponta IDs; não copie texto de requisito para cá.

Este app é uma SPA (Vite + React) que fala direto com o Supabase: a fronteira de segurança é o RLS do banco. A adaptação de cada ID está em `docs/seguranca/matriz.md`.

Ao alterar este repositório:

1. Aplique todos os requisitos `C` e `I` pertinentes ao trecho alterado, sem esperar pedido.
2. Conduta obrigatória do agente: DEP-01, DEV-01, DEV-02, DEV-03, DEV-06, DEV-07, SEG-06, TST-02.
3. Toda tabela nova nasce com RLS e política por operação na mesma migração (AUZ-04), usando `public.usuario_ativo()` ou `public.usuario_admin()`; nunca `using (true)`. Função `security definer` sempre com `set search_path = public, pg_temp`.
4. Regra de acesso escondida na tela também é barrada no banco (AUZ-07). Papel e status vêm de `public.users`, nunca da tela (AUZ-06).
5. Erros na tela só por `src/lib/seguranca/erros.ts` (LOG-01); logs só por `src/lib/seguranca/logger.ts` (LOG-04); nunca mostrar `error.message` do banco.
6. Variáveis de ambiente só por `src/lib/env.ts` (SEG-01); tudo com `VITE_` vai para o navegador, então nada privado no front (SEG-03, AUZ-05).
7. Script ou estilo novo de terceiro exige ajuste da CSP em `vercel.json` (CAB-01); sem script inline.
8. Produção (DEV-02): o usuário autorizou em 2026-10-09 que migração testada em supabase/tests/seguranca/run.sh e supabase/tests/kanban/run.sh seja aplicada sem nova pergunta. Exclusão de dados, autenticação/autorização, Edge Function e painéis continuam pedindo "autorizo".
9. Ao concluir, relate IDs atendidos com `arquivo:linha` ou teste, e IDs pendentes (DEV-04); atualize `docs/seguranca/matriz.md` e `docs/seguranca/pendencias-humanas.md`.
10. Merge do próprio pull request com as verificações verdes e sem conflito, exceto nos temas de TST-02 e em migração com exclusão de dados.
