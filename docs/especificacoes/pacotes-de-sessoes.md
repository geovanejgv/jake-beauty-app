# Especificação de implantação: pacotes de sessões

Versão 1.1, 2026-10-08. Status: **fase 1 implementada no código** (migração `supabase/migrations/20261013120000_pacotes.sql`, ainda **não aplicada em produção**). Fases 2 a 4: propostas.

## Decisões da administradora (2026-10-08)

| Tema | Decisão | Como ficou na fase 1 |
|---|---|---|
| Validade | 12 meses, renovável no sistema | Padrão de 12 meses na venda; `renovar_pacote` com motivo e extrato |
| Antecedência para cancelar | Não implementar | Cancelar o agendamento sempre libera a reserva |
| Taxa ao profissional na falta | Não implementar | Falta desconta a sessão, sem comissão para ninguém |
| Base da comissão | Percentual definido na venda, pago conforme a execução | `comissao_percentual` por serviço do pacote, aplicado ao valor da sessão no fechamento de quem executou |
| Reembolso | Não disponível | Sem fluxo de reembolso; "anular" só corrige venda lançada por engano, sem uso |
| Nota fiscal | Na venda | Faturamento do pacote no Resumo na data da venda; sessão abatida não conta de novo |
| Multa de desistência | Sem multa | Não há multa no sistema |

Fora da fase 1 (seguem como proposta): uso por terceiro e transferência (2.4), congelamento (2.2), intervalo mínimo entre sessões (M3), parcelamento com liberação proporcional (M4), estorno de baixa (M6, hoje basta voltar o status do atendimento), termo com hash (M7), rotina diária com alertas automáticos (a fase 1 calcula vencimento na leitura e destaca "vencem em 30 dias") e WhatsApp automático (fase 4).

Escopo: venda de pacotes, saldo de sessões, validade, falta (no-show), uso por terceiro, notificações e comissão na execução, integrados à agenda, ao checkout (PDV), ao fechamento de comissões assinado e às finanças que já existem.

Marcações usadas:
- **[Decidir]**: parâmetro de negócio que a administradora precisa escolher antes da implantação (há um valor sugerido).
- **[Confirmar]**: ponto jurídico ou fiscal que depende de conferência com advogado ou contador.

---

## 1. Diagnóstico do sistema atual

| Tema | Como está hoje | Impacto para pacotes |
|---|---|---|
| Comissão | Calculada no banco só no fechamento, a partir de atendimentos **concluídos** (`fechamento_candidatos`, `gerar_fechamento`), com base `valor_cobrado - taxa - material` x `%`. | O princípio "comissão na execução" **já vale** para atendimento avulso. Falta o valor da sessão de pacote entrar como `valor_cobrado` proporcional. |
| Caixa | O checkout (`src/pages/PDV.tsx`) só atualiza o agendamento (`status`, `payment_method`, `valor_cobrado`, `gorjeta`). A tabela `transactions` existe, mas está vazia. O faturamento do Resumo é derivado dos atendimentos concluídos. | Uma venda de pacote não é atendimento: hoje **não teria onde entrar no caixa**. É preciso um registro próprio de venda e de recebimento. |
| Falta | O status `no_show` existe (botão "Faltou" na Agenda) e não gera nenhum efeito financeiro. | Precisa consumir sessão (conforme a política) e permitir taxa ao profissional. |
| Notificação | WhatsApp por link `wa.me` aberto manualmente, com marca de "enviado" (`whatsapp_sent_at`). Não há e-mail transacional nem provedor de API. | O aviso automático exige provedor externo (custo, segredo, contrato LGPD). A fase 1 usa o mesmo link manual, com texto pronto. |
| Rotinas agendadas | Não existem. `pg_cron` está disponível no projeto, mas não instalado. | A expiração e os alertas de vencimento precisam de uma rotina diária. |
| Assinatura digital | Já existe para o fechamento (SHA-256, IP, momento, conta). | Pode ser reaproveitada para o termo de adesão do pacote e para a autorização de uso por terceiro. |

