# Matriz de segurança

Situação de cada requisito de `docs/seguranca/requisitos.md` neste projeto (SPA Vite + React + Supabase + Vercel, sem servidor próprio).

Situações: `atende`, `parcial`, `aguarda humano`, `não se aplica`, `pendente`.

Última atualização: 2026-10-04 (gestão do salão: papéis, catálogo, agenda, comissões e Kanban; migração 20261012120000 NÃO aplicada). A migração `20261011120000_seguranca_endurecimento.sql` foi **aplicada em produção em 2026-10-04** com aprovação do usuário; conferência: 0 tabelas sem RLS, 0 políticas `using (true)`, 0 funções executáveis por anon.

Resumo: 41 atende, 35 não se aplica, 28 aguarda humano, 20 parcial, 8 pendente (total 132).

## Adaptação da especificação a este projeto

- A especificação foi escrita para Next.js com servidor (middleware, rotas de API, cookies HttpOnly, Upstash). Este app é uma SPA: o navegador fala direto com o Supabase, e a fronteira de segurança é o **RLS do banco**. Por isso guarda, CSRF, cookies, limite de corpo e rate limit de API viraram `não se aplica` ou `parcial`, com a regra equivalente aplicada no banco.
- Cabeçalhos de segurança são servidos pela Vercel (`vercel.json`), não por middleware.
- Zod (validação) e Sentry (monitoramento) não foram adicionados: exigem dependência nova e aprovação (DEP-01).

## Exceções justificadas

- **SES-02**: sessão do supabase-js no `localStorage` (sem backend para cookie HttpOnly). Mitigada pela CSP sem script inline (CAB-01).
- **CAB-01**: `style-src 'unsafe-inline'`, porque o React aplica atributos `style` inline. Scripts sem exceção.
- **DEP-03**: auditoria das ferramentas de build sem bloquear até o salto de versão principal planejado.

## Requisitos

