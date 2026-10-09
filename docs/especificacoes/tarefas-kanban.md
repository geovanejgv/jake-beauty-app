# Especificação da aba Tarefas (Kanban)

Especificação completa e portável do módulo **Tarefas** do Jake Beauty, escrita a partir do código em produção (outubro de 2026) para ser reimplementada em outro projeto. Descreve regras de negócio, modelo de dados, segurança no banco, telas, comportamento no celular e critérios de aceitação.

Pilha de referência: SPA React 18 + TypeScript + Tailwind, TanStack Query, ícones lucide-react, Supabase (Postgres com RLS e Auth). Não há servidor próprio: **toda regra de acesso fica no banco** (RLS, funções `security definer` e gatilhos); a tela só esconde o que o banco já barra.

## 0. Como usar este documento no outro projeto

1. Leia a seção 12 (adaptação) e decida os nomes do seu domínio (por exemplo, "estabelecimento" vira "organização"; "cliente" vira a entidade que fizer sentido).
2. Implemente na ordem da seção 13. Cada etapa tem critérios de aceitação na seção 11.
3. O apêndice A traz o SQL de referência já consolidado (estado final, sem o histórico de migrações).

Sugestão de pedido para o Claude Code do outro projeto:

> Implemente o módulo de Tarefas (Kanban) conforme `docs/especificacoes/tarefas-kanban.md`. Siga a ordem da seção 13, crie as migrações a partir do apêndice A adaptando os nomes da seção 12, escreva os testes da seção 11 e só então as telas da seção 8.

## 1. Glossário

| Termo | Significado |
|---|---|
| Estabelecimento | Inquilino (tenant). Todo dado pertence a um. Em outro projeto: organização, empresa, escritório. |
| Administradora | Papel `admin` do estabelecimento. |
| Profissional | Papel `professional` (membro da equipe). |
| Pessoa / perfil | Linha de `public.users` ligada ao login (`auth_id`). Tem `role`, `active`, `estabelecimento_id`. |
| Quadro | Board do Kanban, com 2 a 10 colunas. |
| Coluna | Etapa do quadro. A primeira e a última são fixas. |
| Tarefa / cartão | Item do quadro (`internal_tasks`). |
| Sub-item | Item de checklist do cartão (`tarefa_itens`). |
| Comentário | Mensagem da thread do cartão (`tarefa_comentarios`). |
| Escopo | `negocio` (do estabelecimento) ou `pessoal` (de uma pessoa). |
| Visão | Onde o quadro aparece: `negocio`, `pessoal` ou `ambos`. |
| Compartilhamento | Acesso extra a um quadro, com permissão `ver` ou `editar`. |
| Grupo | Pasta pessoal da tela inicial para organizar quadros. |

## 2. Premissas

- Login obrigatório. A sessão só vale para perfil **ativo** de estabelecimento **ativo**. Funções de sessão usadas em tudo:
  - `usuario_atual_id()`: id em `public.users` da pessoa logada (nulo se inativa).
  - `usuario_ativo()`: perfil ativo de estabelecimento ativo.
  - `usuario_admin()`: idem e `role = 'admin'`.
  - `estabelecimento_atual()`: estabelecimento da sessão.
- Papel e status vêm sempre de `public.users`, nunca da tela.
- O Kanban **não cria perfil**: conta sem perfil ativo recebe "Acesso ainda não liberado.".
- Fuso de referência: `America/Sao_Paulo`. Datas de prazo são `date` (sem hora). Semanas de domingo a sábado.

## 3. Modelo de dados

Todas as tabelas têm `estabelecimento_id uuid not null default estabelecimento_atual()` com FK para `estabelecimentos`, índice, política RLS **restritiva** "mesmo estabelecimento" e o gatilho de guarda `a0_estabelecimento_guarda` (seção 4.12).

### 3.1 `kanban_quadros`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| nome | text | 1 a 30 caracteres (sem espaços nas pontas) |
| escopo | text | `negocio` ou `pessoal`, padrão `negocio` |
| dono_id | uuid FK users, `on delete cascade` | obrigatório se `pessoal`; opcional em `negocio` (quando preenchido = visão "ambos") |
| created_by | uuid FK users, `on delete set null` | quem criou |
| created_at | timestamptz | `now()` |

Restrição: `escopo = 'negocio' or dono_id is not null`. Índices: `created_at`; `dono_id` (parcial, não nulo).

### 3.2 `kanban_colunas`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| quadro_id | uuid FK quadros, `on delete cascade` | |
| nome | text | 1 a 25 caracteres |
| posicao | integer | 1 a 20 (o app usa 1..n, sem buracos) |
| created_at | timestamptz | |

Índice `(quadro_id, posicao)`.

### 3.3 `internal_tasks` (tarefas)

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| titulo | text | 1 a 200 caracteres. Na tela de criação o rótulo é "Descrição da tarefa" |
| responsible_id | uuid FK users | obrigatório |
| status | text | `pendente`, `em_andamento`, `concluida`. **Derivado da coluna** por gatilho; nunca enviado pela tela |
| data_limite | date | opcional |
| client_id | uuid FK clients, `on delete set null` | opcional (vínculo com cliente) |
| descricao | text | opcional, até 4000 caracteres. Rótulo na tela: "Observação" |
| criticidade | text | `normal`, `urgente`, `critico`, padrão `normal`. Rótulo: "Prioridade" ou "Criticidade" |
| ordem | integer | posição dentro da coluna (0..n). Na inserção o banco ignora o valor enviado e põe no fim |
| coluna_id | uuid FK colunas, `on delete cascade` | |
| created_by | uuid FK users, `on delete set null` | gravado pelo banco; imutável |
| envolvidos | uuid[] | até 20, sem repetição, só pessoas existentes |
| concluida_em | timestamptz | preenchido ao entrar na última coluna; limpo ao sair |
| cancelada_em | timestamptz | não nulo = cancelada |
| created_at | timestamptz | imutável |

Índices: `(coluna_id, ordem)`, GIN em `envolvidos`, `responsible_id`.

### 3.4 `tarefa_itens` (checklist)

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK tarefas, `on delete cascade` | |
| titulo | text | 1 a 200 |
| concluido | boolean | padrão false |
| ordem | integer | a tela envia `max(ordem) + 1` |
| created_at | timestamptz | |

Índice `(task_id, ordem, created_at)`. Ordenação de exibição: `ordem`, depois `created_at`.

### 3.5 `tarefa_comentarios` (thread)

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK tarefas, `on delete cascade` | imutável |
| autor_id | uuid FK users, `on delete set null` | gravado pelo banco; imutável |
| texto | text | 1 a 2000 (sem contar espaços nas pontas) |
| created_at | timestamptz | imutável |
| editado_em | timestamptz | preenchido pelo banco a cada edição |

Índice `(task_id, created_at)`.

### 3.6 `kanban_compartilhamentos`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| quadro_id | uuid FK quadros, `on delete cascade` | |
| destino | text | `negocio` (toda a equipe) ou `pessoa` |
| user_id | uuid FK users, `on delete cascade` | nulo se `negocio`; obrigatório se `pessoa` |
| permissao | text | `ver` ou `editar` |
| criado_por | uuid FK users, `on delete set null` | |
| created_at | timestamptz | |

Únicos: um `negocio` por quadro; um `(quadro_id, user_id)` por pessoa. Gatilhos de auditoria em update e delete.

### 3.7 `kanban_grupos` e `kanban_quadro_grupo`

`kanban_grupos`: `id`, `user_id` (padrão `usuario_atual_id()`, FK users `cascade`), `nome` (1 a 40 após `btrim`), `created_at`. Únicos `(user_id, nome)` e `(id, user_id)`.

`kanban_quadro_grupo`: `user_id` (padrão `usuario_atual_id()`), `quadro_id` (FK quadros `cascade`), `grupo_id`. PK `(user_id, quadro_id)` (um quadro fica em no máximo um grupo por pessoa). FK composta `(grupo_id, user_id)` para `kanban_grupos(id, user_id)` com `cascade` (o grupo tem de ser da mesma pessoa; excluir o grupo solta os quadros sem apagá-los).

## 4. Regras de negócio

### 4.1 Quadros e colunas

1. Primeiro acesso à aba: o banco cria o **"Kanban Padrão"** (escopo `negocio`) com as colunas **A Fazer, Fazendo, Concluído**, se o estabelecimento não tiver nenhum quadro do negócio. Protegido por trava (`pg_advisory_xact_lock`) por estabelecimento para não duplicar.
2. Novo quadro: nome 1 a 30; 2 a 10 colunas; nome de coluna 1 a 25; colunas novas não podem trazer `id`. A tela sugere as três colunas padrão.
3. Editar quadro (`kanban_salvar_quadro`): recebe a lista final `[{id?, nome}]` na ordem desejada.
   - A primeira e a última coluna são **fixas**: devem ser as atuais (mesmos ids, nas pontas). Podem ser renomeadas.
   - Coluna com `id` é renomeada e reposicionada; sem `id` é criada.
   - Coluna atual ausente da lista é **removida**: os cartões dela vão para o **fim da primeira coluna**, em ordem de posição antiga da coluna, ordem e criação.
   - Ids repetidos ou de outro quadro: "Coluna inválida.".
   - Ao final, o status de todos os cartões do quadro é recalculado.
4. Quadros e colunas **não aceitam escrita direta** pela API: só pelas funções. Update ou delete direto não altera nada (RLS sem política de escrita).
5. Excluir quadro apaga colunas, cartões, sub-itens, comentários, compartilhamentos e vínculos de grupo (cascata). O **último quadro do negócio** do estabelecimento não pode ser excluído: "Este é o único quadro do negócio. Crie outro antes de excluí-lo." Quadros pessoais podem.

