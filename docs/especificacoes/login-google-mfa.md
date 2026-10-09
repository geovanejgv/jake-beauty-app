# Login exclusivamente pelo Google e verificação em duas etapas (MFA)

Adaptação, para o Jake Beauty, da especificação "Login com conta Google e verificação em duas etapas (MFA)" (versão de 09/10/2026; origem: sistema em Next.js 14 com servidor próprio). Nenhuma regra obrigatória foi afrouxada; onde a SPA não tem servidor, a regra foi para o **banco** (RLS e funções) ou para o **Supabase Auth**.

## 1. Como funciona

- **Único jeito de entrar:** "Continuar com Google" (`src/pages/Login.tsx`). Não há formulário de e-mail e senha, troca de senha nem convite por e-mail.
- **Só entra quem foi cadastrado:** a administradora cria o acesso com o e-mail da conta Google da pessoa (Profissionais, "Criar acesso"); a conta nasce **sem senha**. Conta Google desconhecida é recusada pelo Supabase (cadastro aberto desligado) ou, se chegar a entrar, tem a sessão encerrada na hora (`src/pages/AuthCallback.tsx`).
- **Quem tem autenticador ativo** digita o código logo depois do Google (`src/pages/Verificacao.tsx`). Até lá, o **banco não mostra nenhum dado**: as funções de sessão respondem "sem acesso" enquanto `mfa_pendente()`.
- **Administradora:** criar acesso, mudar papel ou status da equipe, redefinir 2 etapas e ver os logs só com a sessão em `aal2`, conferido no banco e na Edge Function. Parada por 30 minutos, sai do portal.
- **Ação crítica pede o código na hora:** excluir estabelecimento (painel global) exige o código confirmado há menos de 5 minutos (claim `amr` do token).
- **Quem perde o celular:** a administradora usa "Redefinir 2 etapas" na tela Profissionais. Se for a única administradora, o suporte remove o fator pelo painel do Supabase (Authentication, Users, usuário, MFA), confirmando a identidade antes.

## 2. Decisões de adaptação

| Especificação (servidor próprio) | Neste projeto (SPA + Supabase) | Motivo |
|---|---|---|
| `POST /auth/login` no servidor grava o verificador PKCE em cookie `HttpOnly` (L-01, L-02) | `signInWithOAuth` com `flowType: 'pkce'` no navegador; o verificador e a sessão ficam no armazenamento do supabase-js | Sem servidor para cookie. Exceção já registrada em SES-02, com CAB-01 tratado como crítico (CSP sem script inline). O retorno traz só código de uso único, nunca o token |
| `GET /auth/callback` lê o perfil com a chave de serviço (L-04) | `/auth/callback` na SPA: o supabase-js troca o código; o perfil vem pelo RLS; sem perfil, `signOut` na hora | A chave de serviço nunca vai ao navegador (AUZ-05). O RLS já é a fronteira |
| Guardas no servidor (`requireUser`, `requireAdmin`, M-01, M-05, M-06) | Banco: `sessao_aal2()`, `mfa_pendente()` nas funções de sessão, gatilho `users_b_exige_mfa`, logs com `aal2`; Edge Function confere `sessao_aal2` | Mesma garantia: a API REST não serve de atalho |
| `/verificacao?redirectTo=` | A verificação aparece no lugar da tela pedida (a URL não muda) | Depois do código, a própria tela pedida abre, sem recarregar |
| Destino em `redirectTo` da URL de retorno (L-05) | Destino guardado na aba (`sessionStorage`), sempre filtrado por `caminhoInternoSeguro` | A URL de retorno cadastrada no Supabase fica fixa (`/auth/callback`) |
| Cookie de atividade gravado pelo middleware (L-09, L-10) | Horário do último gesto (clique, toque, tecla) no aparelho; confere a cada 30 s e ao voltar para a aba | Sem middleware. Atualização automática não conta como atividade. Segunda camada: "Inactivity timeout" do Supabase (pendência) |
| Limite de tentativas com Upstash (L-06) | Limites do próprio Supabase Auth (login, verificação de MFA) | Sem servidor próprio; sem dependência nova (DEP-01). Pendência de conferir os valores |
| Origem conferida no middleware (L-07) | Não se aplica: autenticação por cabeçalho `Authorization`, sem cookie (SES-05); a Edge Function confere a origem (CAB-03) | Sem cookie não há requisição forjada |
| Avisos por e-mail com Resend (M-07) | Notificações de segurança do Supabase Auth (fator de MFA cadastrado ou removido) com SMTP próprio [Confirmar] | Sem segredo novo no projeto (DEV-07); pendência humana |
| Redefinir MFA de outra pessoa (M-08) | Edge Function `admin-usuarios`, ação `redefinir_mfa` | Única com a chave de serviço |
| Rotas `/api/auth/mfa/*` (M-02, M-03) | supabase-js direto no Supabase Auth, que exige `aal2` para remover fator confirmado; a tela também confere e impede a administradora de ficar sem autenticador | O provedor é a autoridade (AUT-01) |
| Auditoria (A-01) | `registrar_auditoria` aceita `mfa_ativado`, `mfa_verificado`, `mfa_falhou`, `mfa_removido`; `login_falhou` fica nos logs do Supabase Auth | Sem sessão não há como gravar pela API (anon não executa funções) |
| Criação automática da primeira organização | Não se aplica | O Studio Labeli já existe |