---

## 2. Análise das regras propostas

### 2.1 Comissão no momento da execução, não da venda
**Concordo, e é obrigatório.** Ajustes:
1. **Base da comissão = valor efetivamente recebido por sessão**, não o preço de tabela. A Lei 13.352/2016 manda reter a cota-parte do salão "dos valores recebidos por cada serviço prestado" pelo profissional-parceiro. Se o pacote dá 20% de desconto, a comissão incide sobre o valor com desconto. Sugestão: deixar configurável (proporcional, padrão; ou tabela, com o salão absorvendo o desconto), registrado no contrato de parceria. **[Decidir]** **[Confirmar]**
2. **Valor da sessão congelado na venda** (`valor_sessao = valor pago / sessões`), por item do pacote. Reajuste de preço depois da venda não muda o que já foi vendido.
3. **Pacote combinado** (ex.: 5 laser + 5 drenagem): o valor é rateado entre os itens pelo peso do preço de tabela de cada serviço; o arredondamento residual vai para a última sessão de cada item, para a soma fechar no centavo.
4. **Taxa de cartão**: é paga uma vez, na venda. Ela é rateada por sessão (`taxa_sessao`) e descontada da base da comissão na sessão, igual ao avulso.
5. **Comissão de venda (opcional):** muitos salões pagam um pequeno percentual a quem vendeu o pacote, separado da execução. Fica desligada por padrão. **[Decidir]**

### 2.2 Prazo de validade
**Concordo, com cuidados de consumo.**
- A validade precisa estar **clara antes da compra** (orçamento ou termo por escrito). O Procon orienta o consumidor a exigir orçamento escrito com prazo de validade em pacotes de beleza. Cláusula que coloque o consumidor em desvantagem exagerada é nula (CDC, art. 51). Por isso: prazo razoável e proporcional ao tratamento, aviso prévio e possibilidade de prorrogação ou de crédito. **[Confirmar]**
- Validade **por pacote**, com sugestão automática pela quantidade de sessões e pelo intervalo do serviço. Exemplo: laser com 10 sessões e intervalo de 30 dias exige pelo menos 10 meses; o sistema recusa validade menor que `sessões x intervalo mínimo`.
- **Congelamento** (gravidez, cirurgia, doença, viagem): suspende a contagem e prorroga a validade pelo período, com motivo e auditoria.
- **Expiração automática** diária. Alertas para a recepção em **30 e 15 dias** antes do vencimento e no dia seguinte à expiração. **[Decidir]**
- Sessões expiradas viram **receita reconhecida** do salão e **não geram comissão**, porque não houve execução.
- Expirou, mas a cliente reclamou: **reativação** pela administradora (novo prazo curto, motivo obrigatório, auditada).

### 2.3 Política de falta (no-show)
**Concordo, com uma política explícita em vez de "sempre consome".**
- Separar três situações:
  - **Cancelamento com antecedência** (padrão: 24 h): não consome.
  - **Cancelamento tardio** (menos de 24 h) e **falta sem aviso**: consome, conforme a política.
  - **Atraso acima da tolerância** (padrão: 15 min): a recepção decide entre atender no tempo restante ou registrar falta.
- **Primeira falta perdoada** (opcional): reduz atrito e reclamação no Procon. **[Decidir]**
- **Taxa ao profissional ocioso**: valor fixo ou percentual da comissão da sessão (padrão: 50% da comissão), sempre **aprovado caso a caso** pela administradora, que vê o histórico. A taxa entra no fechamento como item próprio ("Falta: remuneração mínima"), não como atendimento. **[Decidir]**
- A falta consumida sem taxa vira receita do salão. Com taxa, a diferença vira receita do salão.
- Avulso também conta: cliente com faltas recorrentes recebe uma marca na agenda e pode passar a ter pré-pagamento obrigatório. **[Decidir]**