### 4.2 Status pela posição da coluna

| Posição da coluna | Status |
|---|---|
| Primeira | `pendente` |
| Intermediária | `em_andamento` |
| Última | `concluida` |

- Entrou na última coluna: `concluida_em = now()` se estiver nulo. Saiu: `concluida_em = null`.
- Na edição, ao escolher a última coluna aparece o campo **"Concluída em"** (data, máximo hoje, padrão hoje ou a data atual). A data é gravada como **meio-dia de Brasília** (`AAAA-MM-DDT12:00:00-03:00`) para não mudar de dia em UTC; a exibição converte de volta pelo fuso `America/Sao_Paulo`.
- A tela calcula o mesmo status para atualização otimista (`statusDaPosicao(indice, total)`), mas o banco é a fonte.

### 4.3 Tarefas

- Campos aceitos na criação: `titulo, responsible_id, data_limite, criticidade, descricao, client_id, coluna_id, envolvidos`. Na edição, os mesmos mais `cancelada` (boolean) e `concluida_em` (data). Qualquer outro campo (inclusive `status`) é recusado: "Campo não permitido: X.". Edição vazia: "Nada para salvar.".
- Validações (tela e banco): título 1 a 200 após `trim`; responsável UUID; data `AAAA-MM-DD` válida; criticidade da lista; observação até 4000; cliente UUID ou nulo; coluna UUID; envolvidos UUIDs, no máximo 20 distintos.
- Banco na inserção: `ordem` = fim da coluna (com trava por coluna), `created_by` = pessoa da sessão, `created_at = now()`. Na atualização, `created_by` e `created_at` não mudam.
- Envolvidos: o banco remove repetidos e recusa id inexistente ("Envolvido inválido."). Na tela, trocar o responsável o tira da lista de envolvidos.
- **Cancelar** grava `cancelada_em = now()`; **Reativar** grava nulo. Canceladas somem da visão padrão e só aparecem no filtro "Canceladas"; o cartão mostra o selo "CANCELADA" e fica esmaecido.
- **Atrasada**: tem `data_limite`, não está concluída e `data_limite < hoje`. Mostra a data em vermelho com " · atrasada" (no cartão compacto, um ponto vermelho).
- Padrões da janela "Adicionar tarefa": data = hoje, prioridade Normal, responsável = quem está logado, quadro = o aberto, coluna = a escolhida ou a primeira.
- Rodapé fixo da edição: "Quadro de tarefas (to-do): sem controle de horário ou ponto. Prazos são apenas referência de organização."

### 4.4 Mover e reordenar

- Função `kanban_reordenar(coluna, ids[])`: grava a ordem final da coluna de destino (`ordem = índice`, a partir de 0) e move para ela os cartões vindos de outra coluna. Lista de 1 a 500 ids, sem repetição, todos existentes e visíveis; coluna existente. Roda como **security invoker** (vale o RLS de update de cada cartão).
- Regra de reordenação local (`reordenar(lista, id, coluna, antesDe)`): tira o cartão da origem, insere na coluna destino antes de `antesDe` (ou no fim se nulo ou desconhecido) e renumera só a coluna destino. Soltar sobre si mesmo ou id desconhecido: nada muda.
- A tela aplica a mudança na hora (otimista) e desfaz se o banco recusar, com aviso "Não foi possível mover o cartão.".

### 4.5 Checklist (sub-itens)

- Adicionar com Enter (título cortado em 200), marcar e desmarcar, remover. Gravação imediata, sem botão salvar ("salvos na hora").
- Contador `feitos/total` e barra de progresso verde.
- No cartão do quadro, o campo de novo item aparece ao clicar em "+ Sub-item"; Esc ou sair vazio fecha.

### 4.6 Comentários (thread)

- Lista em ordem de criação, com autor ("Você" para os próprios; "Ex-integrante" se o autor foi removido), data e hora em Brasília (`dd/MM HH:mm`) e "(editado)".
- Os próprios ficam à direita e com cor de destaque; os dos outros, à esquerda.
- Enviar: botão ou Ctrl/Cmd+Enter. Até 2000 caracteres.
- Editar: só o autor. Excluir: o autor ou a administradora.
- Atualização automática a cada 30 segundos enquanto a tarefa está aberta; rola até o último.
- Comentar exige permissão de **editar** o quadro; ler exige ver a tarefa.

### 4.7 Visões, permissões e visibilidade

**Permissão no quadro** (`kanban_permissao`), em ordem:

1. Sem sessão válida ou quadro inexistente: sem acesso.
2. Dono do quadro (`dono_id = eu`): `editar`.
3. Quadro do negócio:
   - administradora: `editar`;
   - demais: o compartilhamento pessoal com ela, se houver (`ver` ou `editar`); se não houver, `editar`. Ou seja, compartilhar um quadro do negócio com permissão `ver` serve também para **restringir** alguém a só visualizar.
4. Quadro pessoal de outra pessoa: `editar` se o compartilhamento pessoal ou com o negócio for `editar`; senão `ver` se algum existir; senão sem acesso. **A administradora não vê quadro pessoal alheio sem compartilhamento.**

**Quem gerencia** (renomeia visão, compartilha, exclui) (`kanban_gerencia`): o dono; em quadro do negócio, também a administradora.

**Quais tarefas a pessoa vê** num quadro que ela acessa (`kanban_tarefa_visivel`):

| Situação | Tarefas visíveis |
|---|---|
| Quadro pessoal (próprio ou compartilhado) | Todas |
| Dono do quadro ("ambos") | Todas |
| Quadro do negócio compartilhado com a pessoa | Todas |
| Quadro do negócio, administradora | Todas |
| Quadro do negócio, profissional | Só as que ela é responsável, criadora ou envolvida |

**Onde o quadro aparece** (`kanban_quadros_visiveis`):

- `no_negocio`: escopo `negocio` ou compartilhado com o negócio.
- `no_pessoal`: sou dono, ou foi compartilhado com a minha pessoa.
- `compartilhado`: tem algum compartilhamento.

**Visão do quadro** (derivada): `pessoal` se escopo pessoal; `ambos` se escopo negócio com dono; `negocio` se escopo negócio sem dono.

**Excluir quadro**: o dono; em quadro do negócio, também a administradora ou quem criou o quadro. Mensagem: "Só quem é dono do quadro pode excluí-lo.".

**Excluir tarefa**: permissão de editar o quadro e (administradora, ou quem criou a tarefa, ou dono do quadro).

**Editar tarefa**: ver a tarefa e poder editar a coluna de origem e a de destino.

### 4.8 Compartilhamento

| Quadro | Pode compartilhar com |
|---|---|
| Pessoal | O negócio (toda a equipe) ou uma pessoa ativa (não o próprio dono) |
| Negócio ("negocio" ou "ambos") | O espaço pessoal de uma pessoa ativa |

- Só quem gerencia: "Só quem é dono do quadro pode compartilhá-lo.".
- Compartilhar de novo com o mesmo destino **muda a permissão**, não duplica.
- Quadro do negócio não pode ser compartilhado com o negócio: "Este quadro já é do negócio.".
- Remover: apagar a linha (política de delete só para quem gerencia). Quem recebeu não remove.
- Quem recebe por compartilhamento vê **todas** as tarefas do quadro.
- Mudança e remoção ficam na trilha de auditoria.
- Plano Básico não permite compartilhar (seção 4.11).

### 4.9 Mudar a visão do quadro (`kanban_definir_visao`)

| De / para | Efeito no banco |
|---|---|
| para `negocio` | escopo `negocio`, sem dono. **Só a administradora** ("Só a administradora pode deixar um quadro apenas no negócio.") |
| para `pessoal` | escopo `pessoal`, dono = atual ou quem pediu |
| para `ambos` | escopo `negocio`, dono = atual ou quem pediu |

- Só quem gerencia.
- Tirar do negócio o último quadro do negócio: "Este é o único quadro do negócio. Crie outro antes de tirá-lo do negócio.".
- Indo para o negócio (`negocio` ou `ambos`) com compartilhamento com o negócio ativo: o banco recusa ("Remova o compartilhamento com o negócio antes de mudar a visualização."); a tela remove esse compartilhamento antes de chamar a função.
- É **um único quadro**: alterar em uma visão altera na outra.

### 4.10 Grupos

- Organização **pessoal** da tela inicial: cada pessoa cria os seus; ninguém mais vê.
- Nome 1 a 40, sem repetir outro grupo da mesma pessoa (comparação sem diferenciar maiúsculas).
- Um quadro fica em no máximo um grupo por pessoa; só pode ser posto em grupo quadro que a pessoa vê.
- Os grupos aparecem nas duas visões; cada visão mostra só os quadros dela dentro de cada grupo.
- Excluir grupo: os quadros voltam para "Sem grupo"; nenhum quadro é apagado.

### 4.11 Plano (opcional no outro projeto)

- Plano **Básico**: inserir compartilhamento é recusado (`plano_sem_compartilhamento`). Rotinas sem sessão passam.
- **Demonstração vencida**: qualquer insert, update ou delete nas tabelas do Kanban é recusado (`plano_demonstracao_encerrada`); a leitura continua. Feito por gatilho para pegar também as funções `security definer`.
- A tela traduz esses códigos em mensagens amigáveis.

### 4.12 Vários estabelecimentos (multi-tenant)

