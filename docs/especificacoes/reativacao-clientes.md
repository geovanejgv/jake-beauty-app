# Reativação de clientes, fichas e termos (especificação recebida em 2026-10-29)

## Situação no projeto

| Fase | Entrega | Situação |
| --- | --- | --- |
| 1 | Histórico de atendimentos (filtros e totais) e "Clientes para reativar" pelo ciclo de retorno | Implementada: `src/pages/Historico.tsx`, `src/features/historico/`, função `clientes_reativacao()` (`20261101120000_historico_reativacao.sql`) |
| 2 | Modelos de mensagem, convite assistido por WhatsApp, registro de envio e resultado, "não quer contato", indicadores | Implementada: `src/features/historico/convites.ts`, `ConvitesUi.tsx`, tabelas `mensagem_modelos` e `contatos_reativacao` (`20261102120000_reativacao_convites.sql`). Modelos ficam em Histórico e Reativação > Mensagens; a trava de 15 dias é fixa por enquanto |
| 3 | Lembretes de contato na agenda e pendências do dia | Implementada: tabela `lembretes_contato` (`20261103120000_lembretes_contato.sql`), `src/features/historico/lembretes.ts` e `LembretesUi.tsx`; faixa na Agenda, contador no Resumo Diário; o convite registrado conclui o lembrete |
| 4 | Anamnese com validade e alertas no agendamento | Em parte: fichas assinadas no celular (`docs/especificacoes/fichas-anamnese.md`); faltam aba na ficha da cliente, validade e alertas no agendamento |
| 5 | Termos por procedimento | Em parte: termo assinado com procedimento e valor; falta "exige termo" no serviço e aviso no agendamento |
| 6 | WhatsApp Business API | Opcional, depende de conta Meta (humano) |

Adaptações: `servicos.retorno_dias` já existia e é o ciclo; o PDF segue pela impressão do navegador (sem bucket nem biblioteca nova, DEP-01), com o hash SHA-256 do conteúdo assinado no lugar do hash do PDF.

---

## 0. Pedido original e o que muda com a análise

Pedido:
1. Na ficha da cliente, mostrar as fichas de **anamnese** e os **termos assinados digitalmente**, com visualizar e baixar.
2. Aba **Histórico de atendimentos** com filtros semelhantes aos do relatório de comissões.
3. Mensagem de WhatsApp para a cliente, com a data do último serviço e convite para voltar. A mensagem padrão é editável, e o sistema registra a data do último envio e se houve resposta.
4. Agendar um lembrete de quando mandar a mensagem, que também aparece na agenda.

O que a análise altera:

| Ponto | Proposta original | Ajuste do especialista | Motivo |
|---|---|---|---|
| Momento do convite | Data do último serviço | **Ciclo de retorno por serviço** (ex.: coloração 30 a 45 dias, manicure 15, sobrancelha 21, progressiva 90) | Convidar cedo demais irrita, e tarde demais a cliente já foi para a concorrência. O ciclo diz quando ela "deveria" voltar. |
| Quem recebe | Qualquer cliente atendida | Lista filtrada: **retorno vencido, sem agendamento futuro, sem mensagem recente, sem recusa de contato** | Evita mandar convite para quem já está agendada ou acabou de receber mensagem. |
| "Mensagem automática" | Envio automático | **Fase 1: envio assistido** (um clique abre o WhatsApp com o texto pronto). **Fase 2 (opcional): WhatsApp Business API oficial** | Envio automático de verdade exige a API oficial da Meta, com modelo aprovado, custo por conversa e consentimento. Automação não oficial (robôs no WhatsApp Web) leva a bloqueio do número. |
| "Se teve resposta" | Registro automático | **Fase 1: marcação manual** em um clique (respondeu, agendou, sem resposta, não quer contato). **Fase 2:** detecção automática pela API | Pelo link do WhatsApp o sistema não sabe se a cliente respondeu. |
| Resultado | Só "respondeu" | Medir **reativação**: agendamento em até 30 dias depois do convite | O objetivo é a cliente voltar, não só responder. |
| Lembrete | Lembrete solto na agenda | Lembrete de **contato** (não ocupa horário de profissional), com botão "Enviar agora" | Integra o fluxo e não bagunça a agenda de atendimento. |
| Anamnese | Ficha fixa | Ficha **com validade** (renovar a cada 12 meses ou quando a saúde mudar) e **alertas visíveis no agendamento** (alergia, gestante, medicamentos) | Segurança da cliente e proteção da clínica em procedimento químico ou estético. |
| Termos | Termo genérico | **Termo por procedimento**, ligado ao atendimento | O consentimento vale para o procedimento específico (química, laser, micropigmentação, peeling). |

---

## 1. Ficha da cliente: anamnese e termos assinados