### 2.4 Transferência e compartilhamento
**Concordo, com autorização prévia registrada e limite.**
- A titular cadastra **beneficiárias autorizadas** no pacote: cliente já cadastrada, com autorização registrada (quem autorizou, quando, por qual meio: presencial com assinatura, ou mensagem guardada).
- Opção "**qualquer pessoa autorizada no ato**", que exige confirmação da titular a cada uso. **[Decidir]**
- Beneficiária **menor de idade**: dados de criança e adolescente exigem consentimento específico de um dos pais ou responsável (LGPD, art. 14). Muitos procedimentos estéticos também têm restrição para menores. O sistema exige data de nascimento e marca o termo do responsável. **[Confirmar]**
- A beneficiária vê só o próprio atendimento. O saldo e o valor pago pertencem à titular.
- Mensagem de baixa vai **para a titular** (é ela quem acompanha o saldo) e, opcionalmente, para a beneficiária.
- **Transferência total** de saldo para outra cliente: só a administradora, com termo da titular.

### 2.5 Transparência e notificações
**Concordo, em duas fases.**
- **Fase 1 (sem custo, sem dependência nova):** ao dar baixa, o sistema monta a mensagem pronta e abre o WhatsApp da titular por link (`wa.me`), como já é feito com os lembretes. Registra quem enviou e quando. O comprovante da baixa fica no extrato do pacote, para mostrar na recepção.
- **Fase 2 (automático):** provedor oficial da API do WhatsApp (Meta Cloud API ou parceiro oficial) chamado por Edge Function, com modelos de mensagem aprovados pela Meta e custo por conversa. **[Confirmar]** Exige:
  - aprovação de dependência e segredo (DEP-01, DEV-07);
  - contrato de operador de dados (LGPD);
  - **consentimento (opt-in) da cliente para receber mensagens**.

  Não usar API não oficial (risco de bloqueio do número do salão).
- Modelo de mensagem: "Olá, {nome}. Hoje você utilizou 1 sessão de {serviço} do seu pacote {pacote}. Restam {saldo} sessões, válidas até {validade}. Dúvidas, é só responder."

---

## 3. Melhorias adicionais (visão de gestão e de engenharia)

| # | Melhoria | Por quê |
|---|---|---|
| M1 | **Reserva de saldo ao agendar**: `saldo disponível = contratadas - usadas - reservadas`. | Evita agendar 7 sessões futuras com 5 de saldo, o problema mais comum de recepção. |
| M2 | **Escolha automática do pacote que vence primeiro** quando a cliente tem mais de um do mesmo serviço. | Reduz expiração e reclamação. |
| M3 | **Intervalo mínimo entre sessões** por serviço (ex.: laser 30 dias). A agenda avisa e a administradora pode liberar. | Segurança do procedimento e resultado do tratamento. |
| M4 | **Pagamento parcelado e pagamento parcial**: venda com parcelas e registro de cada recebimento. Opção de liberar sessões só na proporção do valor pago. **[Decidir]** | Protege o caixa em vendas "no fiado" ou com entrada. |
| M5 | **Cancelamento e reembolso** com cálculo automático: valor pago - sessões usadas (pelo valor proporcional ou pelo de tabela, conforme o termo) - multa contratual. A administradora aprova. | O desconto de pacote não pode virar prejuízo na desistência. Multa e critério precisam estar no termo e ser razoáveis. **[Confirmar]** |
| M6 | **Estorno de baixa** (erro da recepção): só a administradora, com motivo; bloqueado se a sessão já estiver em fechamento assinado. | Erro de lançamento é rotina; corrigir sem mexer em pagamento já assinado. |
| M7 | **Termo de adesão** gerado do modelo (validade, falta, cancelamento, uso por terceiro), impresso ou em PDF, com aceite registrado. Reaproveita o hash SHA-256 do fechamento. | Prova da informação clara ao consumidor (CDC, art. 6º, III). |
| M8 | **Receita diferida (passivo de sessões)** visível no Resumo: total pago ainda não executado. | É dinheiro no caixa que ainda é dívida em serviço; sem ver isso a gestora superestima o lucro. |
| M9 | **Indicadores**: pacotes vendidos, ticket médio, taxa de uso, sessões a vencer em 30 dias, faltas por cliente e por profissional, receita de expiração. | Gestão de carteira e de retenção. |
| M10 | **Desligamento de profissional**: sessões futuras dela aparecem em lista para redistribuir. A comissão vai para quem executar, sem nenhum ajuste manual. | É o cenário que motivou a regra de comissão na execução. |
| M11 | **Concorrência e idempotência**: baixa com trava da linha do pacote e no máximo uma baixa por atendimento (restrição única). | Evita a mesma sessão debitada duas vezes por clique duplo ou duas telas abertas. |
| M12 | **Comissão da sessão congelada no momento da baixa** (percentual vigente do vínculo profissional x serviço). | Mudança posterior de percentual não altera o passado. |