- Política **restritiva** em todas as tabelas: `estabelecimento_id = (select estabelecimento_atual())` em `using` e `with check`.
- Gatilho `a0_estabelecimento_guarda` (antes dos demais): impede trocar `estabelecimento_id` e recusa qualquer FK que aponte para registro de outro estabelecimento (`referencia_de_outro_estabelecimento`).
- Contagens "único quadro do negócio" e "Kanban Padrão" são por estabelecimento.

## 5. Funções do banco

| Função | Tipo | Quem executa | Faz |
|---|---|---|---|
| `kanban_usuario_atual()` | definer | authenticated | Id da pessoa ativa ou erro "Acesso ainda não liberado." |
| `kanban_garantir_padrao()` | definer | authenticated | Cria o Kanban Padrão do estabelecimento se faltar |
| `kanban_validar_quadro(nome, colunas)` | immutable | ninguém direto | Valida nome e colunas; devolve o nome aparado |
| `kanban_criar_quadro(nome, colunas, escopo='negocio')` | definer | authenticated | Cria quadro e colunas; pessoal recebe dono |
| `kanban_salvar_quadro(id, nome, colunas)` | definer | authenticated | Confere `editar` e aplica a seção 4.1 item 3 |
| `kanban_excluir_quadro(id)` | definer | authenticated | Confere quem pode e exclui |
| `kanban_reordenar(coluna, ids[])` | invoker | authenticated | Grava ordem e move cartões |
| `kanban_quadros_visiveis()` | definer, stable | authenticated | Lista quadros com `permissao, gerencia, no_negocio, no_pessoal, compartilhado, dono_nome` |
| `kanban_compartilhar(quadro, destino, user, permissao)` | definer | authenticated | Cria ou muda compartilhamento |
| `kanban_definir_visao(quadro, visao)` | definer | authenticated | Seção 4.9 |
| `kanban_permissao(quadro)` | definer, stable | authenticated (usada no RLS) | `editar`, `ver` ou nulo |
| `kanban_gerencia(quadro)` | definer, stable | authenticated (RLS) | boolean |
| `kanban_pode_editar_coluna(coluna)` | definer, stable | authenticated (RLS) | permissão do quadro da coluna = `editar` |
| `kanban_tarefa_visivel(coluna, resp, envolvidos, criador)` | definer, stable | authenticated (RLS) | Seção 4.7 |
| `tarefa_visivel(resp, envolvidos, criador)` | definer, stable | authenticated (RLS) | Administradora ou responsável, criadora, envolvida |

Toda função `security definer` com `set search_path = public, pg_temp`. `revoke all ... from public, anon`; funções de gatilho sem execução para ninguém.

## 6. RLS por tabela (além da restritiva por estabelecimento)

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| kanban_quadros | `kanban_permissao(id) is not null` | sem política (só funções) | sem política | sem política |
| kanban_colunas | `kanban_permissao(quadro_id) is not null` | sem política | sem política | sem política |
| internal_tasks | `kanban_tarefa_visivel(...)` | `usuario_ativo() and kanban_pode_editar_coluna(coluna_id)` | using: visível e pode editar a coluna; check: pode editar a coluna destino | pode editar a coluna e (admin ou criador ou dono do quadro) |
| tarefa_itens | existe tarefa visível | tarefa com coluna editável | idem | idem |
| tarefa_comentarios | existe tarefa visível | `usuario_ativo()` e tarefa com coluna editável | `autor_id = usuario_atual_id()` | admin ou autor |
| kanban_compartilhamentos | `kanban_gerencia(quadro_id) or user_id = usuario_atual_id()` | sem política (só `kanban_compartilhar`) | sem política | `usuario_ativo() and kanban_gerencia(quadro_id)` |
| kanban_grupos | `usuario_ativo() and user_id = usuario_atual_id()` | idem | idem (using e check) | idem |
| kanban_quadro_grupo | idem | idem e `kanban_permissao(quadro_id) is not null` | idem | `usuario_ativo() and user_id = usuario_atual_id()` |

`anon` sem nenhum privilégio. `authenticated` sem `truncate`, `references`, `trigger`.

## 7. Gatilhos (ordem alfabética define a execução)

| Tabela | Gatilho | Momento | Faz |
|---|---|---|---|
| todas | `a0_estabelecimento_guarda` | before insert/update/delete | Seção 4.12 |
| todas | `a1_plano_trava_demonstracao` | before insert/update/delete | Seção 4.11 |
| kanban_compartilhamentos | `a2_plano_basico` | before insert | Seção 4.11 |
| internal_tasks | `internal_tasks_a_defaults` | before insert/update | ordem no fim, created_by, created_at imutáveis |
| internal_tasks | `internal_tasks_b_envolvidos` | before insert/update of envolvidos | sem repetição, só pessoas existentes |
| internal_tasks | `internal_tasks_c_status_da_coluna` | before insert/update of coluna_id, status, concluida_em | status e concluida_em (seção 4.2) |
| tarefa_comentarios | `tarefa_comentarios_a_autor` | before insert/update | autor e datas pelo banco |
| kanban_quadros | `kanban_quadros_protege_unico` | before delete | último quadro do negócio |
| kanban_compartilhamentos | auditoria | after update/delete | trilha |

## 8. Interface

### 8.1 Rota e parâmetros de URL

Rota única `/tarefas`. O estado navegável fica na URL:

| Parâmetro | Valores | Efeito |
|---|---|---|
| `quadro` | uuid | Abre o quadro. Inexistente ou sem acesso: volta à tela inicial |
| `visao` | `pessoal` | Tela inicial na visão pessoal (ausente = negócio) |
| `nova` | `tarefa`, `quadro` | Abre a janela correspondente. `tarefa` sem quadro abre o primeiro quadro com a janela aberta |
| `periodo` | ver 8.6 | Filtro de período |
| `de`, `ate` | `AAAA-MM-DD` | Só com `periodo=personalizado` e `de <= ate` |
| `pessoa` | uuid | Filtro de pessoa |
| `atrib` | `responsavel`, `criador`, `envolvido` | Só com `pessoa` |
| `status` | `canceladas` | Mostra só as canceladas |

Valor inválido volta ao padrão. Valores padrão não aparecem na URL. Atalhos globais (botão "+" do menu principal): "Tarefa" (`/tarefas?nova=tarefa`) e "Novo quadro" (`/tarefas?nova=quadro`).

### 8.2 Carregamento

1. `kanban_usuario_atual()` e `kanban_garantir_padrao()` (uma vez por sessão).
2. Em paralelo: quadros visíveis, colunas, pessoas (`id, name, auth_id, active`), clientes (pela visão que mascara contato para quem não é administradora), grupos e vínculos.
3. Erro: "Não foi possível abrir o Kanban." com a mensagem amigável e botão "Tentar de novo". Carregando: spinner centralizado.

### 8.3 Tela inicial (lista de quadros)

Cabeçalho: título "Kanban de tarefas" e subtítulo conforme a visão:
- Negócio: "Quadros do negócio e quadros pessoais compartilhados com ele."
- Pessoal: "Seus quadros pessoais (só você vê) e os compartilhados com você."

Controles à direita:
1. **Formato dos quadros** (botões de ícone): Cartões, Compacto, Lista. Lembrado no navegador (`localStorage`, chave `jb-kanban-formato-quadros`; sem armazenamento, vale só na visita).
2. **Novo grupo**.
3. Abas **Negócio | Pessoal**.

Seções: uma por grupo (ordem alfabética, grupos vazios aparecem com "Nenhum quadro neste grupo nesta visão. Use "Mover para grupo" no menu de um quadro.") e "Sem grupo" sempre no fim. O cabeçalho de seção só aparece se a pessoa tiver algum grupo. Cada seção recolhe e expande (seta), mostra "N quadro(s)" e, nos grupos, botões renomear e excluir.

Cor do quadro: 8 gradientes, escolhidos pela posição do quadro na lista completa (estável ao trocar de grupo ou visão): azul-marinho, verde-petróleo, roxo, laranja escuro, azul, vinho, verde, grafite.

Contagem por quadro (consulta leve só com `coluna_id` das tarefas não canceladas): a fazer = primeira coluna; fazendo = intermediárias; concluído = última.

Formatos:

| Formato | Aparência | Conteúdo |
|---|---|---|
| Cartões | Bloco 128 px, gradiente, grade 1/2/3/4 colunas conforme a largura | Nome (até 2 linhas), selos, barra de progresso (a fazer branco, fazendo âmbar, concluído verde), texto "X a fazer · Y fazendo · Z concluído" ou "Nenhuma atividade" |
| Compacto | Faixa 68 px, grade 2/3/5 | Nome numa linha, "concluídos/total", barra |
| Lista | Linha por quadro com marca de cor à esquerda | Nome, selos, contagens por etapa (no celular só "concluídos/total"), barra |

Selos:
- "Negócio e pessoal": quadro "ambos" de que sou dono.
- "Pessoal de Fulana": quadro pessoal na visão do negócio.
- "Do negócio": quadro do negócio na visão pessoal (exceto o meu "ambos").
- "De Fulana": pessoal de outra pessoa na visão pessoal.
- "Só visualizar": permissão `ver`.
- "Compartilhado": tem compartilhamento e eu gerencio.

Botão de criar no fim da seção "Sem grupo": "Criar quadro do negócio" ou "Criar quadro pessoal" (no compacto, "Novo quadro").

Menu ⋮ de cada quadro: Editar quadro (se pode editar), Mover para grupo, Compartilhar (se gerencia), Excluir quadro (se gerencia). Sem nenhuma ação: "Compartilhado com você só para visualizar.".

