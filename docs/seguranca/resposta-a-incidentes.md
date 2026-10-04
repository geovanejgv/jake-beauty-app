# Roteiro de resposta a incidentes (INC-01 a INC-04)

**Rascunho para aprovação do usuário.** Conferir a norma vigente da ANPD antes de aplicar a um caso concreto.

Responsável principal: (definir). Substituto: (definir). Contatos: (definir).

## 1. Contenção (primeiras horas)

- Revogar e substituir segredos possivelmente expostos (ver `rotacao-segredos.md`).
- Encerrar sessões: rotacionar a chave de assinatura JWT do Supabase Auth, se houver suspeita de sessão roubada (encerra todas as sessões).
- Desativar perfis suspeitos: `update public.users set active = false where id = ...` (o RLS corta o acesso na hora).
- Isolar: proteger os deploys na Vercel ou pausar o projeto Supabase, se necessário.

## 2. Preservação de evidências

- A trilha `public.access_logs` é somente inserção (ninguém altera nem apaga). Exportar o período do incidente.
- Exportar os logs do Supabase (API, Auth, Postgres) e da Vercel do período antes que expirem.
- Não apagar dados nem reescrever histórico do Git antes de registrar o que aconteceu.

## 3. Avaliação

- Quais dados foram afetados (clientes, agenda, finanças), de quantos titulares, por quanto tempo.
- Se há risco ou dano relevante aos titulares.

## 4. Comunicação

- Quando houver risco ou dano relevante: comunicar à ANPD e aos titulares em até **3 dias úteis** contados do conhecimento de que o incidente afetou dados pessoais (LGPD, art. 48; Resolução CD/ANPD nº 15/2024) [Confirmar a norma vigente]. Agente de pequeno porte tem prazo em dobro [Confirmar]; complementação em até 20 dias úteis [Confirmar].
- Responsável pela comunicação: (definir).

## 5. Correção

- Corrigir a causa e criar teste automático que impeça a repetição (em `tests/seguranca/` ou `supabase/tests/seguranca/`).
- Atualizar `matriz.md` e `pendencias-humanas.md`.

## 6. Registro

- Todo incidente, comunicado ou não, é registrado e mantido por no mínimo **5 anos** (INC-03). Local sugerido: pasta restrita da administradora, com data, descrição, dados afetados, medidas e comunicações.
- Testar este roteiro ao menos uma vez por ano (INC-04). Último teste: (nunca).