---

## 4. Regras de negócio consolidadas

| ID | Regra |
|---|---|
| RN-01 | Pacote pertence a uma titular, tem 1 ou mais itens (serviço + quantidade de sessões) e uma validade (data). |
| RN-02 | Na venda, o valor total entra no caixa como **recebimento de venda de pacote** (por forma de pagamento e parcela) e como **receita diferida**. Não entra no faturamento de serviços nem gera comissão de execução. |
| RN-03 | Valor da sessão de cada item é congelado na venda: rateio do valor pago pelo peso do preço de tabela, arredondamento no último centavo. |
| RN-04 | Ao agendar com pacote, uma sessão do item é **reservada**. Cancelar o agendamento com antecedência libera a reserva. |
| RN-05 | Na conclusão, o checkout sugere por padrão "Abater do pacote {nome}" (o que vence primeiro). A baixa: debita 1 sessão, grava `valor_cobrado = valor_sessao`, `payment_method = 'pacote'` e o percentual de comissão vigente; reconhece a receita. |
| RN-06 | A comissão da sessão entra no fechamento do profissional **que executou**, pela mesma conta do avulso (base = valor da sessão - taxa rateada - material), em atendimento concluído. |
| RN-07 | Falta e cancelamento tardio seguem a política configurada: consome ou não; taxa ao profissional só com aprovação da administradora, como item próprio do fechamento. |
| RN-08 | Validade mínima sugerida = sessões x intervalo mínimo do serviço. Congelamento prorroga a validade pelo período. |
| RN-09 | Rotina diária: marca como expiradas as sessões não usadas após a validade (as reservadas para data futura também, e os agendamentos são sinalizados), reconhece a receita e gera alertas em D-30, D-15 e D+1. |
| RN-10 | Uso por terceiro só por beneficiária autorizada pela titular (autorização registrada). Menor de idade exige termo do responsável. |
| RN-11 | Estorno de baixa, reativação, transferência e reembolso: só a administradora, com motivo, auditados; bloqueados se afetarem fechamento assinado. |
| RN-12 | Toda baixa gera mensagem para a titular (fase 1 por link; fase 2 automática com opt-in). |
| RN-13 | Profissional vê o saldo de sessões da cliente que atende, sem ver o valor pago no pacote; vê o valor da sessão só nos próprios atendimentos e fechamentos. |

---

## 5. Modelo de dados (migração nova, RLS na mesma migração)

Todas as tabelas novas: RLS ligado, política por operação com `public.usuario_admin()` / `public.usuario_ativo()` / `public.usuario_atual_id()`; nenhuma `using (true)`; funções `security definer` com `set search_path = public, pg_temp`; `revoke` de `anon` (AUZ-04, regra 3 de `.claude/rules/seguranca.md`).