### 1.1 Nova aba "Fichas e termos" no modal da cliente
Ao lado de Atendimentos, Histórico técnico e Pacotes.

Seções:
1. **Anamnese vigente**
   - Data, validade e situação: "Vigente", "Vence em X dias" ou "Vencida".
   - Alertas em destaque: alergias, gestante ou lactante, medicamentos de uso contínuo, problemas de pele ou couro cabeludo, procedimentos recentes.
   - Botões: **Visualizar** (abre o PDF ou a ficha na tela), **Baixar PDF**, **Nova anamnese** e **Enviar para a cliente preencher**.
2. **Histórico de anamneses**: versões anteriores, só leitura, com visualizar e baixar.
3. **Termos assinados**
   - Lista com procedimento, data, profissional, situação ("Assinado", "Aguardando assinatura", "Cancelado") e forma de assinatura.
   - Botões: **Visualizar**, **Baixar PDF assinado**, **Reenviar link** (se pendente) e **Novo termo**.

### 1.2 Modelos editáveis (Configurações > Fichas e termos)
- Modelo de anamnese, com perguntas configuráveis:
  - tipos: sim/não, texto, múltipla escolha;
  - marcação "gera alerta" quando a resposta pede atenção;
  - validade em meses (padrão 12).
- Modelos de termo de consentimento por categoria de procedimento, com variáveis `{nome}`, `{cpf}`, `{procedimento}`, `{profissional}`, `{data}`, `{valor}` e campos de riscos e cuidados pós-procedimento.

### 1.3 Assinatura digital
Duas opções. Use a que o projeto já tiver; se não tiver nenhuma, comece pela A.
- **A. Assinatura no próprio sistema (sem custo)**
  - A cliente recebe um link, lê, desenha a assinatura na tela e marca "Li e concordo".
  - O sistema grava data e hora, IP, navegador e o **hash SHA-256 do PDF final**.
  - Gera um PDF com a página de registro da assinatura.
  - Validade: assinatura eletrônica simples ou avançada (Lei 14.063/2020), suficiente para consentimento de procedimento estético na maioria dos casos.
- **B. Integração com a ZapSign:** seguir o guia `guia-integracao-zapsign.md` (conta própria, webhook, PDF assinado guardado no sistema).

Nas duas opções:
- o PDF fica em armazenamento **privado**;
- o download sai por URL assinada de curta duração;
- só equipe autorizada vê.

### 1.4 Integração com o agendamento
- Ao agendar ou iniciar um atendimento de serviço que **exige termo** (marcação no cadastro do serviço), o sistema avisa quando não há termo assinado para esse procedimento e oferece "Enviar termo agora".
- Os alertas da anamnese aparecem no card do agendamento e na tela do atendimento (ícone de atenção), visíveis para a profissional.
- Anamnese vencida ou ausente: aviso, sem bloquear o atendimento (a decisão fica com a clínica, por configuração).

### 1.5 LGPD (obrigatório)
- Anamnese tem **dado de saúde, que é dado sensível** (art. 11 da LGPD):
  - pedir consentimento específico na própria ficha;
  - acesso restrito às profissionais e à administração (não à recepção, se houver essa separação de papéis);
  - registrar quem visualizou e baixou (auditoria).
- Definir o prazo de guarda (sugestão: enquanto a cliente estiver ativa, mais 5 anos) e permitir exportação ou exclusão a pedido da titular.

---

## 2. Aba "Histórico de atendimentos"

### 2.1 Lista
Todos os atendimentos realizados, com:
- data;
- cliente;
- serviço;
- categoria;
- profissional;
- valor;
- forma de pagamento;
- situação (realizado, cancelado, faltou);
- pacote (se houver).

### 2.2 Filtros (mesmos do relatório de comissões, mais os de reativação)
- Período (atalhos: hoje, 7 dias, mês, mês anterior, personalizado).
- Profissional, serviço, categoria do serviço, situação do atendimento, forma de pagamento.
- Cliente (busca por nome ou telefone).
- **[ajuste do especialista]** Filtros de relacionamento:
  - "Situação de retorno": Em dia, Retorno próximo (7 dias), Retorno vencido, Inativa (mais de 90 dias), Perdida (mais de 180 dias). Os limites são configuráveis.
  - "Sem agendamento futuro".
  - "Última mensagem há mais de X dias" e "Nunca recebeu convite".
  - "Não quer contato" (para excluir).

### 2.3 Duas visões na mesma aba
1. **Atendimentos:** uma linha por atendimento, para conferência e totais (quantidade, faturamento, ticket médio).
2. **Clientes para reativar** (visão principal do fluxo), uma linha por cliente:

| Coluna | Conteúdo |
|---|---|
| Cliente | Nome e telefone |
| Último serviço | Serviço, data e profissional |
| Retorno previsto | Data pelo ciclo do serviço e quantos dias de atraso |
| Frequência | Visitas nos últimos 12 meses e intervalo médio |
| Valor | Ticket médio e total gasto em 12 meses (para priorizar) |
| Último convite | Data, quem enviou e resultado |
| Próximo lembrete | Data agendada |
| Ações | **Enviar convite**, **Registrar resultado**, **Agendar lembrete**, **Abrir ficha** |

Ordenação padrão: retorno vencido, depois maior valor, depois mais dias sem vir.

### 2.4 Indicadores no topo
- Clientes ativas, em retorno vencido, inativas e perdidas.
- Convites enviados no período, taxa de resposta e **taxa de reativação** (agendou em até 30 dias depois do convite).
- **Faturamento reativado:** soma dos atendimentos de clientes reativadas.

---

## 3. Convite por WhatsApp

### 3.1 Mensagem padrão editável (Configurações > Mensagens de reativação)
- Vários modelos (ex.: "Retorno de coloração", "Saudade", "Aniversário", "Promoção do mês"), com um padrão marcado.
- Variáveis:
  - `{primeiro_nome}`;
  - `{ultimo_servico}`, `{data_ultimo_servico}`, `{dias_desde}`;
  - `{profissional}`, `{nome_clinica}`, `{link_agendamento}`.
- Prévia com dados de exemplo antes de salvar.
- Modelo sugerido (tom humano, sem pressão):
  > Oi, {primeiro_nome}! Tudo bem? Aqui é da {nome_clinica}. Seu último {ultimo_servico} foi em {data_ultimo_servico}, e já está chegando a hora de renovar. Quer que eu reserve um horário com a {profissional} para você? Se preferir, escolha por aqui: {link_agendamento}
- **[ajuste do especialista]** Evitar `{dias_desde}` no texto padrão: lembrar que "faz 97 dias" soa como cobrança. Prefira "já está na hora de renovar".

### 3.2 Envio (fase 1: assistido, sem custo)
1. Botão **Enviar convite** na lista ou na ficha. Abre uma janela com o modelo escolhido já preenchido e editável só para aquele envio.
2. **Abrir WhatsApp** abre `https://wa.me/55DDDNUMERO?text=<mensagem codificada>`: no celular abre o app; no computador, o WhatsApp Web.
3. Ao clicar, o sistema **registra o envio**: cliente, data e hora, quem enviou, modelo e texto final.
4. **Envio em sequência:** um botão "Enviar para a próxima" percorre a lista filtrada, uma de cada vez.
5. Travas:
   - não abre o envio se a cliente marcou "não quer contato";
   - avisa quando já houve convite há menos de 15 dias (configurável) ou quando há agendamento futuro;
   - telefone inválido mostra aviso para corrigir o cadastro.

### 3.3 Resultado do convite
- Na linha da cliente e no histórico de contatos, um clique registra: **Respondeu**, **Agendou** (vincula ao agendamento), **Sem resposta**, **Não quer contato** (bloqueia convites futuros) ou **Número errado**.
- **Automático:** se a cliente tiver um agendamento criado em até 30 dias depois do convite, o resultado vira "Agendou" sozinho e conta como reativação.
- "Sem resposta" pode ser marcado em lote para convites com mais de 7 dias sem retorno.

### 3.4 Fase 2 (opcional): WhatsApp Business API oficial
- Só se a clínica quiser envio realmente automático e detecção de resposta sem marcação manual.
- Exige:
  - conta Meta Business verificada;
  - número dedicado;
  - modelos de mensagem aprovados pela Meta;
  - custo por conversa iniciada pela empresa;
  - opt-in registrado da cliente.
- O sistema envia pelo modelo aprovado, recebe pelo webhook as respostas e a confirmação de leitura, e marca "Respondeu" sozinho.
- **Não usar** automação não oficial (extensões ou robôs no WhatsApp Web): o risco de banimento do número é alto.

### 3.5 LGPD do contato
- Base: legítimo interesse, para cliente que já foi atendida, com **opção de sair** sempre respeitada ("não quer contato" bloqueia).
- Guardar o texto enviado e a data (prova do contato), sem copiar conversas do WhatsApp para o sistema.

---

## 4. Lembretes de contato na agenda

- Em **Agendar lembrete** (na lista, na ficha ou depois de registrar "Sem resposta"):
  - data;
  - opcionalmente hora e responsável;
  - modelo de mensagem;
  - observação.
- **Sugestão automática:** a data do retorno previsto pelo ciclo do serviço, ou "+15 dias" depois de um convite sem resposta.
- Na **agenda**:
  - aparece como **lembrete de contato**, com cor e ícone próprios;
  - fica em faixa separada no topo do dia, **sem ocupar horário de profissional**;
  - filtro para mostrar ou esconder lembretes.