### 8.4 Quadro aberto

Cabeçalho:
- Link "‹ Quadros" (volta para a visão pessoal se o quadro não aparece no negócio).
- Título "Kanban de tarefas" e **seletor de quadros** (lista de todos os visíveis, com marca no atual, e "Novo quadro").
- **Visualização dos cartões**: Detalhada | Compacta (lembrada em `localStorage`, chave `jb-kanban-densidade`). Na compacta, botão **Expandir todas / Recolher todas**.
- Atualizar (ícone gira enquanto busca).
- Menu ⋮ "Opções do quadro": Editar quadro (se pode editar), Compartilhar (se gerencia), Equipe (só administradora), Excluir quadro (se gerencia; avisa se for o único do negócio).
- Botão "+": Tarefa (se pode editar) e Novo quadro.

Faixa de aviso:
- Só visualizar: "Quadro compartilhado com você só para visualizar (de Fulana)."
- Senão (só no PC): "Arraste os cartões entre as colunas ou para cima e para baixo para definir a ordem."

Barra de filtros (8.6) e colunas:
- Cabeçalho da coluna com nome e contador colorido (primeira índigo, intermediárias âmbar, última verde).
- Coluna vazia: "Arraste tarefas para cá" (PC) ou "Nenhuma atividade" (toque).
- Botão "+ Nova atividade" no pé de cada coluna (abre "Adicionar tarefa" já nessa coluna).
- Até 3 colunas: dividem a largura (mínimo 300 px). Mais de 3: 300 px cada, com rolagem horizontal.
- Altura limitada com rolagem vertical interna por coluna.

### 8.5 Cartão de tarefa

**Detalhado** (borda esquerda colorida pela criticidade: normal sem cor, urgente âmbar, crítico vermelho):
- Alça de arrastar (só PC e se pode editar), título (riscado se concluída), ações editar e excluir (aparecem ao passar o mouse; no toque sempre visíveis). Só visualizar: ícone de olho "Ver tarefa".
- Linha de dados: selos CANCELADA, URGENTE, CRÍTICO; responsável; data limite (vermelha se atrasada); "Concluída em dd/mm/aaaa".
- "Cliente: Nome" (se houver).
- Checklist (ver 4.5).
- Observação editável no próprio cartão: clique abre área de texto; sair salva (só se mudou); Esc descarta. Sem observação: botão "Observação".
- No toque: "Mover para [coluna]" (seletor) e setas subir e descer.

**Compacto** (recolhido): uma linha com alça, título truncado (clicar expande), ponto vermelho se atrasada, ícone de checklist com "feitos/total", **iniciais do responsável** num círculo (duas primeiras palavras, só letras: remove números, emojis e símbolos; sem letras = "?") e seta para expandir. Expandido: igual ao detalhado, com seta para recolher. Cada cartão expande sozinho; trocar a densidade recolhe todos.

### 8.6 Filtros (barra acima das colunas)

1. **Período** (sobre `data_limite`): Todas as datas; Hoje, Amanhã, Esta semana, Este mês, Próximos 3 dias, Próxima semana, Próximo mês; Ontem, Últimos 7 dias, Últimos 30 dias; Definir período (De e Até, Aplicar só com `de <= ate`).
2. **Intervalo**: botão extra com o intervalo ativo ("OUTUBRO/2026", "03/10/2026" ou "27/09/2026 a 03/10/2026"); clicar abre "Definir período".
3. **Pessoas e atribuições**: escolher uma pessoa e a atribuição (Todas, Responsável, Quem criou, Envolvido). Atribuição só habilita com pessoa.
4. **Status**: Ativas (padrão) ou Canceladas.
5. **Limpar filtros** (só com filtro ativo).

Regras:
- Com período, cartão sem data não aparece.
- Intervalos inclusivos: esta semana = domingo a sábado; próximos 3 dias = hoje a hoje+3; últimos 7 = hoje-6 a hoje; últimos 30 = hoje-29 a hoje; meses do dia 1 ao último dia.
- Os painéis trabalham com rascunho: só valem ao Aplicar (o de Período aplica ao clicar na opção).
- O filtro é só de exibição; a segurança é o RLS.

### 8.7 Janelas

Todas: tela cheia no celular; caixa centralizada (640 px) com faixa de cor à esquerda no PC; fecham com Esc, X ou clique fora; rodapé com mensagem de erro, CANCELAR/FECHAR e SALVAR (com spinner).

| Janela | Campos e regras |
|---|---|
| Adicionar tarefa | Descrição da tarefa*, Data, Prioridade*, Cliente (busca por nome ou telefone, até 8 sugestões, chip removível), Responsável* com "+ Envolver mais pessoas" (lista com caixas, até 20), Quadro do Kanban* (só quadros editáveis; trocar de quadro escolhe a primeira coluna), Coluna do Kanban* |
| Editar tarefa / Ver tarefa | Título*, Criticidade (3 botões), Responsável e envolvidos, Data limite, Coluna, Concluída em (só na última coluna), Cliente, Observação (contador de restantes), Sub-itens (salvos na hora), Comentários. Rodapé: Excluir, Cancelar tarefa/Reativar, FECHAR, SALVAR. Envia **só os campos alterados**; sem mudança, apenas fecha. Só visualizar: tudo desabilitado e só FECHAR |
| Novo quadro / Editar quadro | Nome* (contador), "Onde aparece" (Negócio, Pessoal, Ambos, com dica de cada um; só para quem gerencia; "Negócio" bloqueado para quem não é administradora em quadro que não está só no negócio), Grupo (se houver grupos), Colunas: lista numerada com cadeado nas fixas, arrastar as do meio (no toque, setas), remover (mínimo 2), "+ NOVA COLUNA" (insere antes da última, máximo 10), aviso sobre fixas e remoção. Criar com visão "ambos" = criar no negócio e depois definir "ambos". Quadro criado abre ao fechar a janela |
| Compartilhar | Lista "Compartilhado com" (Negócio ou "Pessoal de Fulana", permissão alterável, remover). Adicionar: "Com quem" (pessoal: Negócio ou pessoas ativas exceto o dono; negócio: "Pessoal de Fulana") e permissão (Somente visualizar, Visualizar e editar) |
| Novo/Renomear grupo | Nome* (contador), aviso "Só você vê os seus grupos." |
| Grupo do quadro | Seletor (Sem grupo + grupos) e "+ NOVO GRUPO" |
| Equipe (só administradora) | Lista de pessoas com nome editável e "Ativa"; adicionar nova pessoa (papel profissional). No outro projeto, prefira a tela de equipe própria do sistema |
| Confirmar | Excluir tarefa ("... e os sub-itens dela serão apagados. Esta ação não pode ser desfeita."), Excluir quadro ("O quadro X, as colunas e todos os cartões dele serão apagados..."), Excluir grupo ("Os quadros dele voltam para Sem grupo; nenhum quadro é apagado.") |

### 8.8 Celular e toque

- Detecção de toque: largura até 1023 px ou ponteiro grosso. Celular: até 767 px.
- Toque: sem arrastar; cartão com seletor "Mover para" e setas; botões de ação sempre visíveis; colunas do quadro reordenadas por setas na janela de quadro.
- Celular: colunas deslizantes com encaixe (cada coluna com 85% da largura, máximo 384 px); janelas e painéis de filtro em tela cheia com título, X e rodapé.
- Nada de rolagem horizontal da página fora da faixa de colunas.

### 8.9 Arrastar e soltar (PC)

- HTML5 drag and drop nativo, sem biblioteca.
- Sobre um cartão: metade de cima insere antes dele; metade de baixo, depois. Sobre área vazia da coluna: fim.
- Linha indicadora colorida mostra onde vai cair; o cartão arrastado fica esmaecido.
- Arraste iniciado em campo de texto, seletor ou botão não move o cartão.

### 8.10 Mensagens e erros

- Toda mensagem na tela passa por um tradutor central; nunca mostrar `error.message` cru do banco. As exceções de regra (seção 4) têm texto já pensado para a pessoa usuária e podem ser repassadas quando reconhecidas; o resto vira "Não foi possível salvar. Tente novamente.".
- Avisos flutuantes no rodapé somem em 5 segundos.

### 8.11 Cache e atualização (TanStack Query)

Chaves: `['kanban']` (base), `quadros`, `colunas`, `resumo`, `tarefas/<quadro>`, `pessoas`, `comentarios/<tarefa>`, `compartilhamentos/<quadro>`, `eu`, `grupos`, `clientes`.

- Tarefas do quadro: `select('*, tarefa_itens(*)')` nas colunas do quadro, ordenadas por `ordem`, `created_at`; o nome da cliente é anexado numa segunda consulta.
- Otimista: mover, marcar e remover sub-item, salvar observação. Em erro, volta ao estado anterior e avisa.
- Depois de gravar: invalida a chave do quadro e o resumo; criar ou excluir quadro invalida a base.

## 9. Acessibilidade

- Abas com `role="tab"` e `aria-selected`; grupos de botões com `role="group"`/`radiogroup` e `aria-pressed`/`aria-checked`.
- Menus com `role="menu"` e `menuitem`; janelas com `role="dialog"`, `aria-modal`; confirmações com `alertdialog`.
- Todos os botões de ícone com `aria-label`. Erros com `role="alert"`.

## 10. Segurança (checklist)