| Tabela | Colunas principais | Acesso |
|---|---|---|
| `pacotes_modelo` | id, nome, descricao, validade_dias, preco, ativo, termo_texto | select ativos; escrita admin |
| `pacotes_modelo_itens` | modelo_id, servico_id, sessoes | idem |
| `pacotes` (venda) | id, cliente_id (titular), modelo_id null, vendido_por, vendido_em, valor_total, desconto, validade, status (`ativo`, `congelado`, `expirado`, `quitado`, `cancelado`), congelado_ate, termo_hash, termo_aceite_em, termo_registrado_por, observacao | admin tudo; profissional: select só de clientes com atendimento dela (sem colunas de valor, via view) |
| `pacote_itens` | id, pacote_id, servico_id, sessoes_contratadas, valor_sessao, taxa_sessao, intervalo_min_dias | idem |
| `pacote_pagamentos` | id, pacote_id, forma, parcelas, valor, taxa_percentual, recebido_em, registrado_por | admin |
| `pacote_movimentos` (extrato, só inserção) | id, item_id, tipo (`reserva`, `liberacao`, `uso`, `falta`, `expiracao`, `estorno`, `reativacao`, `transferencia`), agendamento_id null, beneficiaria_id null, valor, comissao_percentual, motivo, autor_id, criado_em | select admin, titular via função, profissional nos próprios atendimentos; escrita só por funções |
| `pacote_beneficiarias` | pacote_id, cliente_id, autorizado_em, meio, registrado_por, termo_responsavel (bool) | admin; recepção via função |
| `politica_pacotes` (linha única) | antecedencia_cancelamento_h, tolerancia_atraso_min, falta_consome, primeira_falta_perdoada, taxa_falta_tipo (`fixo`/`percentual_comissao`), taxa_falta_valor, comissao_base (`proporcional`/`tabela`), comissao_venda_percentual, liberar_proporcional_ao_pago, alertas_dias (int[]) | select ativos; update admin |
| `notificacoes` | id, cliente_id, canal (`whatsapp_link`, `whatsapp_api`, `email`), modelo, conteudo, referencia, criado_por, enviado_em, status | admin e autora |

Alterações:
- `appointments`: `pacote_item_id uuid null`, `taxa_falta numeric null`, `taxa_falta_aprovada_por uuid null`; `payment_method` passa a aceitar `'pacote'`; restrição única parcial: uma baixa de uso por agendamento.
- `fechamento_candidatos`: inclui (a) concluídos com `payment_method = 'pacote'` usando `taxa_sessao` congelada; (b) faltas com `taxa_falta` aprovada, como item de tipo "taxa de falta". `fechamento_itens` ganha `tipo`.
- `clients`: `faltas_contagem` derivada (view) e `opt_in_mensagens`, `opt_in_em`.

Saldo **sempre calculado do extrato** (`contratadas - usos - faltas consumidas - expiradas + estornos + reativações`, e `reservadas` à parte), exposto por view `pacote_saldos`. Não há coluna de saldo editável.

---

## 6. Funções do banco (regra no banco, a tela só chama)

Todas com checagem de papel, trava de linha (`select ... for update` no pacote) e auditoria em `access_logs` (LOG-05):

| Função | Quem | O que faz |
|---|---|---|
| `vender_pacote(cliente, itens jsonb, valor_total, pagamentos jsonb, validade, beneficiarias jsonb)` | admin (e recepção, se houver o papel) | Valida a validade mínima (RN-08), rateia o valor (RN-03), grava a venda e os pagamentos, gera o termo e o hash. |
| `agendar_atendimento(..., p_pacote_item)` | ativos | Estende a função atual: confere saldo disponível, intervalo mínimo e titular ou beneficiária; grava a reserva. |
| `concluir_com_pacote(agendamento, item, beneficiaria)` | admin | Baixa idempotente (RN-05), libera a reserva, grava o uso e devolve o texto da mensagem. |
| `registrar_falta(agendamento, consumir, taxa)` | admin | Aplica a política (RN-07); a taxa fica pendente de aprovação se informada por outra pessoa. |
| `cancelar_agendamento(agendamento, motivo)` | ativos (nas regras atuais) | Libera ou consome conforme a antecedência. |
| `congelar_pacote`, `reativar_pacote`, `estornar_movimento`, `transferir_saldo`, `cancelar_pacote(reembolso)` | admin | RN-11; reembolso calculado pela função e aprovado. |
| `expirar_pacotes()` | rotina `pg_cron` diária (sem acesso por usuários) | RN-09; gera alertas em `notificacoes`. |
| `extrato_pacote(pacote)` | admin, titular (por link futuro), profissional (só saldo) | Extrato para a recepção e o comprovante. |