- Ao abrir o lembrete:
  - **Enviar agora** abre o convite já preenchido;
  - depois do envio, o lembrete fica concluído sozinho;
  - também dá para adiar (+3, +7, +15 dias) ou cancelar.
- **Pendências do dia:** contador "X contatos para hoje" no painel inicial.

---

## 5. Ciclo de retorno por serviço [ajuste do especialista]

- Campo novo no cadastro de serviço: **"Retorno recomendado (dias)"**.
- Sugestões iniciais (a clínica ajusta):

| Serviço | Retorno (dias) |
|---|---|
| Manicure e pedicure | 15 |
| Design de sobrancelha | 21 |
| Coloração e retoque de raiz | 35 |
| Corte feminino | 60 |
| Escova progressiva ou selagem | 90 |
| Limpeza de pele | 30 |
| Depilação | 30 |

- Retorno previsto da cliente: a **menor** data entre os ciclos dos serviços feitos no último atendimento.
- Sem ciclo cadastrado: usar o intervalo médio da própria cliente; sem histórico, 45 dias.

---

## 6. Modelo de dados sugerido (adaptar aos nomes do projeto)

| Tabela | Campos principais |
|---|---|
| `anamnese_modelos` | id, conta, perguntas (JSON com tipo, texto, gera_alerta), validade_meses, ativo |
| `anamneses` | id, conta, cliente, modelo, respostas (JSON), alertas (texto resumido), preenchida_em, valida_ate, assinatura_id, pdf_path, pdf_sha256, criada_por |
| `termo_modelos` | id, conta, categoria/serviço, título, conteúdo com variáveis, ativo |
| `termos` | id, conta, cliente, atendimento (opcional), serviço, modelo, conteúdo final, status (pendente, assinado, cancelado), assinado_em, ip, user_agent, pdf_path, pdf_sha256, forma (sistema ou ZapSign) |
| `servicos` (campo novo) | retorno_dias, exige_termo |
| `mensagem_modelos` | id, conta, nome, texto, padrão |
| `contatos_reativacao` | id, conta, cliente, enviado_em, enviado_por, canal (whatsapp_link ou whatsapp_api), modelo, texto_enviado, resultado (enviado, respondeu, agendou, sem_resposta, nao_quer, numero_errado), resultado_em, agendamento_id |
| `clientes` (campos novos) | nao_quer_contato (bool), nao_quer_contato_em |
| `lembretes_contato` | id, conta, cliente, data, hora (opcional), responsável, modelo, observação, status (pendente, concluído, adiado, cancelado), contato_id (gerado ao concluir) |

Regras de banco:
- isolamento por conta (RLS ou filtro obrigatório em toda consulta);
- anamnese e termo só para os papéis autorizados;
- auditoria de visualização e download de anamnese e termo;
- PDFs em armazenamento privado.

---

## 7. Fases de implementação

| Fase | Entrega | Por quê primeiro |
|---|---|---|
| 1 | Aba Histórico de atendimentos (lista, filtros, totais) e a visão "Clientes para reativar" com ciclo de retorno por serviço | Base de todo o fluxo; já mostra quem precisa voltar |
| 2 | Modelos de mensagem, convite assistido por WhatsApp, registro de envio e resultado, "não quer contato" e indicadores | Começa a gerar retorno de clientes, sem custo |
| 3 | Lembretes de contato na agenda e pendências do dia | Rotina diária da recepção |
| 4 | Anamnese com modelo editável, validade, alertas no agendamento, PDF, visualizar e baixar | Segurança e proteção da clínica |
| 5 | Termos por procedimento com assinatura digital (no sistema ou ZapSign), aviso no agendamento | Fecha a parte documental |
| 6 (opcional) | WhatsApp Business API oficial | Só se o volume justificar o custo |

Cada fase com migração aditiva, testes (filtros, regras de trava, permissões, isolamento entre contas), PR próprio e roteiro de teste manual.

---

## 8. Critérios de aceite principais

1. A ficha da cliente mostra a anamnese vigente com alertas, o histórico e os termos, e visualizar e baixar funcionam só para os papéis permitidos.
2. Os filtros do histórico batem com os totais do relatório de comissões no mesmo período.
3. A lista "Clientes para reativar" não traz quem tem agendamento futuro nem quem marcou "não quer contato".
4. Enviar convite abre o WhatsApp com o texto certo e grava data, autor e texto. A ficha mostra "Último convite: dd/mm, resultado".
5. Um agendamento criado até 30 dias depois do convite marca "Agendou" sozinho e entra na taxa de reativação.
6. O lembrete aparece na agenda sem ocupar horário de profissional. "Enviar agora" conclui o lembrete.
7. A trava de 15 dias avisa antes de um segundo convite.
8. Os alertas da anamnese aparecem no card do agendamento.
