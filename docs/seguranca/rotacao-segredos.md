# Rotação de segredos (SEG-08)

O front (SPA) não guarda nenhum segredo: só a URL e a chave **publishable** do Supabase, que são públicas por natureza (o acesso real é controlado pelo RLS). Os segredos do ambiente ficam nos painéis.

| Segredo | Onde fica | Periodicidade sugerida | Como rotacionar | Cuidado |
| --- | --- | --- | --- | --- |
| Chave publishable do Supabase | Vercel (`VITE_SUPABASE_PUBLISHABLE_KEY`) | Quando houver suspeita ou anualmente | Supabase, Project Settings, API Keys: criar nova publishable, atualizar na Vercel, redeploy, desativar a antiga | Pública; a rotação serve para cortar uso indevido em massa |
| Secret key / service role do Supabase | Somente no painel do Supabase (não usada pelo app) | Anual ou na saída de pessoa com acesso | Criar nova secret key, revogar a antiga | Nunca colocar em variável `VITE_` |
| Senha do banco (postgres) | Painel do Supabase | Anual ou na saída de pessoa com acesso | Database, Settings, Reset database password | Ferramentas externas que usem a senha param de conectar |
| JWT secret / signing keys do Supabase Auth | Painel do Supabase | Só em incidente | Project Settings, JWT Keys: rotacionar a chave de assinatura | Encerra todas as sessões; todos precisam entrar de novo |
| Senhas das contas (Supabase, Vercel, GitHub, e-mail) | Gerenciador de senhas da administradora | Na saída de pessoa com acesso ou em incidente | Pelo painel de cada serviço | Manter MFA ligado (PRV-05) |
| Token do GitHub usado por integrações | GitHub, Settings, Developer settings | Conforme validade do token | Gerar novo com menor escopo, revogar o antigo | Preferir tokens com expiração |

## Procedimento geral

1. Gerar o novo valor no painel do provedor.
2. Atualizar onde ele é usado (Vercel, Environment Variables) e fazer novo deploy.
3. Conferir que o portal funciona.
4. Revogar o valor antigo no provedor.
5. Registrar abaixo a data, o segredo (pelo nome, nunca o valor) e quem fez.

## Registro

| Data | Segredo (nome) | Motivo | Responsável |
| --- | --- | --- | --- |
| | | | |