---

## 7. Telas e fluxo

1. **Venda (nova tela "Pacotes")**: escolher a cliente e o modelo (ou montar os itens). O sistema sugere a validade e mostra o valor por sessão e a economia frente ao avulso. Depois: pagamentos (forma e parcelas), beneficiárias autorizadas, termo para imprimir ou PDF, e confirmar o aceite.
2. **Agenda**: ao escolher a cliente e o serviço, mostra a etiqueta "Pacote {nome}: 3 sessões disponíveis, vence em 12/11". Avisa sobre o intervalo mínimo e sobre falta de saldo. A reserva é automática.
3. **Checkout (PDV)**: se houver saldo, a opção padrão é "Abater do pacote {nome}" (o que vence primeiro), com o seletor de quem usou (titular ou beneficiária). Valor e forma de pagamento ficam travados, a gorjeta continua livre. Depois da baixa, a tela mostra "Enviar comprovante por WhatsApp".
4. **Cliente**: aba "Pacotes" com saldo por item, validade, extrato, beneficiárias e o botão "Enviar extrato".
5. **Falta**: o botão "Faltou" abre a janela de política (consome ou não, taxa ao profissional, primeira falta).
6. **Pagamento de profissionais**: itens de sessão de pacote e de taxa de falta identificados no fechamento e no PDF.
7. **Resumo e Finanças**: separar **caixa** (vendas de pacote recebidas + avulsos) de **receita reconhecida** (avulsos + sessões executadas + expiradas). Mostrar o card "Sessões a executar (passivo)" e os indicadores M9.
8. **Configurações**: política de pacotes (seção 5, `politica_pacotes`).

---

## 8. Regras financeiras e contábeis

- **Caixa**: a venda entra no dia do recebimento, por forma de pagamento. O parcelado no cartão segue o recebimento real da maquininha (conciliação manual na fase 1).
- **Competência**: receita reconhecida na execução, na falta consumida ou na expiração.
- **Profissional-parceiro**: a cota-parte dela não compõe a receita bruta do salão (Lei 13.352/2016). O relatório separa a cota-parte do salão para o contador. **[Confirmar]**
- **Nota fiscal**: emissão na venda ou na execução depende do município (ISS) e do regime tributário. Ver com o contador antes da implantação. **[Confirmar]**

---

## 9. Segurança e LGPD (IDs de `docs/seguranca/requisitos.md`)

- AUZ-01/04/06/07: RLS por operação; papel e valores vêm do banco; botões escondidos também barrados no banco; profissional não vê o valor pago do pacote.
- VAL-07/VAL-09: saldo, rateio, reembolso e comissão calculados no banco com trava; a tela só mostra.
- LOG-05: venda, baixa, falta, estorno, reativação, transferência, reembolso e aprovação de taxa auditados.
- CRI/assinatura: termo e autorizações com hash SHA-256, reaproveitando o mecanismo do fechamento.
- LGPD: beneficiária e menor (art. 14) com base legal e termo; opt-in para mensagens; registro do tratamento em `docs/seguranca/lgpd-registro-tratamento.md`; contrato de operador do provedor de mensagens na fase 2. **[Confirmar]**
- DEP-01/DEV-07: a fase 1 não usa dependência nova. A fase 2 exige aprovação do provedor, com segredo só na Edge Function.
- DEV-02: migração, ativação do `pg_cron` e a rotina só em produção com aprovação e o SQL mostrado antes.
- TST-02: revisão humana obrigatória (pagamento e comissão).

---

## 10. Testes de aceite

