# Jake Beauty (Studio Labeli)

Portal do estúdio: SPA Vite + React 18 + TypeScript + Tailwind, dados no Supabase (Postgres com RLS, Auth), deploy na Vercel.

## Estrutura

- `src/features/<módulo>/`: lógica (com testes) e acesso a dados de cada módulo: `acesso` (papéis, menu e preferências), `equipe`, `catalogo`, `agenda`, `comissoes`, `kanban`.
- `src/pages/`: telas.
- `docs/especificacoes/`: especificações de funcionalidades ainda não implantadas. Papéis: `admin` (administradora) e `professional` (profissional parceiro); a fronteira de acesso é o RLS do banco.
- `supabase/migrations/`: migrações (aplicar em produção só com aprovação). `supabase/functions/admin-usuarios/`: Edge Function de acessos (única com chave de serviço).

## Segurança

Requisitos: `docs/seguranca/requisitos.md` (fonte única, com IDs).
Situação de cada ID: `docs/seguranca/matriz.md`.
Ajustes que dependem de pessoa ou painel externo: `docs/seguranca/pendencias-humanas.md`.
Regras de conduta do agente: `.claude/rules/seguranca.md`.

## Comandos
- `npm ci` instala (nunca `npm install` no pipeline, DEP-02)
- `npm run typecheck`, `npm run test`, `npm run build` (o build exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`; ver `.env.example`)
- Testes do banco num Postgres local descartável: `bash supabase/tests/seguranca/run.sh` e `bash supabase/tests/kanban/run.sh` (com `PGHOST`, `PGPORT`, `PGUSER`)