1. RLS ligado em todas as tabelas, com política por operação; nunca `using (true)`.
2. Política restritiva por estabelecimento e gatilho de guarda.
3. Quadros, colunas e criação de compartilhamento só por função `security definer` com `search_path` fixo.
4. Campos de autoria (`created_by`, `autor_id`, datas) gravados pelo banco.
5. Status derivado da coluna no banco; a tela não envia `status`.
6. Pessoal alheio invisível até para a administradora sem compartilhamento.
7. Profissional vê no negócio só as tarefas em que participa.
8. Contato de cliente mascarado para quem não é administradora (visão própria).
9. Auditoria de mudança e remoção de compartilhamento.
10. Preferências de tela (formato e densidade) em `localStorage`: só preferência visual, nada sensível.
11. Erros e logs por módulo central; sem detalhes técnicos na tela.

## 11. Critérios de aceitação (testes)

### 11.1 Lógica pura (unitários)

1. `reordenar`: sobe na coluna; desce para o fim; muda de coluna na posição escolhida; soltar sobre si mesmo não muda; id desconhecido não muda; renumera a coluna destino a partir de 0.
2. `statusDaPosicao`: 4 colunas (0 pendente, 1 e 2 em andamento, 3 concluída); 2 colunas (pendente e concluída).
3. `intervaloKanban` com hoje = sábado 03/10/2026: esta semana 27/09 a 03/10; próxima 04/10 a 10/10; este mês 01/10 a 31/10; próximo mês em dezembro vira janeiro do ano seguinte; próximos 3 = 03/10 a 06/10; últimos 7 = 27/09 a 03/10; últimos 30 = 04/09 a 03/10; hoje, amanhã e ontem; personalizado exige `de <= ate`.
4. Rótulo do intervalo: mês por extenso em maiúsculas, dia único, intervalo.
5. `lerFiltros`/`urlFiltros`: ida e volta iguais; padrão fora da URL; inválido volta ao padrão; personalizado sem datas vira "todos"; atribuição só com pessoa.
6. `passaNoFiltro`: canceladas escondidas por padrão e só elas no filtro; com período, cartão sem data some; atribuição por pessoa.
7. Atrasada; "concluída em" vira meio-dia de Brasília.
8. Validações: padrões; campo extra e `status` recusados; criticidade e UUID inválidos; mais de 20 envolvidos; observação acima de 4000; título vazio ou longo; edição vazia; conversão de `cancelada` e `concluida_em`; quadro com 1 ou 11 colunas; coluna acima de 25.
9. Visões: separar por visão incluindo compartilhados; quadro sem dados de escopo fica no negócio; permissão de edição; `visaoDoQuadro`.
10. Grupos: ordem por nome, vazios aparecem, "sem grupo" no fim; sem grupos só a seção sem grupo; nome com tamanho e sem repetição.
11. Iniciais: "Ana Maria" = "AM"; "João 2" = "J"; só símbolos = "?".

### 11.2 Banco (SQL num Postgres descartável, simulando sessões por `request.jwt.claims`)

1. `anon` não lê nem grava nada.
2. Conta sem perfil ativo: "Acesso ainda não liberado.".
3. Primeiro acesso cria um único Kanban Padrão com A Fazer, Fazendo, Concluído.
4. Update e delete direto em quadro e coluna não alteram nada.
5. Validações de quadro (nome, 2 a 10 colunas, nome de coluna).
6. Cartão novo vai para o fim e ignora a ordem enviada; `created_by` pelo banco; status pela coluna; `concluida_em` ao entrar e sair da última.
7. Editar quadro: fixas protegidas; remover coluna leva cartões para o fim da primeira; status recalculado.
8. Reordenar: ordem gravada; lista inválida recusada.
9. Último quadro do negócio não sai; pessoal sai.
10. Pessoal: dono vê; administradora e outra profissional não veem (nem as tarefas).
11. Pessoal compartilhado com o negócio em `ver`: equipe vê na visão do negócio, todas as tarefas, edição ignorada. Mudar para `editar` não duplica e libera criar tarefa.
12. Negócio compartilhado com o pessoal de uma profissional em `ver`: aparece no pessoal dela, vê todas as tarefas, só leitura; quem não recebeu restrição continua editando.
13. Quem recebeu não remove o compartilhamento; removendo, volta a ver só as próprias.
14. Excluir pessoal leva os compartilhamentos; trilha registra mudança e remoção.
15. Visão: quem não gerencia não muda; profissional não deixa "só negócio"; pessoal para ambos aparece nas duas visões do dono e só no negócio para a equipe (que segue a regra das próprias tarefas); administradora gerencia sem aparecer no pessoal dela; negócio para ambos e de volta tira o dono; ambos para pessoal some do negócio.
16. Grupos: mover de grupo; renomear; outra pessoa não vê, não altera nem exclui; excluir grupo solta os quadros sem apagá-los; grupo de outra pessoa recusado na FK.
17. Plano Básico recusa compartilhar; demonstração vencida recusa gravar e permite ler.
18. Outro estabelecimento: nada visível; FK cruzada recusada.

### 11.3 Tela (manual ou e2e)

1. Alternar Negócio/Pessoal muda a URL e a lista.
2. Formato e densidade persistem ao recarregar.
3. Cartão compacto expande e recolhe sozinho; "Expandir todas" e "Recolher todas".
4. Arrastar no PC com linha indicadora; no celular, "Mover para" e setas.
5. Quadro "Só visualizar": sem "+ Nova atividade", sem arrastar, janela "Ver tarefa" desabilitada.
6. Filtros na URL sobrevivem ao recarregar e ao compartilhar o link.
7. `?nova=tarefa` e `?nova=quadro` abrem as janelas; quadro criado abre ao fechar.

## 12. Adaptação para outro projeto

| Aqui | Troque por | Observação |
|---|---|---|
| `estabelecimento_id`, `estabelecimento_atual()` | `organizacao_id`, `organizacao_atual()` | Se for um único inquilino, remova a política restritiva e o gatilho de guarda |
| `public.users` (`id, auth_id, name, apelido, role, active`) | sua tabela de perfis | Precisa de papel administrador e status ativo |
| `role = 'admin'` / `'professional'` | seus papéis | Mantenha um papel com poder sobre os quadros do negócio |
| `client_id` + `clientes_visiveis` | entidade do seu domínio (processo, projeto, contato) ou remova | Se o contato for sensível, crie visão que mascara |
| "Negócio" | "Equipe", "Empresa" | Rótulos de tela |
| Planos (Básico, demonstração) | seus planos ou remova os gatilhos `a1_` e `a2_` | |
| `America/Sao_Paulo` e meio-dia `-03:00` | seu fuso | Ajuste `conclusaoParaTimestamp` e `diaEmBrasilia` |
| Cores rosa (`rose-*`) | sua paleta | Gradientes dos quadros podem ficar |
| Chaves `jb-kanban-*` do `localStorage` | prefixo do seu app | |
| Auditoria `auditar_alteracao_generica()` | sua trilha | Opcional, recomendada |

Mantenha sem alteração: status pela coluna, colunas fixas, regras de permissão e visibilidade, compartilhamento, visões e grupos, validações e limites.

## 13. Ordem de implementação sugerida

1. Migração 1: tabelas, índices, RLS, funções de quadro, gatilhos dos cartões, padrão (apêndice A, partes 1 a 4). Testes 11.2 itens 1 a 9.
2. Migração 2: escopo, dono, compartilhamentos, permissões, visões e grupos (partes 5 a 7). Testes 11.2 itens 10 a 16.
3. Migração 3 (se houver): plano e multi-inquilino. Testes 11.2 itens 17 e 18.
4. Lógica pura (`logic.ts`) e testes 11.1.
5. Acesso a dados (`api.ts`) com as chaves da 8.11.
6. Tela inicial (8.3), quadro aberto (8.4), cartão (8.5), filtros (8.6), janelas (8.7), toque e celular (8.8), arrastar (8.9).
7. Atalhos globais e item de menu.
8. Testes de tela (11.3).

## Apêndice A. SQL de referência consolidado

Estado final, já com o multi-inquilino. Pressupõe existirem `public.users`, `public.clients`, `public.estabelecimentos`, as funções de sessão da seção 2, `public.estabelecimento_guarda()`, `public.plano_trava_demonstracao()`, `public.plano_do_estabelecimento(uuid)` e `public.auditar_alteracao_generica()`. Remova o que não usar (seção 12).