Banco (`supabase/tests/`, Postgres local):
1. Venda de R$ 1.000 com 10 sessões: caixa +1.000, receita reconhecida 0, comissão 0.
2. Baixa: saldo 9, receita +100, item de fechamento com base 100 menos taxa rateada.
3. Profissional desligada depois da venda: as 9 sessões executadas por outra entram no fechamento da outra; a primeira não recebe nada além da sessão que executou.
4. Clique duplo na baixa: 1 movimento só.
5. Agendar além do saldo disponível (reservas): recusado.
6. Falta com taxa aprovada: item "taxa de falta" no fechamento; sem aprovação, não entra.
7. Expiração: saldo 0, status expirado, receita reconhecida, sem comissão; alertas D-30, D-15 e D+1 gerados uma vez só.
8. Congelamento de 30 dias: validade +30.
9. Beneficiária não autorizada: recusada; menor sem termo do responsável: recusada.
10. Estorno de sessão em fechamento assinado: recusado.
11. Profissional: não lê `pacote_pagamentos` nem o valor total; lê o saldo só de cliente com atendimento dela.
12. Rateio de pacote combinado: soma dos valores das sessões = valor pago, no centavo.

Tela (Playwright): etiqueta de saldo na agenda, opção padrão no checkout, link de WhatsApp com o texto certo, extrato na ficha da cliente.

---

## 11. Plano de implantação

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Decisões **[Decidir]** abaixo e conferências **[Confirmar]** com advogado e contador. | Administradora |
| 1 | Migração (tabelas, funções, RLS, testes), tela de venda, etiqueta na agenda, checkout com abatimento, fechamento com sessões, extrato, mensagem por link. | Aprovação da migração (DEV-02) |
| 2 | Política de falta com taxa aprovada, beneficiárias, congelamento, estorno, reembolso, termo com hash. | Fase 1 |
| 3 | `pg_cron` com expiração e alertas; card de passivo e indicadores no Resumo. | Aprovação da extensão e da rotina |
| 4 | WhatsApp automático (API oficial) e e-mail. | Provedor, custo, opt-in, contrato LGPD (DEP-01) |

Migração de dados: pacotes vendidos fora do sistema (caderno ou planilha) são lançados como venda com data e valor originais e saldo inicial por movimento de "ajuste inicial", com a validade original.

## 12. Decisões pendentes da administradora (valores sugeridos)

| Parâmetro | Sugestão |
|---|---|
| Validade padrão | 6 meses para até 6 sessões; 12 meses acima disso; nunca menor que sessões x intervalo |
| Antecedência para cancelar sem consumir | 24 h |
| Tolerância de atraso | 15 min |
| Falta consome sessão | Sim, com a primeira perdoada |
| Taxa ao profissional na falta | 50% da comissão da sessão, aprovada caso a caso |
| Base da comissão | Valor proporcional recebido (com cláusula no contrato de parceria) |
| Comissão de venda | Desligada |
| Liberar sessões proporcionalmente ao pago | Sim, para vendas com entrada |
| Reembolso na desistência | Valor pago - sessões usadas pelo valor proporcional - multa de 10% do saldo **[Confirmar]** |
| Alertas de vencimento | D-30, D-15 e D+1 |

## Referências

- [Lei 13.352/2016 (Senado)](https://legis.senado.leg.br/norma/602577/publicacao/15652949) e [publicação original (Câmara)](https://www2.camara.leg.br/legin/fed/lei/2016/lei-13352-27-outubro-2016-783851-publicacaooriginal-151331-pl.html): cota-parte sobre os valores recebidos por serviço; parte do profissional fora da receita bruta do salão.
- [Procon Campinas, cartilha da mulher](https://procon.campinas.sp.gov.br/sites/procon.campinas.sp.gov.br/files/arquivos-pesquisa/cartilha%20da%20mulher%202015-2-11.pdf): orçamento escrito com prazo de validade em pacotes.
- [MPMG/Procon-MG, decisão administrativa sobre cláusulas abusivas](https://mpmg.mp.br/data/files/70/11/03/53/C6BD091017A50CF8760849A8/DecAdm-CDC-Clausulas%20abusivas%20no%20contrato%20prestacao%20servicos-Book%20Play%20Comercio%20de%20Livros%20LTDA-14PJBH-17jun24.pdf): reembolso e alteração unilateral (CDC, art. 51).
