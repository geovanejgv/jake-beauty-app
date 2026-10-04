# Pendências que dependem de pessoa ou de painel externo

Itens `CFG` e `HUM` de `docs/seguranca/requisitos.md`. Cada um só vira `atende` em `matriz.md` depois da confirmação escrita do responsável. Os caminhos de menu dos painéis mudam com frequência: onde houver [Confirmar], confira o nome exato na tela.

Responsável padrão: administradora do estúdio (dona das contas Supabase, Vercel e GitHub).

## Antes de publicar esta entrega

1. **Variáveis de ambiente na Vercel (SEG-01, SEG-04, SEG-07, CRI-01).** Sem elas o build falha de propósito.
   - **FEITO em 2026-10-04** pelo agente, com autorização do usuário, no projeto Vercel `studio-labeli-app` (Production e Preview): `VITE_SUPABASE_PUBLISHABLE_KEY` criada e `VITE_SUPABASE_URL` regravada com a URL do projeto. Falta: excluir no painel a variável antiga `VITE_SUPABASE_ANON_KEY` (não é mais usada; o conector não tem ação de exclusão) e decidir valores próprios para Preview quando houver homologação (SEG-04).
   - Vercel, projeto do portal, Settings, Environment Variables.
   - Criar `VITE_SUPABASE_URL` (URL do projeto, Supabase, Project Settings, API) e `VITE_SUPABASE_PUBLISHABLE_KEY` (a chave **publishable**, nunca a secret/service role), marcando Production e Preview.
   - Conferir em Settings, Domains que o domínio usa HTTPS (padrão da Vercel).
   - Não colar valor na conversa com o agente (DEV-07).
2. **Trocar a senha fraca.** A conta da administradora está com uma senha curta e fraca, definida a pedido em conversa anterior com o agente. Trocar por uma senha longa (12 caracteres ou mais) antes de qualquer outro ajuste de senha, pelo botão **Alterar senha** do menu do portal. Depois, Supabase, Authentication, Sign In / Providers, Email: mínimo de 12 caracteres (AUT-03) [Confirmar].
3. **Supabase Auth: sessão e cadastro (AUT-03, AUT-05, SES-03, SES-07).**
   - Desligar cadastro público ("Allow new users to sign up" desligado): contas só criadas pela administradora.
   - Ativar "Prevent use of leaked passwords" (pode exigir plano Pro) [Confirmar].
   - Validade do access token (JWT expiry) de no máximo 3600 segundos; rotação de refresh token ligada com detecção de reuso.
   - Expiração do link de e-mail (redefinição de senha) de no máximo 1 hora.
   - Ligar o aviso por e-mail de senha alterada (notificações de segurança do Auth) [Confirmar] (AUT-07).
   - Opcional: "Inactivity timeout" da sessão (plano Pro) [Confirmar].
4. **MFA (AUT-04).** Ativar TOTP em Authentication, Multi-Factor. Depois disso, o agente implementa a tela de cadastro do aplicativo autenticador e a exigência de `aal2` no banco para ações de administradora. Decidir se entra na próxima entrega.
5. **Limites e CAPTCHA no login (RAT-02, RAT-03, RAT-04).** Authentication, Rate Limits: conferir o limite de tentativas de login por IP. Para CAPTCHA, ativar Turnstile ou hCaptcha em Authentication, Attack Protection [Confirmar]; o agente ajusta a tela de login depois.

## Contas e repositório

6. **MFA nas contas (PRV-05).** Ativar autenticação em dois fatores em: Supabase, Vercel, GitHub, e-mail administrativo (Google) e registrador do domínio. Confirmar conta a conta.
7. **GitHub (SEG-05, DEP-04, PRV-08, TST-01).** No repositório `geovanejgv/jake-beauty-app`:
   - Settings, Branches: regra para `main` exigindo pull request e bloqueando force push.
   - Settings, Code security: ligar Secret scanning e Push protection; ligar Dependabot alerts e Dependabot security updates.
   - Settings, Actions: permitir a execução do workflow `Segurança e testes`.
8. **Ambientes e conectores do agente (DEV-01, DEV-05, PRV-06).** Hoje existe só o projeto de produção, e o conector Supabase do agente tem escrita nele. Recomendado:
   - criar um projeto Supabase de homologação (dados fictícios) para testes;
   - restringir o conector do agente a somente leitura ou ao projeto de homologação.

## Banco e hospedagem

9. **Supabase: banco (BKP-01, BKP-02, BKP-03, CRI-03, PRV-01, PRV-02, PRV-03).**
   - Database, Backups: conferir backup diário; avaliar PITR (add-on pago).
   - Testar uma restauração por trimestre (em projeto separado) e registrar data e resultado.
   - Manter uma cópia fora do projeto (ex.: `pg_dump` mensal guardado em local separado).
   - Database, Network Restrictions: restringir conexões diretas ao banco.
   - Confirmar que o projeto é exclusivo deste app e que a criptografia em repouso está ativa (padrão do Supabase).
