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
2. **Senha antiga da administradora.** Com o login só pelo Google (item 35) o portal não usa mais senha; a senha antiga deixa de valer quando o provedor de e-mail e senha for desligado no Supabase (item 35, passo final).
3. **Supabase Auth: sessão e cadastro (AUT-03, AUT-05, SES-03, SES-07).**
   - Desligar cadastro público ("Allow new users to sign up" desligado): contas só criadas pela administradora.
   - Ativar "Prevent use of leaked passwords" (pode exigir plano Pro) [Confirmar].
   - Validade do access token (JWT expiry) de no máximo 3600 segundos; rotação de refresh token ligada com detecção de reuso.
   - Expiração do link de e-mail (redefinição de senha) de no máximo 1 hora.
   - Ligar o aviso por e-mail de senha alterada (notificações de segurança do Auth) [Confirmar] (AUT-07).
   - Opcional: "Inactivity timeout" da sessão (plano Pro) [Confirmar].
4. **MFA (AUT-04).** TOTP ativo no Supabase (já há autenticador confirmado em produção). Implementado em 2026-10-09: código logo depois do login, `aal2` no banco para ações de administradora (`docs/especificacoes/login-google-mfa.md`). Cada administradora precisa ativar o autenticador em Configurações > Segurança.
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
21. **Agendamentos antigos sem profissional.** **FEITO em 2026-10-04** com "autorizo" do usuário: 175 dos 181 atribuídos à administradora. Atendimentos sobrepostos foram movidos para 1 minuto depois do fim do anterior, mantendo a duração (27/08, 28/08, 01/09 (2), 05/09, 01/10 e 09/10; o de 09/10 foi para 09:46, avisar a cliente). O bloqueio de 30/09 das 12:00 passou a começar às 16:01. Seis bloqueios já cobertos por outro bloqueio ou atendimento ficaram sem profissional (nada foi apagado).
22. **Contrato de parceria (Lei 13.352/2016) [Confirmar].** O sistema guarda CPF, CNPJ/MEI, modelo e início do contrato e avisa quando falta CNPJ/MEI; a redação, a homologação e a guarda do contrato assinado são fora do sistema.
23. **Com profissionais entrando no sistema, os itens 2 a 5 ficam mais urgentes**: mínimo de 12 caracteres e senhas vazadas no Supabase Auth, cadastro público desligado e MFA para a administradora.

## Pacotes de sessões

24. **Migração `20261013120000_pacotes.sql` (DEV-02).** **APLICADA em 2026-10-08** com "autorizo" do usuário, em 7 partes (o conector não concluía a chamada única); conferências OK: RLS nas 4 tabelas, escrita direta negada, nenhuma função executável por `anon`, versão anterior `agendar_atendimento_v1` sem execução. O site atual continua funcionando; o front desta entrega entra com o PR. Efeitos visíveis:
    - nova tela **Pacotes** (só administradora); a venda entra no faturamento na data da venda (nota fiscal na venda);
    - na agenda, a cliente com pacote mostra o saldo e o agendamento reserva a sessão; no checkout, o padrão é "Abater do pacote";
    - falta (no-show) em sessão de pacote desconta a sessão, sem comissão; cancelar libera a reserva;
    - a comissão de cada sessão é o percentual definido na venda, paga a quem executou, no fechamento.
25. **Termo do pacote e reembolso [Confirmar].** Decisão registrada: validade de 12 meses renovável, sem multa e sem reembolso pelo sistema. Recomenda-se termo escrito entregue à cliente com essas regras (CDC, art. 6º, III) e conferência do advogado sobre a recusa de reembolso em caso de desistência, que pode ser questionada como desvantagem exagerada (CDC, art. 51). Se houver devolução fora do sistema, lançar como despesa em Finanças.
26. **Pacotes vendidos fora do sistema.** Se houver pacotes antigos em caderno ou planilha, lançá-los pela tela de venda (valor e validade originais) e registrar as sessões já usadas como atendimentos concluídos com o pacote.

## Vários estabelecimentos e administração global