## 3. Onde está

- Banco: `supabase/migrations/20261018120000_login_google_mfa.sql`.
- Edge Function: `supabase/functions/admin-usuarios/index.ts` (contas sem senha, `redefinir_mfa`, `aal2` nas ações da equipe).
- Telas: `src/pages/Login.tsx`, `src/pages/AuthCallback.tsx`, `src/pages/Verificacao.tsx`, `src/components/SegurancaMfa.tsx` (Configurações > Segurança), `src/pages/Profissionais.tsx`, `src/pages/AdminGlobal.tsx`, `src/layouts/MainLayout.tsx` (faixa de MFA e inatividade), `src/App.tsx`.
- Regras: `src/lib/seguranca/redirecionamento.ts`, `src/features/acesso/inatividade.ts`, `src/features/acesso/mfa.ts`, `src/hooks/useInatividadeAdmin.ts`, `src/contexts/AuthContext.tsx`.
- Testes: `tests/seguranca/login-google.test.ts`, `supabase/tests/seguranca/login_mfa.test.sql`, `src/lib/seguranca/redirecionamento.test.ts`, `src/features/acesso/inatividade.test.ts`, `src/features/acesso/mfa.test.ts`.

## 4. Ordem de implantação (importante)

Com o login só pelo Google, publicar o portal antes de configurar o Google **tranca todo mundo para fora**. A ordem é:

1. Google Cloud e Supabase configurados (`docs/seguranca/pendencias-humanas.md`, item 35).
2. Merge do PR (a Vercel publica). A tela nova funciona com o banco antigo.
3. Logo em seguida, migração `20261018120000_login_google_mfa.sql` e Edge Function versão 4 (com aprovação, DEV-02). Ao contrário, não: com a migração antes da tela nova, quem tem autenticador fica sem acesso (a tela antiga não pede o código no login), e a Edge Function nova recusa o "criar acesso" com senha da tela antiga.
4. Teste numa janela anônima: entrar com o Google, conta não cadastrada recebe "sem acesso", autenticador pede o código logo depois do Google, ação administrativa sem código é recusada.
5. Só então desligar o provedor de e-mail e senha no Supabase (fecha o atalho pela API).

## 5. Ficou para depois

1. Aviso de login em aparelho novo.
2. Inatividade também para profissionais, com prazo maior, se a política do salão pedir.
3. Encerrar todas as sessões da pessoa ao redefinir as 2 etapas (o Supabase só faz isso pelo próprio usuário [Confirmar]); hoje a pessoa perde o `aal2` no próximo login.