10. **Vercel (PRV-07, RAT-01, LOG-07).**
    - Settings, Deployment Protection: proteger os deploys de pré-visualização.
    - Firewall: conferir as regras padrão e o "Attack Challenge Mode" para emergências.
    - Alertas para picos de erro (Observability ou integração de logs).
11. **Monitoramento de erros (LOG-03).** Decidir se adota Sentry (dependência nova `@sentry/react`, exige aprovação, DEP-01). Hoje os erros ficam só no console do navegador, já mascarados.

## Decisões de produto e regras de negócio

12. **Valores calculados no banco (VAL-07, VAL-09).** Checkout do PDV, comissões e conflito de horário da agenda são calculados na tela. Proposta: funções no banco com trava, como no Kanban. Decidir prioridade.
13. **Cifrar dados de contato (CRI-04).** Telefone e e-mail de clientes estão em texto claro (protegidos pelo RLS). Cifrar exige chave fora do banco e uma Edge Function. Decidir se é necessário para o risco do estúdio.
14. **LGPD (LGP-01 a LGP-07, LOG-06).** Revisar `lgpd-registro-tratamento.md` e definir: prazos de retenção (inclusive da trilha `access_logs`, sugestão 5 anos), canal do titular, contratos com operadores (Supabase, Vercel), política de privacidade e encarregado.
15. **Atualização das ferramentas de build (DEP-03).** `npm audit` aponta falhas altas em vite 5, vitest 2, tailwindcss 3 (dependências de desenvolvimento, não chegam ao navegador) e moderada no react-router 6. A correção exige salto de versão principal. Plano sugerido, um por vez e com teste: vitest, depois vite e vite-plugin-pwa, depois react-router, por último tailwindcss.
16. **Teste de invasão (TST-05).** Decidir se contrata teste por terceiro (o app trata dados de clientes e finanças).
17. **Incidentes (INC-01 a INC-04).** Aprovar `resposta-a-incidentes.md`, definir responsáveis e agendar o teste anual.

## Aplicação da migração de segurança

18. **Migração `20261011120000_seguranca_endurecimento.sql` (DEV-02).** **APLICADA em 2026-10-04** com "autorizo" do usuário; conferências OK. Efeitos visíveis:
    - conta sem perfil ativo em `public.users` passa a ver "Acesso ainda não liberado" (o Kanban não cria mais perfil sozinho);
    - **Finanças pessoais (`personal_finances`) só para a administradora**;
    - equipe (`public.users`) só alterada pela administradora;
    - exclusões, alterações de clientes e finanças, logins e logouts passam a ser auditados.

## Gestão do salão (papéis, catálogo, agenda, comissões)

19. **Migração `20261012120000_gestao_salao.sql` (DEV-02).** **APLICADA em 2026-10-04** com "autorizo" do usuário; conferências OK (RLS ligado nas 10 tabelas novas, nenhuma política `using (true)`, nenhuma função executável por `anon`, 7 categorias criadas, 123 dos 181 agendamentos com valor do serviço copiado). Avisos esperados do Supabase Advisor: view `clientes_visiveis` com security definer (intencional, é ela que mascara o contato) e funções security definer executáveis por usuário logado (intencional, cada uma confere o papel). Efeitos visíveis:
    - profissional só vê a própria agenda, os próprios fechamentos e as tarefas em que é responsável, envolvida ou criadora;
    - profissional vê clientes pela view `clientes_visiveis`: nome e histórico técnico, com telefone e e-mail mascarados;
    - finanças do negócio (despesas, receitas avulsas, transações) passam a ser só da administradora;
    - agenda passa a recusar dois atendimentos sobrepostos do mesmo profissional (os 181 agendamentos atuais não têm profissional e não são afetados);
    - formas de pagamento aceitas: pix, dinheiro, débito, crédito, cartão (antigos) e outro.
20. **Deploy da Edge Function `admin-usuarios` (DEV-02).** **PUBLICADA em 2026-10-04** (versão 1, verificação de JWT ligada) com "autorizo" do usuário. Necessária para "Criar acesso", "Redefinir senha" e "Desativar/Reativar" com bloqueio de login. Usa a chave de serviço que o próprio Supabase injeta na função (ninguém precisa copiá-la). Opcional: segredo `ORIGENS_PERMITIDAS` com um domínio próprio, se houver. Sem o deploy, o cadastro de profissionais funciona, mas sem login.
21. **Agendamentos antigos sem profissional.** Decidir se os 181 atendimentos existentes devem ser atribuídos a alguém (ex.: à administradora). Hoje aparecem como "Sem profissional" e não entram em fechamento de comissão.
22. **Contrato de parceria (Lei 13.352/2016) [Confirmar].** O sistema guarda CPF, CNPJ/MEI, modelo e início do contrato e avisa quando falta CNPJ/MEI; a redação, a homologação e a guarda do contrato assinado são fora do sistema.
23. **Com profissionais entrando no sistema, os itens 2 a 5 ficam mais urgentes**: mínimo de 12 caracteres e senhas vazadas no Supabase Auth, cadastro público desligado e MFA para a administradora.