| ID | Prioridade | Situação | Evidência |
| --- | --- | --- | --- |
| SEG-01 | C | atende | `src/lib/env.ts:30` (único leitor, valida e falha listando só nomes); `vite.config.ts:8` (build falha sem variável); `tests/seguranca/varreduras.test.ts` "SEG-01"; `tests/seguranca/config-logs-erros.test.ts`; job "Build falha sem variáveis" em `.github/workflows/seguranca.yml`. Valores cadastrados na Vercel (Production e Preview) em 2026-10-04 com autorização do usuário. |
| SEG-02 | C | atende | `.gitignore` (`.env`, `.env.local`, `.env.*.local`); `tests/seguranca/varreduras.test.ts` "SEG-02" (`git check-ignore` e `git ls-files`). |
| SEG-03 | C | atende | `.env.example` marca [PÚBLICA]/[PRIVADA]; só existem variáveis públicas (SPA); `tests/seguranca/varreduras.test.ts` "SEG-03"; busca no bundle em `.github/workflows/seguranca.yml`. |
| SEG-04 | I | aguarda humano | pendencias-humanas.md item 1 (Production e Preview com valores próprios; hoje há um único projeto Supabase). |
| SEG-05 | I | parcial | Job gitleaks em `.github/workflows/seguranca.yml`. Falta ativar a proteção de push: pendencias-humanas.md item 7. |
| SEG-06 | C | atende | Nenhum segredo encontrado. A chave que estava em `src/lib/supabase.ts` é a publishable (pública por natureza, protegida pelo RLS): não exige revogação. Removida do código e movida para variável de ambiente. |
| SEG-07 | I | aguarda humano | Só há a chave publishable do Supabase. pendencias-humanas.md item 1. |
| SEG-08 | R | parcial | `docs/seguranca/rotacao-segredos.md`. Periodicidade a confirmar pelo usuário. |
| AUT-01 | C | atende | Supabase Auth (`signInWithPassword`, `src/pages/Login.tsx`); `tests/seguranca/varreduras.test.ts` "SES-06 e AUT-01". |
| AUT-02 | C | atende | Hash pelo Supabase Auth (bcrypt). Nenhuma coluna de senha nas tabelas do app (`public.users` só tem nome, papel e status). |
| AUT-03 | I | parcial | Tela "Alterar senha" (`src/components/AlterarSenhaModal.tsx`) exige 12 caracteres sem regra de composição (`src/lib/seguranca/senha.ts`); `tests/seguranca/senha.test.ts` "recusa senha de 11 caracteres". Falta repetir o mínimo e ativar senhas vazadas no Supabase Auth: pendencias-humanas.md itens 2 e 3. |
| AUT-04 | C | parcial | Administração global exige MFA concluído (aal2) **no banco** (`eh_admin_global()` confere a claim `aal` do token em toda função do painel, `supabase/migrations/20261017120000_estabelecimentos_admin_global.sql`) e na tela (`src/pages/AdminGlobal.tsx`); a Edge Function confere antes da chave de serviço. MFA TOTP disponível para todos em Configurações (`src/components/SegurancaMfa.tsx`). Teste: `supabase/tests/seguranca/estabelecimentos.test.sql` "sem MFA não é admin global". Pendente: exigir MFA também para a administradora de cada estabelecimento (pendencias-humanas.md item 4). |
| AUT-05 | C | aguarda humano | Sem gerador próprio de token (busca sem resultado). Expiração do link no Supabase Auth: pendencias-humanas.md item 3. |
| AUT-06 | I | atende | `src/pages/Login.tsx:23` mesma mensagem para conta inexistente e senha errada. Não há cadastro nem redefinição pelo app. |
| AUT-07 | I | parcial | Troca de senha exige a senha atual (reautenticação no Supabase Auth) antes de `updateUser` (`src/components/AlterarSenhaModal.tsx`). Aviso por e-mail da troca depende do Supabase Auth ("Password changed" nas notificações de segurança): pendencias-humanas.md item 3. Troca de e-mail e MFA não existem no app. |
| AUT-08 | C | atende | Nenhuma conta ou senha embutida; `tests/seguranca/varreduras.test.ts` "AUT-08". Não há seed. |
| SES-01 | C | não se aplica | SPA sem servidor próprio: o Supabase não usa cookie de sessão neste app. Ver exceção em SES-02. |
| SES-02 | I | parcial | Exceção registrada: o supabase-js guarda a sessão no `localStorage` (não há backend para cookie HttpOnly). Mitigação: CAB-01 tratado como crítico (CSP sem script inline, `script-src 'self'`, `vercel.json`); `tests/seguranca/varreduras.test.ts` "SES-02" garante que o app não grava token em outro lugar e que o resto do `localStorage` guarda só preferências de tela (tema, escopo de finanças, grupos do menu, visualização compacta dos cartões e formato da tela de quadros do Kanban em `src/features/kanban/components/ui.tsx`). |
| SES-03 | I | aguarda humano | pendencias-humanas.md item 3 (JWT expiry de até 3600 s, rotação e detecção de reuso de refresh token). |
| SES-04 | C | parcial | Logout revoga a sessão no Supabase Auth (`src/contexts/AuthContext.tsx`, `signOut({ scope: 'local' })`); troca de senha encerra as demais sessões (`signOut({ scope: 'others' })` em `src/components/AlterarSenhaModal.tsx`). O access token já emitido vale até expirar (limite do Supabase); por isso SES-03 pede validade curta. |
| SES-05 | C | não se aplica | Autenticação por cabeçalho Authorization (Bearer), não por cookie: não há CSRF. Nenhuma rota GET grava dados (PostgREST). |
| SES-06 | C | atende | JWT validado pelo próprio Supabase (PostgREST/Auth) a cada requisição; o app não decide acesso por token decodificado; `tests/seguranca/varreduras.test.ts`. |
| SES-07 | R | pendente | Sem expiração por inatividade. Depende de "Inactivity timeout" no Supabase Auth (plano Pro): pendencias-humanas.md item 3. |
| AUZ-01 | C | atende | Negação por padrão no banco: perfil ativo obrigatório e, na gestão do salão, acesso por papel (administradora global; profissional só o que é dela) em `supabase/migrations/20261012120000_gestao_salao.sql`; rotas da tela protegidas por papel e preferência (`src/App.tsx`, `RotaModulo`); `supabase/tests/seguranca/gestao.test.sql` e `supabase/tests/seguranca/seguranca.test.sql`. |
| AUZ-02 | C | atende | Isolamento por estabelecimento em toda tabela: política RLS restritiva `estabelecimento_id = estabelecimento_atual()` e gatilho `a0_estabelecimento_guarda` (grava só no próprio estabelecimento e só referencia registro do mesmo, inclusive dentro de funções security definer); funções que leem por conta própria filtram pelo estabelecimento (`supabase/migrations/20261017120000_estabelecimentos_admin_global.sql`). Dentro do estabelecimento, isolamento por profissional (RLS por `professional_id`/`profissional_id`). Testes: `supabase/tests/seguranca/estabelecimentos.test.sql` seção 3 e `gestao.test.sql` "outra profissional não vê a agenda alheia". |
| AUZ-03 | C | atende | O estabelecimento vem sempre da sessão (`estabelecimento_atual()`, a partir de `auth.uid()` e de `public.users`), nunca do corpo: a coluna tem o padrão da sessão, a política restritiva recusa outro valor e a Edge Function recusa o campo (`soCampos`). Teste: `supabase/tests/seguranca/estabelecimentos.test.sql` "referencia_de_outro_estabelecimento" e `tests/seguranca/admin-global.test.ts`. |
| AUZ-04 | C | atende | Toda tabela com RLS e política por operação (tabelas novas da gestão nascem com RLS na mesma migração, `supabase/migrations/20261012120000_gestao_salao.sql`); nenhuma política `using (true)`; `supabase/tests/seguranca/gestao.test.sql` seção 7; pacotes (`supabase/migrations/20261013120000_pacotes.sql`): tabelas só com leitura da administradora e escrita só por funções, `supabase/tests/seguranca/pacotes.test.sql` seções 10 e 11; Kanban pessoal (`supabase/migrations/20261015120000_kanban_pessoal.sql`): `kanban_compartilhamentos` com RLS, leitura por quem gerencia ou recebeu, exclusão só por quem gerencia (política de delete), criação e mudança só pela função `kanban_compartilhar`; grupos de quadros (`supabase/migrations/20261016120000_kanban_visao_grupos.sql`): `kanban_grupos` e `kanban_quadro_grupo` com RLS e política por operação, só da própria pessoa, grupo e vínculo da mesma pessoa garantidos por chave estrangeira composta, `supabase/tests/seguranca/kanban_visao_grupos.test.sql`; `tests/seguranca/varreduras.test.ts` "AUZ-04". |
| AUZ-05 | C | atende | Nenhuma service role no front (`src/lib/env.ts` recusa); a única chave de serviço fica na Edge Function `supabase/functions/admin-usuarios/index.ts`, no servidor do Supabase; `tests/seguranca/varreduras.test.ts` "AUZ-05". |
| AUZ-06 | C | atende | Papel, status, comissão e valores vêm do banco: perfil profissional só a administradora altera; profissional não muda valor, comissão, gorjeta, forma de pagamento nem dono do atendimento (gatilho `appointments_protecao`); `supabase/tests/seguranca/gestao.test.sql` "profissional não altera a própria comissão", "valor do catálogo (preço enviado ignorado)". |
| AUZ-07 | C | atende | Menus de administradora escondidos para a profissional (`src/features/acesso/modulos.ts`) e barrados no banco: finanças, pagamentos, equipe, catálogo, fechamentos e auditoria; contato de clientes mascarado pela view `clientes_visiveis`; `supabase/tests/seguranca/gestao.test.sql` seções 1 a 5; Kanban: quadro pessoal invisível a terceiros (inclusive à administradora) sem compartilhamento, permissão 'ver' barra escrita de tarefa, checklist, comentário e colunas no banco (`kanban_permissao`, `kanban_pode_editar_coluna`), `supabase/tests/seguranca/kanban_pessoal.test.sql`; mudar onde o quadro aparece (negócio, pessoal ou ambos) só por quem gerencia, e deixar só no negócio só a administradora (`kanban_definir_visao`), `supabase/tests/seguranca/kanban_visao_grupos.test.sql`. |
| AUZ-08 | I | atende | Ações de administradora em funções próprias: Edge Function `admin-usuarios` (confere `usuario_admin()` antes de agir, CORS restrito) e funções `gerar_fechamento`/`cancelar_fechamento`/`habilitar_servicos`; todas auditadas em `access_logs`. |
| AUZ-09 | I | atende | `supabase/tests/seguranca/gestao.test.sql` (administradora, profissional, outra profissional e visitante em perfis, clientes, catálogo, agenda, fechamentos e tarefas) e `supabase/tests/seguranca/seguranca.test.sql`, no job "banco" de `.github/workflows/seguranca.yml`. |
| VAL-01 | C | parcial | Sem servidor próprio: a validação de servidor é feita no banco (tipos, `check`, funções `kanban_*` e `registrar_auditoria` validam tudo). Zod não foi adicionado (DEP-01: aguarda aprovação); validação da tela continua só como usabilidade. |
| VAL-02 | C | parcial | O PostgREST só aceita colunas existentes; colunas sensíveis (papel, status) protegidas por RLS. Campos extras não previstos são recusados pelo banco. |
| VAL-03 | C | atende | Acesso só pelo query builder do supabase-js e funções com parâmetros; `tests/seguranca/varreduras.test.ts` "VAL-03". |
| VAL-04 | C | atende | Sem `dangerouslySetInnerHTML`/`innerHTML`; `tests/seguranca/varreduras.test.ts` "VAL-04". |
| VAL-05 | I | não se aplica | O app não busca URL informada pelo usuário. |
| VAL-06 | I | não se aplica | Sem caminho de arquivo montado com entrada do usuário. |
| VAL-07 | C | atende | Preço, duração e comissão do agendamento calculados no banco a partir do catálogo (`agendar_atendimento`); fechamento calcula taxa, material, comissão e gorjeta no banco (`gerar_fechamento`) e congela os valores; `supabase/tests/seguranca/gestao.test.sql` "totais calculados no banco" e "preço enviado pela profissional ignorado"; pacotes: rateio, valor da sessão, comissão da venda e taxa congelados no banco (`vender_pacote`, gatilho `appointments_pacote`), `supabase/tests/seguranca/pacotes.test.sql` "rateio fecha no centavo" e "valor e comissão do pacote (valor enviado ignorado)". |
| VAL-08 | I | atende | Sem redirecionamento por parâmetro; destinos são rotas fixas do React Router. |
| VAL-09 | I | atende | Agenda: trava pessimista por profissional (`pg_advisory_xact_lock`) + restrição de exclusão `appointments_sem_conflito` (garantia final mesmo sem a função); fechamento com trava por profissional; `supabase/tests/seguranca/gestao.test.sql` "Conflito de horário" e "inserção direta sobreposta falha"; saldo de pacote com trava da linha do pacote e um único abatimento por atendimento (índice único), `supabase/tests/seguranca/pacotes.test.sql` "um único abatimento por atendimento" e "sem sessões disponíveis". |
| UPL-01 | C | não se aplica | O app não tem upload (nenhum bucket no Storage). |
| UPL-02 | C | não se aplica | Sem upload. |
| UPL-03 | C | não se aplica | Sem download de arquivo de usuário. |
| UPL-04 | I | não se aplica | Sem download de arquivo de usuário. |
| WEB-01 | C | não se aplica | O app não recebe webhook. |
| WEB-02 | I | não se aplica | O app não recebe webhook. |
| CRI-01 | C | parcial | Sem desligamento de certificado (`tests/seguranca/varreduras.test.ts`); HSTS e `upgrade-insecure-requests` em `vercel.json`. HTTPS da Vercel: pendencias-humanas.md item 1. |
| CRI-02 | I | atende | `vercel.json` HSTS `max-age=63072000; includeSubDomains; preload`; `tests/seguranca/cabecalhos.test.ts`. |
| CRI-03 | C | aguarda humano | Supabase e Vercel criptografam em repouso por padrão; confirmar: pendencias-humanas.md item 9. |
| CRI-04 | I | pendente | Telefone e e-mail de clientes em texto claro. Cifrar campo exige chave fora do banco e servidor próprio (Edge Function): pendencias-humanas.md item 13. |
| CRI-05 | C | atende | Sem algoritmo próprio, MD5, SHA-1 ou ECB; `tests/seguranca/varreduras.test.ts`. |
| CRI-06 | C | atende | `Math.random` trocado por `crypto.randomUUID` (`src/pages/Agenda.tsx:101`); `tests/seguranca/varreduras.test.ts` "sem Math.random". |
| CAB-01 | I | atende | `vercel.json` CSP `script-src 'self'` (sem unsafe-inline/eval); script de tema movido para `public/tema.js`; `tests/seguranca/cabecalhos.test.ts`; conferido no navegador sem violações. Exceção: `style-src 'unsafe-inline'` porque o React aplica `style` inline. |
| CAB-02 | I | atende | `vercel.json` nosniff, Referrer-Policy, `frame-ancestors 'none'` e X-Frame-Options DENY; `tests/seguranca/cabecalhos.test.ts`. |
| CAB-03 | C | atende | Nenhum `Access-Control-Allow-Origin` no app (`tests/seguranca/cabecalhos.test.ts`); a Edge Function só responde CORS para as origens do portal na Vercel e as de `ORIGENS_PERMITIDAS`. |
| RAT-01 | I | aguarda humano | Firewall da Vercel: pendencias-humanas.md item 10. |
| RAT-02 | C | parcial | Sem servidor próprio: o limite de login é o do Supabase Auth (contador no servidor dele). Ajuste: pendencias-humanas.md item 5. |
| RAT-03 | C | parcial | Idem RAT-02: limites de login e de verificação no Supabase Auth; leitura e escrita da API sem limite por conta. |
| RAT-04 | I | aguarda humano | CAPTCHA (Turnstile/hCaptcha) no Supabase Auth exige ativação no painel e mudança na tela de login: pendencias-humanas.md item 5. |
| RAT-05 | I | não se aplica | Sem servidor próprio; limites de corpo e timeouts são do Supabase/PostgREST. |
| RAT-06 | R | não se aplica | O 429 é respondido pelo Supabase Auth. |
| LOG-01 | C | atende | `src/lib/seguranca/erros.ts:30` (mensagem genérica + código); `src/main.tsx:11-19` (tratamento central); telas sem `error.message` cru; `tests/seguranca/config-logs-erros.test.ts` "LOG-01"; `tests/seguranca/varreduras.test.ts`. |
| LOG-02 | C | atende | `vite.config.ts:13` `sourcemap: false`; job "Sem source maps públicos" em `.github/workflows/seguranca.yml`; `tests/seguranca/varreduras.test.ts` "LOG-02". |
| LOG-03 | I | pendente | Sem ferramenta de monitoramento (Sentry). Exige dependência nova (DEP-01): pendencias-humanas.md item 11. |
| LOG-04 | C | atende | `src/lib/seguranca/logger.ts:12` (mascaramento); `console.*` só no logger (`tests/seguranca/varreduras.test.ts`); `tests/seguranca/config-logs-erros.test.ts` "LOG-04". |
| LOG-05 | I | parcial | `access_logs` + gatilhos (exclusões, alterações de clientes, finanças, perfis, comissões, serviços e taxas; mudanças de permissão), eventos de fechamento (gerado, contestado, cancelado, assinado), de pacote (vendido, renovado, anulado, movimento desfeito) e de acesso pela Edge Function; `supabase/tests/seguranca/gestao.test.sql` "assinatura registrada na auditoria". Falha de login fica nos logs do Supabase Auth. |
| LOG-06 | I | parcial | Somente inserção por gatilho e permissões (`supabase/migrations/20261011120000_seguranca_endurecimento.sql`:144-163); `supabase/tests/seguranca/seguranca.test.sql` seção 7. Prazo de retenção a definir: pendencias-humanas.md item 14. |
| LOG-07 | I | aguarda humano | pendencias-humanas.md item 10. |
| LOG-08 | I | não se aplica | Sem ferramenta de gravação de sessão. |
| LLM-01 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-02 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-03 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-04 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-05 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-06 | R | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-07 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-08 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-09 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-10 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-11 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| LLM-12 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-01 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-02 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-03 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-04 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-05 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-06 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-07 | I | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| IAD-08 | C | não se aplica | O app não chama modelo de linguagem (sem integração com IA). |
| DEP-01 | C | atende | Nenhuma dependência nova. O PDF é gerado pelo navegador ("Salvar como PDF") a partir de página própria, sem biblioteca e sem enviar dados para fora. |
| DEP-02 | C | atende | `package-lock.json` versionado; `vercel.json` `installCommand: npm ci`; workflow `npm ci --ignore-scripts`; build sem `npm install`; `tests/seguranca/cabecalhos.test.ts` "DEP-02". |
| DEP-03 | I | parcial | Job em `.github/workflows/seguranca.yml` bloqueia alta/crítica nas dependências de produção. Ferramentas de build (vite, vitest, tailwind) têm achados que só saem com salto de versão principal: relatório sem bloquear, plano em pendencias-humanas.md item 15. |
| DEP-04 | I | parcial | `.github/dependabot.yml`. Ativar "Dependabot security updates": pendencias-humanas.md item 7. |
| DEP-05 | R | pendente | Ações fixadas por versão principal, não por SHA. |
| DEP-06 | R | atende | Workflow com `npm ci --ignore-scripts` (testado em cópia limpa). A Vercel roda `npm ci` com scripts. |
| DEP-07 | R | pendente | `dexie` e `react-use` a conferir quanto a uso; sem verificação automática. |
| TST-01 | I | parcial | CodeQL `security-extended` em `.github/workflows/seguranca.yml` bloqueando severidade >= 7. Confirmar execução no GitHub. |
| TST-02 | C | pendente | Mudanças de autenticação e autorização aguardam revisão humana (ver relatório da entrega). |
| TST-03 | I | atende | Job "banco" roda `supabase/tests/seguranca/seguranca.test.sql` e job "testes" roda `tests/seguranca/`. |
| TST-04 | R | aguarda humano | DAST não executado. |
| TST-05 | I | aguarda humano | Decisão sobre teste de invasão: pendencias-humanas.md item 16. |
| TST-06 | R | atende | Esta matriz, atualizada nesta entrega. |
| DEV-01 | C | aguarda humano | O agente tem conector do Supabase com escrita em PRODUÇÃO (não há projeto de homologação). Usado só para leitura nesta entrega; escrita só com aprovação (DEV-02). pendencias-humanas.md item 8. |
| DEV-02 | C | atende | SQL completo mostrado na conversa e aplicado só depois de "autorizo" (2026-10-04); registro no cabeçalho da migração. |
| DEV-03 | I | atende | Trabalho na branch `claude/gracious-curie-vpzebg`, entrega por pull request. |
| DEV-04 | I | atende | Relatório de IDs no fim da entrega e esta matriz. |
| DEV-05 | I | aguarda humano | Conectores com escopo amplo (Supabase com escrita, Vercel, GitHub): pendencias-humanas.md item 8. |
| DEV-06 | I | atende | Conduta observada; nenhuma instrução de terceiros encontrada. |
| DEV-07 | C | atende | Só `.env.example` com valores fictícios; nenhum segredo pedido ou escrito. |
| PRV-01 | C | aguarda humano | O app usa os papéis do Supabase (anon/authenticated) sem DDL; migrações pelo painel/CLI. Confirmar: pendencias-humanas.md item 9. |
| PRV-02 | C | aguarda humano | Network Restrictions do banco: pendencias-humanas.md item 9. |
| PRV-03 | I | aguarda humano | Confirmar que o projeto Supabase é exclusivo deste app: pendencias-humanas.md item 9. |
| PRV-04 | C | não se aplica | Nenhum bucket no Storage. |
| PRV-05 | C | aguarda humano | pendencias-humanas.md item 6. |
| PRV-06 | I | aguarda humano | Hoje só há produção: pendencias-humanas.md item 8. |
| PRV-07 | I | aguarda humano | Vercel Deployment Protection: pendencias-humanas.md item 10. |
| PRV-08 | I | aguarda humano | pendencias-humanas.md item 7. |
| BKP-01 | C | aguarda humano | pendencias-humanas.md item 9 (backup diário e PITR). |
| BKP-02 | I | aguarda humano | pendencias-humanas.md item 9. |
| BKP-03 | I | aguarda humano | pendencias-humanas.md item 9. |
| LGP-01 | I | parcial | Rascunho em `docs/seguranca/lgpd-registro-tratamento.md`; aprovação do usuário pendente. |
| LGP-02 | I | parcial | Finalidades no rascunho de LGP-01, incluindo os dados novos (CPF, CNPJ/MEI, PIX e contrato do profissional; histórico técnico da cliente; IP e navegador da assinatura de fechamento). `clients.email`, `birth_date` e `birthday` a confirmar. |
| LGP-03 | I | aguarda humano | Prazos de retenção: pendencias-humanas.md item 14. |
| LGP-04 | I | pendente | Sem função de exportação/exclusão de dados do titular; canal a definir: pendencias-humanas.md item 14. |
| LGP-05 | I | aguarda humano | Operadores: Supabase, Vercel. pendencias-humanas.md item 14. |
| LGP-06 | C | aguarda humano | Política de privacidade: pendencias-humanas.md item 14. |
| LGP-07 | I | aguarda humano | pendencias-humanas.md item 14. |
| INC-01 | I | parcial | Rascunho em `docs/seguranca/resposta-a-incidentes.md`; aprovação pendente. |
| INC-02 | C | parcial | Prazo no roteiro; responsável a definir. |
| INC-03 | I | aguarda humano | Local do registro a definir (roteiro sugere). |
| INC-04 | R | aguarda humano | Teste anual a agendar. |
