# Administração global e vários estabelecimentos

Adaptação, para o Jake Beauty, da especificação "Administração Global de um SaaS com várias organizações" (origem: sistema jurídico em Next.js). Implantada em 2026-10-08.

## 1. Vocabulário adaptado

| Especificação | Neste projeto |
|---|---|
| Escritório (`escritorios`) | Estabelecimento (`estabelecimentos`): o salão cliente |
| Perfil (`profiles`) | `public.users` (papéis `admin` e `professional`) |
| Administrador do escritório | Administradora do estabelecimento (`role = 'admin'`) |
| Administrador global | Linha em `administradores_globais` (sem política de RLS) |
| Limites por cargo (advogados, estagiários, secretárias) | `max_profissionais` (administradoras não contam) |
| Limite de registros (processos) | `max_clientes` |
| Trava do plano Básico (sem delegar tarefa) | Kanban sem compartilhar quadro (`plano_sem_compartilhamento`) |
| Telas liberadas na demonstração vencida | Resumo, Meu Painel, Agenda, Clientes, Profissionais, Serviços, Configurações e Plano |

## 2. A adaptação que a especificação pressupõe

O sistema de origem já separava os dados por organização. Este não separava: era de um salão só. Por isso, antes do painel global, todo dado de negócio passou a ter dono (`estabelecimento_id`):

- **Política RLS restritiva** em todas as tabelas: soma-se (AND) às políticas existentes de cada operação, então nenhuma regra antiga precisou ser reescrita.
- **Gatilho de guarda** (`a0_estabelecimento_guarda`): grava só no próprio estabelecimento e só referencia registro do mesmo estabelecimento (todas as chaves estrangeiras), inclusive dentro de funções `security definer`, que ignoram o RLS.
- **Funções de sessão** (`usuario_ativo`, `usuario_admin`, `usuario_atual_id`, `estabelecimento_atual`) só respondem para perfil ativo de estabelecimento ativo (SG-05).
- **Funções que leem por conta própria** (pacotes, fechamentos, catálogo, Kanban, visão de clientes) filtram pelo estabelecimento da sessão.
- Taxas, configuração de comissão e categorias passam a ser uma por estabelecimento; o novo estabelecimento nasce com os padrões.
- O Studio Labeli virou o primeiro estabelecimento, **premium e sem limites**: nada mudou para quem já usava.

## 3. Decisões

| Ponto da especificação | Decisão neste projeto | Motivo |
|---|---|---|
| Rotas de API Next.js | Funções do banco (leitura e edição) + Edge Function `admin-usuarios` (criação) | SPA sem servidor próprio; a Edge Function é a única com chave de serviço |
| Zod `.strict()` | Validação manual com lista fechada de campos (`soCampos`) e testes | DEP-01: sem dependência nova |
| Conta do primeiro administrador "sem senha, pelo provedor OAuth" | Conta criada sem senha (`createUser` com e-mail confirmado); ela entra com "Continuar com Google" | Desde 2026-10-09 o login é só pelo Google (`login-google-mfa.md`); o painel global não define senha nem ganha acesso |
| Guarda no servidor (`requireAdminGlobal`) | Banco (`eh_admin_global()` com `aal2`) + Edge Function + tela | Mesma garantia: a API REST não serve de atalho |
| 403 `escritorio_inativo` na próxima requisição | RLS já não mostra nada; a tela confere a situação ao voltar para a aba e encerra a sessão com a mensagem | SPA fala direto com o banco |
| Confirmações com `confirm()`/`prompt()` | Janelas próprias; exclusão com "EXCLUIR" digitado | Melhoria 7 da especificação |
| Registro do primeiro admin global no SQL da migração | Feito por SQL direto, fora do repositório | O e-mail é dado pessoal |

## 4. Onde está

- Banco: `supabase/migrations/20261017120000_estabelecimentos_admin_global.sql`.
- Edge Function: `supabase/functions/admin-usuarios/index.ts` (ação `criar_estabelecimento`; a conta da administradora nasce sem senha e ela entra pelo Google, ver `login-google-mfa.md`).
- Regras de plano na tela: `src/features/plano/plano.ts`; painel: `src/pages/AdminGlobal.tsx`, `src/features/admin-global/`; página do plano: `src/pages/Plano.tsx`; MFA: `src/features/acesso/mfa.ts`, `src/components/SegurancaMfa.tsx`; faixa e cadeados no menu: `src/layouts/MainLayout.tsx`; bloqueio de estabelecimento inativo: `src/contexts/AuthContext.tsx`, `src/App.tsx`, `src/pages/Login.tsx`.
- Testes: `supabase/tests/seguranca/estabelecimentos.test.sql` (isolamento, limites, MFA no banco, demonstração vencida, desativação, auditoria), `tests/seguranca/admin-global.test.ts` (seção 8 da especificação), `src/features/plano/plano.test.ts`, `src/features/admin-global/logic.test.ts`.

## 5. Ficou para depois (melhorias da especificação, seção 10)

1. Gestão de administradores globais pelo painel (hoje por SQL), com mínimo de dois.
2. Admin global sem precisar ser membro de um estabelecimento.
3. Retenção do excluído: prazo em contrato, exportação completa (LGPD, art. 18) e expurgo auditado.
4. Cobrança integrada por webhook assinado.
5. Cadastro self-service de salão com demonstração.
6. Limite de requisições dedicado ao painel global.
7. Aviso por e-mail a 7 e a 1 dia do fim da demonstração e na desativação.
8. Na demonstração vencida, a agenda grava normalmente; se um atendimento usar sessão de pacote (módulo pago), a baixa do pacote é recusada junto.