```sql
begin;

-- 1. Tabelas ------------------------------------------------------------------
create table public.kanban_quadros (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  nome text not null check (char_length(nome) between 1 and 30),
  escopo text not null default 'negocio' check (escopo in ('negocio', 'pessoal')),
  dono_id uuid references public.users(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint kanban_quadros_dono_check check (escopo = 'negocio' or dono_id is not null)
);
create index kanban_quadros_created_idx on public.kanban_quadros (created_at);
create index kanban_quadros_dono_idx on public.kanban_quadros (dono_id) where dono_id is not null;
create index kanban_quadros_estabelecimento_idx on public.kanban_quadros (estabelecimento_id);

create table public.kanban_colunas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 25),
  posicao integer not null check (posicao between 1 and 20),
  created_at timestamptz not null default now()
);
create index kanban_colunas_quadro_idx on public.kanban_colunas (quadro_id, posicao);
create index kanban_colunas_estabelecimento_idx on public.kanban_colunas (estabelecimento_id);

create table public.internal_tasks (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  titulo text not null check (char_length(titulo) between 1 and 200),
  responsible_id uuid not null references public.users(id),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  data_limite date,
  client_id uuid references public.clients(id) on delete set null,
  descricao text check (descricao is null or char_length(descricao) <= 4000),
  criticidade text not null default 'normal' check (criticidade in ('normal', 'urgente', 'critico')),
  ordem integer not null default 0,
  coluna_id uuid not null references public.kanban_colunas(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  envolvidos uuid[] not null default '{}' check (cardinality(envolvidos) <= 20),
  concluida_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz not null default now()
);
create index internal_tasks_coluna_idx on public.internal_tasks (coluna_id, ordem);
create index internal_tasks_envolvidos_idx on public.internal_tasks using gin (envolvidos);
create index internal_tasks_responsible_idx on public.internal_tasks (responsible_id);
create index internal_tasks_estabelecimento_idx on public.internal_tasks (estabelecimento_id);

create table public.tarefa_itens (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  task_id uuid not null references public.internal_tasks(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 200),
  concluido boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index tarefa_itens_task_idx on public.tarefa_itens (task_id, ordem, created_at);
create index tarefa_itens_estabelecimento_idx on public.tarefa_itens (estabelecimento_id);

create table public.tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  task_id uuid not null references public.internal_tasks(id) on delete cascade,
  autor_id uuid references public.users(id) on delete set null,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  created_at timestamptz not null default now(),
  editado_em timestamptz
);
create index tarefa_comentarios_task_idx on public.tarefa_comentarios (task_id, created_at);
create index tarefa_comentarios_estabelecimento_idx on public.tarefa_comentarios (estabelecimento_id);

create table public.kanban_compartilhamentos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  destino text not null check (destino in ('negocio', 'pessoa')),
  user_id uuid references public.users(id) on delete cascade,
  permissao text not null check (permissao in ('ver', 'editar')),
  criado_por uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((destino = 'negocio' and user_id is null) or (destino = 'pessoa' and user_id is not null))
);
create unique index kanban_compart_negocio_uk on public.kanban_compartilhamentos (quadro_id) where destino = 'negocio';
create unique index kanban_compart_pessoa_uk on public.kanban_compartilhamentos (quadro_id, user_id) where destino = 'pessoa';
create index kanban_compart_user_idx on public.kanban_compartilhamentos (user_id) where user_id is not null;
create index kanban_compartilhamentos_estabelecimento_idx on public.kanban_compartilhamentos (estabelecimento_id);

create table public.kanban_grupos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null default public.usuario_atual_id() references public.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, nome),
  unique (id, user_id)
);
create index kanban_grupos_estabelecimento_idx on public.kanban_grupos (estabelecimento_id);

create table public.kanban_quadro_grupo (
  estabelecimento_id uuid not null default public.estabelecimento_atual() references public.estabelecimentos(id) on delete restrict,
  user_id uuid not null default public.usuario_atual_id() references public.users(id) on delete cascade,
  quadro_id uuid not null references public.kanban_quadros(id) on delete cascade,
  grupo_id uuid not null,
  primary key (user_id, quadro_id),
  foreign key (grupo_id, user_id) references public.kanban_grupos(id, user_id) on delete cascade
);
create index kanban_quadro_grupo_grupo_idx on public.kanban_quadro_grupo (grupo_id);
create index kanban_quadro_grupo_estabelecimento_idx on public.kanban_quadro_grupo (estabelecimento_id);

-- 2. Pessoa da sessão ---------------------------------------------------------
create or replace function public.kanban_usuario_atual()
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  v_id := public.usuario_atual_id();
  if v_id is null then raise exception 'Acesso ainda não liberado.'; end if;
  return v_id;
end; $$;

-- 3. Permissões ---------------------------------------------------------------
create or replace function public.kanban_permissao(p_quadro uuid)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := public.usuario_atual_id();
  v_escopo text; v_dono uuid; v_pessoa text; v_negocio text;
begin
  if v_eu is null then return null; end if;
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros
   where id = p_quadro and estabelecimento_id = public.estabelecimento_atual();
  if not found then return null; end if;
  if v_dono = v_eu then return 'editar'; end if;
  select permissao into v_pessoa from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'pessoa' and user_id = v_eu;
  if v_escopo = 'negocio' then
    if public.usuario_admin() then return 'editar'; end if;
    return coalesce(v_pessoa, 'editar');
  end if;
  select permissao into v_negocio from public.kanban_compartilhamentos
   where quadro_id = p_quadro and destino = 'negocio';
  if v_pessoa = 'editar' or v_negocio = 'editar' then return 'editar'; end if;
  return coalesce(v_pessoa, v_negocio);
end; $$;

create or replace function public.kanban_gerencia(p_quadro uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select q.dono_id = public.usuario_atual_id() or (q.escopo = 'negocio' and public.usuario_admin())
      from public.kanban_quadros q
     where q.id = p_quadro and q.estabelecimento_id = public.estabelecimento_atual()), false);
$$;

create or replace function public.kanban_pode_editar_coluna(p_coluna uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select public.kanban_permissao(c.quadro_id) = 'editar'
                     from public.kanban_colunas c where c.id = p_coluna), false);
$$;

create or replace function public.tarefa_visivel(p_responsavel uuid, p_envolvidos uuid[], p_criador uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.usuario_admin()
      or (public.usuario_atual_id() is not null and (
           p_responsavel = public.usuario_atual_id()
           or p_criador = public.usuario_atual_id()
           or public.usuario_atual_id() = any (coalesce(p_envolvidos, '{}'))));
$$;

create or replace function public.kanban_tarefa_visivel(p_coluna uuid, p_responsavel uuid, p_envolvidos uuid[], p_criador uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
             when public.kanban_permissao(q.id) is null then false
             when q.escopo = 'pessoal' or q.dono_id = public.usuario_atual_id() then true
             when exists (select 1 from public.kanban_compartilhamentos s
                           where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()) then true
             else public.tarefa_visivel(p_responsavel, p_envolvidos, p_criador)
           end
      from public.kanban_colunas c join public.kanban_quadros q on q.id = c.quadro_id
     where c.id = p_coluna), false);
$$;

-- 4. RLS ----------------------------------------------------------------------
alter table public.kanban_quadros enable row level security;
alter table public.kanban_colunas enable row level security;
alter table public.internal_tasks enable row level security;
alter table public.tarefa_itens enable row level security;
alter table public.tarefa_comentarios enable row level security;
alter table public.kanban_compartilhamentos enable row level security;
alter table public.kanban_grupos enable row level security;
alter table public.kanban_quadro_grupo enable row level security;

revoke all on public.kanban_quadros, public.kanban_colunas, public.internal_tasks, public.tarefa_itens,
  public.tarefa_comentarios, public.kanban_compartilhamentos, public.kanban_grupos, public.kanban_quadro_grupo from anon;
revoke insert, update, truncate on public.kanban_compartilhamentos from authenticated;

create policy "kanban_quadros: select" on public.kanban_quadros for select to authenticated
  using (public.kanban_permissao(id) is not null);
create policy "kanban_colunas: select" on public.kanban_colunas for select to authenticated
  using (public.kanban_permissao(quadro_id) is not null);

create policy "internal_tasks: select" on public.internal_tasks for select to authenticated
  using (public.kanban_tarefa_visivel(coluna_id, responsible_id, envolvidos, created_by));
create policy "internal_tasks: insert" on public.internal_tasks for insert to authenticated
  with check (public.usuario_ativo() and public.kanban_pode_editar_coluna(coluna_id));
create policy "internal_tasks: update" on public.internal_tasks for update to authenticated
  using (public.kanban_tarefa_visivel(coluna_id, responsible_id, envolvidos, created_by) and public.kanban_pode_editar_coluna(coluna_id))
  with check (public.kanban_pode_editar_coluna(coluna_id));
create policy "internal_tasks: delete" on public.internal_tasks for delete to authenticated
  using (public.kanban_pode_editar_coluna(coluna_id)
         and (public.usuario_admin() or created_by = public.usuario_atual_id()
              or exists (select 1 from public.kanban_colunas c join public.kanban_quadros q on q.id = c.quadro_id
                          where c.id = coluna_id and q.dono_id = public.usuario_atual_id())));

create policy "tarefa_itens: select" on public.tarefa_itens for select to authenticated
  using (exists (select 1 from public.internal_tasks t where t.id = task_id));
create policy "tarefa_itens: insert" on public.tarefa_itens for insert to authenticated
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));
create policy "tarefa_itens: update" on public.tarefa_itens for update to authenticated
  using (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)))
  with check (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));
create policy "tarefa_itens: delete" on public.tarefa_itens for delete to authenticated
  using (exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));

create policy "tarefa_comentarios: select" on public.tarefa_comentarios for select to authenticated
  using (exists (select 1 from public.internal_tasks t where t.id = task_id));
create policy "tarefa_comentarios: insert" on public.tarefa_comentarios for insert to authenticated
  with check (public.usuario_ativo()
              and exists (select 1 from public.internal_tasks t where t.id = task_id and public.kanban_pode_editar_coluna(t.coluna_id)));
create policy "tarefa_comentarios: update" on public.tarefa_comentarios for update to authenticated
  using (autor_id = public.usuario_atual_id()) with check (autor_id = public.usuario_atual_id());
create policy "tarefa_comentarios: delete" on public.tarefa_comentarios for delete to authenticated
  using (public.usuario_admin() or autor_id = public.usuario_atual_id());

create policy "kanban_compartilhamentos: select" on public.kanban_compartilhamentos for select to authenticated
  using (public.kanban_gerencia(quadro_id) or user_id = public.usuario_atual_id());
create policy "kanban_compartilhamentos: delete" on public.kanban_compartilhamentos for delete to authenticated
  using (public.usuario_ativo() and public.kanban_gerencia(quadro_id));

create policy "kanban_grupos: select" on public.kanban_grupos for select to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: insert" on public.kanban_grupos for insert to authenticated
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: update" on public.kanban_grupos for update to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id())
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_grupos: delete" on public.kanban_grupos for delete to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id());

create policy "kanban_quadro_grupo: select" on public.kanban_quadro_grupo for select to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id());
create policy "kanban_quadro_grupo: insert" on public.kanban_quadro_grupo for insert to authenticated
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id() and public.kanban_permissao(quadro_id) is not null);
create policy "kanban_quadro_grupo: update" on public.kanban_quadro_grupo for update to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id())
  with check (public.usuario_ativo() and user_id = public.usuario_atual_id() and public.kanban_permissao(quadro_id) is not null);
create policy "kanban_quadro_grupo: delete" on public.kanban_quadro_grupo for delete to authenticated
  using (public.usuario_ativo() and user_id = public.usuario_atual_id());

-- Multi-inquilino: repetir para as 8 tabelas
-- create policy "<tabela>: mesmo estabelecimento" on public.<tabela> as restrictive for all to authenticated
--   using (estabelecimento_id = (select public.estabelecimento_atual()))
--   with check (estabelecimento_id = (select public.estabelecimento_atual()));
-- create trigger a0_estabelecimento_guarda before insert or update or delete on public.<tabela>
--   for each row execute function public.estabelecimento_guarda();
-- create trigger a1_plano_trava_demonstracao before insert or update or delete on public.<tabela>
--   for each row execute function public.plano_trava_demonstracao();

-- 5. Gatilhos dos cartões e comentários ----------------------------------------
create or replace function public.internal_tasks_defaults()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('kanban_coluna:' || new.coluna_id::text));
    select coalesce(max(ordem), -1) + 1 into new.ordem from public.internal_tasks where coluna_id = new.coluna_id;
    new.created_by := public.usuario_atual_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end; $$;
create trigger internal_tasks_a_defaults before insert or update on public.internal_tasks
  for each row execute function public.internal_tasks_defaults();

create or replace function public.internal_tasks_envolvidos_validos()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.envolvidos := coalesce((select array_agg(distinct e) from unnest(new.envolvidos) e), '{}');
  if exists (select 1 from unnest(new.envolvidos) e where not exists (select 1 from public.users u where u.id = e)) then
    raise exception 'Envolvido inválido.';
  end if;
  return new;
end; $$;
create trigger internal_tasks_b_envolvidos before insert or update of envolvidos on public.internal_tasks
  for each row execute function public.internal_tasks_envolvidos_validos();

create or replace function public.internal_tasks_status_da_coluna()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_pos integer; v_min integer; v_max integer;
begin
  select c.posicao,
         (select min(posicao) from public.kanban_colunas where quadro_id = c.quadro_id),
         (select max(posicao) from public.kanban_colunas where quadro_id = c.quadro_id)
    into v_pos, v_min, v_max
    from public.kanban_colunas c where c.id = new.coluna_id;
  if v_pos is null then raise exception 'Coluna do kanban inválida.'; end if;
  new.status := case when v_pos = v_max then 'concluida' when v_pos = v_min then 'pendente' else 'em_andamento' end;
  if new.status = 'concluida' then
    if new.concluida_em is null then new.concluida_em := now(); end if;
  else
    new.concluida_em := null;
  end if;
  return new;
end; $$;
create trigger internal_tasks_c_status_da_coluna before insert or update of coluna_id, status, concluida_em on public.internal_tasks
  for each row execute function public.internal_tasks_status_da_coluna();

create or replace function public.tarefa_comentarios_autor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := public.usuario_atual_id(); new.created_at := now(); new.editado_em := null;
  else
    new.autor_id := old.autor_id; new.task_id := old.task_id; new.created_at := old.created_at; new.editado_em := now();
  end if;
  return new;
end; $$;
create trigger tarefa_comentarios_a_autor before insert or update on public.tarefa_comentarios
  for each row execute function public.tarefa_comentarios_autor();

create or replace function public.kanban_quadros_protege_unico()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.escopo = 'negocio' and (select count(*) from public.kanban_quadros
                                  where escopo = 'negocio' and estabelecimento_id = old.estabelecimento_id) <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de excluí-lo.';
  end if;
  return old;
end; $$;
create trigger kanban_quadros_protege_unico before delete on public.kanban_quadros
  for each row execute function public.kanban_quadros_protege_unico();

-- Opcional: plano Básico sem compartilhamento (trigger a2_plano_basico before insert em kanban_compartilhamentos)
-- e auditoria (after update / after delete em kanban_compartilhamentos).

-- 6. Funções de quadro ----------------------------------------------------------
create or replace function public.kanban_validar_quadro(p_nome text, p_colunas jsonb)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare v_nome text := btrim(coalesce(p_nome, '')); v_col jsonb; v_col_nome text;
begin
  if char_length(v_nome) not between 1 and 30 then raise exception 'O nome do quadro deve ter de 1 a 30 caracteres.'; end if;
  if p_colunas is null or jsonb_typeof(p_colunas) <> 'array' or jsonb_array_length(p_colunas) not between 2 and 10 then
    raise exception 'O quadro deve ter de 2 a 10 colunas.';
  end if;
  for v_col in select * from jsonb_array_elements(p_colunas) loop
    if jsonb_typeof(v_col) <> 'object' or exists (select 1 from jsonb_object_keys(v_col) k where k not in ('id', 'nome')) then
      raise exception 'Coluna inválida.';
    end if;
    v_col_nome := btrim(coalesce(v_col->>'nome', ''));
    if char_length(v_col_nome) not between 1 and 25 then raise exception 'O nome de cada coluna deve ter de 1 a 25 caracteres.'; end if;
  end loop;
  return v_nome;
end; $$;

create or replace function public.kanban_criar_quadro(p_nome text, p_colunas jsonb, p_escopo text default 'negocio')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nome text; v_quadro uuid; v_user uuid;
begin
  v_user := public.kanban_usuario_atual();
  v_nome := public.kanban_validar_quadro(p_nome, p_colunas);
  if p_escopo is null or p_escopo not in ('negocio', 'pessoal') then raise exception 'Tipo de quadro inválido.'; end if;
  if exists (select 1 from jsonb_array_elements(p_colunas) c where c ? 'id') then raise exception 'Coluna inválida.'; end if;
  insert into public.kanban_quadros (nome, created_by, escopo, dono_id)
  values (v_nome, v_user, p_escopo, case when p_escopo = 'pessoal' then v_user end)
  returning id into v_quadro;
  insert into public.kanban_colunas (quadro_id, nome, posicao)
  select v_quadro, btrim(c.value->>'nome'), c.ordinality::int from jsonb_array_elements(p_colunas) with ordinality c;
  return v_quadro;
end; $$;

create or replace function public.kanban_salvar_quadro(p_quadro uuid, p_nome text, p_colunas jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_nome text; v_atuais uuid[]; v_novos uuid[]; v_removidas uuid[]; v_primeira uuid; v_base integer; v_col record;
begin
  perform public.kanban_usuario_atual();
  v_nome := public.kanban_validar_quadro(p_nome, p_colunas);
  perform 1 from public.kanban_quadros where id = p_quadro for update;
  if not found or coalesce(public.kanban_permissao(p_quadro), '') <> 'editar' then
    raise exception 'Quadro não encontrado ou sem permissão para editar.';
  end if;

  select array_agg(id order by posicao) into v_atuais from public.kanban_colunas where quadro_id = p_quadro;
  select array_agg((c.value->>'id')::uuid order by c.ordinality) filter (where c.value ? 'id')
    into v_novos from jsonb_array_elements(p_colunas) with ordinality c;
  v_novos := coalesce(v_novos, '{}');
  if cardinality(v_novos) <> (select count(distinct x) from unnest(v_novos) x)
     or exists (select 1 from unnest(v_novos) x where x <> all (v_atuais)) then
    raise exception 'Coluna inválida.';
  end if;
  if (p_colunas->0->>'id')::uuid is distinct from v_atuais[1]
     or (p_colunas->-1->>'id')::uuid is distinct from v_atuais[cardinality(v_atuais)] then
    raise exception 'A primeira e a última coluna são fixas.';
  end if;

  v_primeira := v_atuais[1];
  select coalesce(array_agg(x), '{}') into v_removidas from unnest(v_atuais) x where x <> all (v_novos);
  if cardinality(v_removidas) > 0 then
    select coalesce(max(ordem), -1) + 1 into v_base from public.internal_tasks where coluna_id = v_primeira;
    update public.internal_tasks t set coluna_id = v_primeira, ordem = v_base + m.rn
      from (select it.id, row_number() over (order by c.posicao, it.ordem, it.created_at) - 1 as rn
              from public.internal_tasks it join public.kanban_colunas c on c.id = it.coluna_id
             where it.coluna_id = any (v_removidas)) m
     where t.id = m.id;
    delete from public.kanban_colunas where id = any (v_removidas);
  end if;

  for v_col in select c.value, c.ordinality::int as pos from jsonb_array_elements(p_colunas) with ordinality c loop
    if v_col.value ? 'id' then
      update public.kanban_colunas set nome = btrim(v_col.value->>'nome'), posicao = v_col.pos where id = (v_col.value->>'id')::uuid;
    else
      insert into public.kanban_colunas (quadro_id, nome, posicao) values (p_quadro, btrim(v_col.value->>'nome'), v_col.pos);
    end if;
  end loop;

  update public.kanban_quadros set nome = v_nome where id = p_quadro;
  update public.internal_tasks set coluna_id = coluna_id
   where coluna_id in (select id from public.kanban_colunas where quadro_id = p_quadro);
end; $$;

create or replace function public.kanban_excluir_quadro(p_quadro uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_eu uuid := public.kanban_usuario_atual(); v_escopo text; v_dono uuid; v_criador uuid;
begin
  select escopo, dono_id, created_by into v_escopo, v_dono, v_criador from public.kanban_quadros where id = p_quadro;
  if not found or public.kanban_permissao(p_quadro) is null then raise exception 'Quadro não encontrado.'; end if;
  if v_dono is distinct from v_eu
     and (v_escopo = 'pessoal' or (not public.usuario_admin() and v_criador is distinct from v_eu)) then
    raise exception 'Só quem é dono do quadro pode excluí-lo.';
  end if;
  delete from public.kanban_quadros where id = p_quadro;
end; $$;

create or replace function public.kanban_garantir_padrao()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kanban_usuario_atual();
  perform pg_advisory_xact_lock(hashtext('kanban_garantir_padrao' || coalesce(public.estabelecimento_atual()::text, '')));
  if not exists (select 1 from public.kanban_quadros where escopo = 'negocio' and estabelecimento_id = public.estabelecimento_atual()) then
    perform public.kanban_criar_quadro('Kanban Padrão', '[{"nome":"A Fazer"},{"nome":"Fazendo"},{"nome":"Concluído"}]'::jsonb, 'negocio');
  end if;
end; $$;

create or replace function public.kanban_reordenar(p_coluna uuid, p_ids uuid[])
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sessão expirada. Entre novamente.'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 500
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Lista de cartões inválida.';
  end if;
  if not exists (select 1 from public.kanban_colunas where id = p_coluna) then raise exception 'Coluna do kanban inválida.'; end if;
  if (select count(*) from public.internal_tasks where id = any (p_ids)) <> cardinality(p_ids) then raise exception 'Tarefa inválida.'; end if;
  update public.internal_tasks t set ordem = o.idx - 1, coluna_id = p_coluna
    from unnest(p_ids) with ordinality as o(id, idx)
   where t.id = o.id and (t.ordem is distinct from o.idx - 1 or t.coluna_id is distinct from p_coluna);
end; $$;

create or replace function public.kanban_quadros_visiveis()
returns table (id uuid, nome text, escopo text, dono_id uuid, dono_nome text, created_at timestamptz,
               permissao text, gerencia boolean, no_negocio boolean, no_pessoal boolean, compartilhado boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select q.id, q.nome, q.escopo, q.dono_id, coalesce(u.apelido, u.name), q.created_at,
         public.kanban_permissao(q.id), public.kanban_gerencia(q.id),
         q.escopo = 'negocio' or exists (select 1 from public.kanban_compartilhamentos s where s.quadro_id = q.id and s.destino = 'negocio'),
         coalesce(q.dono_id = public.usuario_atual_id(), false)
           or exists (select 1 from public.kanban_compartilhamentos s
                       where s.quadro_id = q.id and s.destino = 'pessoa' and s.user_id = public.usuario_atual_id()),
         exists (select 1 from public.kanban_compartilhamentos s where s.quadro_id = q.id)
    from public.kanban_quadros q left join public.users u on u.id = q.dono_id
   where public.usuario_ativo() and q.estabelecimento_id = public.estabelecimento_atual()
     and public.kanban_permissao(q.id) is not null
   order by q.created_at;
$$;

create or replace function public.kanban_compartilhar(p_quadro uuid, p_destino text, p_user uuid, p_permissao text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_eu uuid := public.kanban_usuario_atual(); v_escopo text; v_dono uuid; v_id uuid;
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then raise exception 'Só quem é dono do quadro pode compartilhá-lo.'; end if;
  if p_permissao is null or p_permissao not in ('ver', 'editar') then raise exception 'Permissão inválida.'; end if;
  if p_destino = 'negocio' then
    if v_escopo = 'negocio' then raise exception 'Este quadro já é do negócio.'; end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'negocio' returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, permissao, criado_por)
      values (p_quadro, 'negocio', p_permissao, v_eu) returning id into v_id;
    end if;
  elsif p_destino = 'pessoa' then
    if p_user is null or not exists (select 1 from public.users where id = p_user and active is true
                                       and estabelecimento_id = public.estabelecimento_atual()) then
      raise exception 'Escolha uma pessoa ativa da equipe.';
    end if;
    if v_escopo = 'pessoal' and p_user = v_dono then raise exception 'O quadro já é dessa pessoa.'; end if;
    update public.kanban_compartilhamentos set permissao = p_permissao
     where quadro_id = p_quadro and destino = 'pessoa' and user_id = p_user returning id into v_id;
    if v_id is null then
      insert into public.kanban_compartilhamentos (quadro_id, destino, user_id, permissao, criado_por)
      values (p_quadro, 'pessoa', p_user, p_permissao, v_eu) returning id into v_id;
    end if;
  else
    raise exception 'Destino inválido.';
  end if;
  return v_id;
end; $$;

create or replace function public.kanban_definir_visao(p_quadro uuid, p_visao text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := public.kanban_usuario_atual(); v_est uuid := public.estabelecimento_atual();
  v_escopo text; v_dono uuid; v_novo_escopo text; v_novo_dono uuid;
begin
  select escopo, dono_id into v_escopo, v_dono from public.kanban_quadros where id = p_quadro for update;
  if not found or not public.kanban_gerencia(p_quadro) then raise exception 'Só quem é dono do quadro pode mudar onde ele aparece.'; end if;
  if p_visao is null or p_visao not in ('negocio', 'pessoal', 'ambos') then raise exception 'Visualização inválida.'; end if;
  if p_visao = 'negocio' and not public.usuario_admin() then
    raise exception 'Só a administradora pode deixar um quadro apenas no negócio.';
  end if;
  v_novo_escopo := case when p_visao = 'pessoal' then 'pessoal' else 'negocio' end;
  v_novo_dono := case when p_visao = 'negocio' then null else coalesce(v_dono, v_eu) end;
  if v_escopo = 'negocio' and v_novo_escopo = 'pessoal'
     and (select count(*) from public.kanban_quadros where escopo = 'negocio' and estabelecimento_id = v_est) <= 1 then
    raise exception 'Este é o único quadro do negócio. Crie outro antes de tirá-lo do negócio.';
  end if;
  if v_novo_escopo = 'negocio'
     and exists (select 1 from public.kanban_compartilhamentos where quadro_id = p_quadro and destino = 'negocio') then
    raise exception 'Remova o compartilhamento com o negócio antes de mudar a visualização.';
  end if;
  update public.kanban_quadros set escopo = v_novo_escopo, dono_id = v_novo_dono where id = p_quadro;
end; $$;

-- 7. Execução -----------------------------------------------------------------
revoke all on function
  public.kanban_usuario_atual(), public.kanban_permissao(uuid), public.kanban_gerencia(uuid),
  public.kanban_pode_editar_coluna(uuid), public.tarefa_visivel(uuid, uuid[], uuid),
  public.kanban_tarefa_visivel(uuid, uuid, uuid[], uuid), public.kanban_validar_quadro(text, jsonb),
  public.kanban_criar_quadro(text, jsonb, text), public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid), public.kanban_garantir_padrao(), public.kanban_reordenar(uuid, uuid[]),
  public.kanban_quadros_visiveis(), public.kanban_compartilhar(uuid, text, uuid, text), public.kanban_definir_visao(uuid, text)
from public, anon;

grant execute on function
  public.kanban_usuario_atual(), public.kanban_permissao(uuid), public.kanban_gerencia(uuid),
  public.kanban_pode_editar_coluna(uuid), public.tarefa_visivel(uuid, uuid[], uuid),
  public.kanban_tarefa_visivel(uuid, uuid, uuid[], uuid),
  public.kanban_criar_quadro(text, jsonb, text), public.kanban_salvar_quadro(uuid, text, jsonb),
  public.kanban_excluir_quadro(uuid), public.kanban_garantir_padrao(), public.kanban_reordenar(uuid, uuid[]),
  public.kanban_quadros_visiveis(), public.kanban_compartilhar(uuid, text, uuid, text), public.kanban_definir_visao(uuid, text)
to authenticated;

revoke all on function
  public.internal_tasks_defaults(), public.internal_tasks_envolvidos_validos(),
  public.internal_tasks_status_da_coluna(), public.tarefa_comentarios_autor(), public.kanban_quadros_protege_unico()
from public, anon, authenticated;

commit;
```

Notas do consolidado em relação ao histórico de migrações do Jake Beauty:

1. `kanban_salvar_quadro` e `kanban_excluir_quadro` aqui são uma função só. No Jake Beauty existem as versões `_base` (sem execução para usuários) chamadas por invólucros, por limitação do conector usado na época.
2. `kanban_permissao`, `kanban_gerencia` e `kanban_quadros_visiveis` filtram pelo estabelecimento da sessão explicitamente; a política restritiva já garante isso, o filtro só deixa a intenção clara.
3. `kanban_compartilhar` confere que a pessoa é do mesmo estabelecimento; no Jake Beauty o gatilho de guarda faz essa recusa.
4. A janela "Equipe" do Kanban grava direto em `public.users`; no outro projeto, prefira a tela de equipe do próprio sistema.
5. `no_pessoal` usa `coalesce` para nunca voltar nulo em quadro sem dono (no Jake Beauty a tela trata o nulo como falso).