27. **Migração `20261017120000_estabelecimentos_admin_global.sql` (DEV-02).** **APLICADA em 2026-10-08** com autorização do usuário, em 13 partes (conector), com o mesmo SQL do arquivo. Conferências: 2 usuários, 40 clientes, 183 agendamentos, 22 quadros e 13 serviços intactos, todos no Studio Labeli (premium, sem limites); 33 tabelas com coluna, política restritiva e (32) gatilho de guarda; nenhuma função interna executável por usuário logado ou visitante; sessão da administradora simulada vê tudo como antes. Avisos do Supabase Advisor esperados: `administradores_globais` sem política (intencional, SG-01) e funções do painel executáveis por usuário logado (cada uma confere admin global com MFA).
28. **Administradora global cadastrada.** **FEITO em 2026-10-08** por SQL direto (fora do repositório, por ser dado pessoal): a conta de login da administradora do Studio Labeli. Para entrar no painel: Configurações > Verificação em duas etapas > Ativar (aplicativo autenticador) e depois menu "Administração global".
29. **MFA no Supabase.** Conferir em Authentication > Multi-Factor (Sign In / Providers) que o **TOTP está habilitado** (é o padrão). Sem ele, "Ativar verificação em duas etapas" mostra o aviso e o painel global não abre.
30. **E-mail (SMTP).** Desde o login pelo Google não há mais convite por e-mail: a conta da administradora nasce sem senha e ela entra com "Continuar com Google". O SMTP próprio continua recomendado para os avisos de segurança (item 36).
31. **Edge Function `admin-usuarios` versão 2.** **PUBLICADA em 2026-10-08** (verificação de JWT ligada): ação nova `criar_estabelecimento` e conferência de estabelecimento nas ações de equipe.
32. **Contato do suporte na página Plano.** Hoje o texto diz "Fale com o suporte do Jake Beauty". Definir o canal (e-mail ou WhatsApp) para exibir na página.
33. **Contrato com os salões clientes [Confirmar].** Termos de uso, política de privacidade e contrato de operador de dados (o Jake Beauty passa a tratar dados de clientes de outros salões: LGPD, art. 39), prazo de guarda após exclusão e exportação dos dados (art. 18).
34. **Edge Function `admin-usuarios` versão 3.** **PUBLICADA em 2026-10-09** (verificação de JWT ligada): ação nova `reenviar_convite`, só para administração global com MFA; reenvia o convite apenas a administradora que ainda não confirmou o e-mail nem entrou.
35. **Login exclusivamente pelo Google (AUT-01, L-01 a L-04).** Fazer **antes do merge** do PR do login Google; sem isso ninguém entra.
   - Google Cloud Console, APIs e serviços, Tela de consentimento OAuth: nome do app (Jake Beauty), página inicial, política de privacidade e domínio autorizado.
   - Credenciais, Criar ID do cliente OAuth, Aplicativo da Web. URI de redirecionamento autorizado: **somente** `https://<id-do-projeto>.supabase.co/auth/v1/callback` (o endereço do portal não entra aqui).
   - Supabase, Authentication, Sign In / Providers, Google: ativar e colar o ID do cliente e a chave secreta (direto no painel, nunca na conversa, DEV-07).
   - Supabase, Authentication, URL Configuration: Site URL = endereço principal do portal; Redirect URLs = `https://<endereço do portal>/auth/callback` (e o do Preview da Vercel, se for testar lá). O endereço precisa ser exatamente o que as pessoas usam.
   - Supabase, Authentication, Sign In / Providers: desligar "Allow new users to sign up" (conta Google desconhecida nem chega a ser criada).
   - Conferir que o e-mail de cada pessoa da equipe com acesso é uma conta Google (Gmail ou Google Workspace). Hoje: 3 contas ativas, todas Gmail.
   - Depois de testar numa janela anônima que todos entram pelo Google: desligar o provedor **Email** (e-mail e senha) em Sign In / Providers, para a senha antiga não servir de atalho pela API.
36. **Avisos de segurança por e-mail (M-07, AUT-07).** Supabase, Authentication, Emails, notificações de segurança [Confirmar o nome]: ligar os avisos de fator de MFA cadastrado e removido. Exige SMTP próprio (Resend, Brevo, Amazon SES) com domínio do remetente verificado.
37. **Limites e sessão no Supabase Auth (L-06, SES-03, SES-07).** Authentication, Rate Limits: conferir os limites de login e de verificação de MFA (a especificação pede 5 por 15 minutos). Sessões: access token de até 1 hora, rotação de refresh token com detecção de reuso; opcional "Inactivity timeout" de 30 minutos (plano Pro) [Confirmar] como segunda camada da inatividade da administradora.
38. **Migração `20261018120000_login_google_mfa.sql` e Edge Function `admin-usuarios` versão 4.** **APLICADAS em 2026-10-09**, logo depois do merge, com autorização do usuário (verificação de JWT ligada na função). A versão 4 cria contas sem senha, tira `reenviar_convite` e `redefinir_senha`, cria `redefinir_mfa` e exige `aal2` nas ações da equipe.

39. **App do Google em modo de teste (decisão de 2026-10-09).** O login pelo Google funciona só para os e-mails em Google Cloud, Google Auth Platform, Público-alvo, **Usuários de teste** (limite de 100). Toda pessoa nova cadastrada no portal também precisa entrar nessa lista. Para publicar o app (e acabar com a lista): domínio próprio (o Google não aceita `vercel.app` em Domínios autorizados), apontado para a Vercel e verificado no Google Search Console; páginas `/privacidade` e `/termos` (o agente cria, com razão social e CNPJ, e-mail de contato para privacidade e cidade do foro); no Supabase, Site URL e Redirect URLs com o domínio novo; e o domínio em `ORIGENS_PERMITIDAS` da Edge Function `admin-usuarios` (CORS).
40. **Migração `20261019120000_mfa_fora_do_login.sql`.** Tira o código do autenticador do login (decisão do usuário em 2026-10-09); as ações administrativas continuam exigindo o código (AUT-04). Aguarda aprovação explícita (DEV-02). Aplicar **antes** do merge do PR: a tela nova não pede o código, e com o banco antigo quem tem autenticador cairia em "sem acesso". A tela antiga funciona com a migração nova (só continua pedindo o código).
