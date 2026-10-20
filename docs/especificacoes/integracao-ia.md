# Integração opcional com IA

Adaptação, a este portal (SPA Vite + React + Supabase), da especificação "integração com Inteligência Artificial" escrita para um projeto Next.js com servidor próprio. As regras de produto e de segurança foram mantidas; o que mudou por causa da arquitetura está na seção 2.

## 1. Visão geral

- **Opcional e por pessoa (opt-in):** cada pessoa da equipe (administradora ou profissional) cola a chave de API do próprio provedor em Configurações > Integração com IA. Sem configurar, nada muda: nenhuma tela depende da IA.
- **Provedores:** Anthropic (Claude), OpenAI (ChatGPT) e Google (Gemini), atrás da interface comum `AiProvider`.
- **Chave cifrada** (AES-256-GCM, subchave HKDF do segredo `IA_ENCRYPTION_KEY`, AAD = perfil + provedor), nunca legível pelo navegador.
- **Resultado sempre salvo** (`ai_generations`) com provedor e modelo, ligado à cliente ou ao lead; a autora edita a mensagem e marca como revisada.
- **Log só de metadados** (`ai_usage_logs`), cota de 40 usos por dia (00:00 de Brasília) e ritmo de 30 chamadas por hora por pessoa.
- **Proteção de dados:** o nome da cliente nunca vai ao provedor (vira `[CLIENTE]`); CPF, CNPJ, e-mail, telefone e CEP viram marcadores; todo dado vai dentro de `<dados>` como dado, nunca instrução; a saída JSON é validada campo a campo.

## 2. Adaptações a este projeto

| Na especificação de origem | Aqui | Motivo |
|---|---|---|
| Rotas `/api/ia/**` (Next.js) | Edge Function `supabase/functions/ia` com as ações `validar_chave`, `salvar_configuracao` e `gerar` | SPA sem servidor; só a função conhece o segredo de cifra |
| Listar, trocar de provedor, desativar, editar e excluir resultado por rota | Direto no banco pelo navegador, com RLS e privilégio por coluna | A fronteira do app é o RLS |
| SDKs `@anthropic-ai/sdk`, `openai`, `@google/genai` | `fetch` para a API HTTP oficial de cada provedor, destino fixo, sem redirecionamento, com tempo máximo | DEP-01: nenhuma dependência nova |
| Zod | Validadores fechados próprios (`nucleo/validacao.ts`, `nucleo/saida.ts`) | O projeto não usa Zod (DEP-01) |
| `node:crypto` | Web Crypto (mesma API no Deno e no Node dos testes) | Edge Function roda em Deno |
| Rate limit com Redis | Contagem em `ai_usage_logs` (última hora e dia) | Sem Redis; o log já é compartilhado |
| `escritorio_id` / `auth.uid()` | `estabelecimento_id` com política restritiva e gatilho de guarda; dono = `public.users.id` via `usuario_atual_id()` | Vários estabelecimentos; pessoa desativada perde o acesso na hora |
| Funcionalidades jurídicas (petição, publicação, contrato, planilha) | `triagem_lead` (modelo: triagem) e `resumo_cliente` | O que faz sentido num salão |
| Anexos (PDF, imagem) | Não usados | Nenhuma funcionalidade precisa |

## 3. Arquivos

```
supabase/functions/ia/index.ts                Deno.serve: CORS, sessão, perfil e estabelecimento do banco, ações
supabase/functions/ia/nucleo/                 lógica pura (testada no Vitest e checada por tsconfig.ia.json)
  tipos.ts                                    AiProvider, códigos de erro, mensagens públicas, status HTTP, tempos
  catalogo.ts                                 nome, passo a passo e modelos sugeridos (a tela importa este arquivo)
  cifra.ts                                    AES-256-GCM + HKDF + AAD
  provedores/http.ts | anthropic.ts | openai.ts | google.ts   únicos que falam com a API dos provedores
  adaptadores.ts                              provedor salvo -> adaptador
  prompt.ts | saida.ts | validacao.ts         regras fixas, <dados>, pseudonimização; JSON estrito; entradas
  funcionalidades/                            registro: triagem-lead.ts, resumo-cliente.ts, index.ts
  servico.ts                                  cota, ritmo, execução, gravação, validação e configuração
  banco.ts                                    supabase-js: leituras com o JWT da pessoa; chave de serviço só onde o navegador não pode
src/features/ia/                              api.ts, useIa.ts, PainelIa.tsx, IntegracaoIa.tsx, TriagemLeadIa.tsx, ResumoClienteIa.tsx
supabase/migrations/20261028120000_integracao_ia.sql
supabase/tests/seguranca/ia.test.sql, tests/ia/*.test.ts
```

Nova funcionalidade: um arquivo em `nucleo/funcionalidades/`, uma linha em `index.ts`, o id na restrição `ai_generations.funcionalidade` (migração) e o painel na tela.

## 4. Parâmetros

| Item | Valor |
|---|---|
| Cota por pessoa | 40 usos por dia (validação de chave não conta) |
| Ritmo | 30 chamadas por hora por pessoa (inclui validação) |
| Tempo por chamada | 55 s, sem nova tentativa; validação 15 s com 1 nova tentativa em falha de rede |
| Corpo da requisição | até 20 KB |
| Chave colada | 20 a 400 caracteres, `^[A-Za-z0-9_\-.:]+$` |
| Modelo | 1 a 120 caracteres, `^[A-Za-z0-9._:\-/]+$` (Gemini: sem `/`) |
| Conteúdo salvo | até 200.000 caracteres; parâmetros até 16 KB |
| Modelos listados | até 300 |

Os modelos não são fixos: a lista vem da conta da pessoa quando a chave é validada; o catálogo só ordena e rotula (nomes conferidos em 2026-10-20 [Confirmar a cada atualização]).

## 5. Funcionalidades

| id | Onde | Entrada | Saída (JSON estrito) | maxTokens / esforço |
|---|---|---|---|---|
| `triagem_lead` | Leads, ao editar um lead (só administradora, pelo RLS) | `lead_id`, `observacao` opcional (até 2000) | `resumo`, `temperatura` (fria/morna/quente), `motivo_temperatura`, `servicos_de_interesse[]`, `perguntas_pendentes[]`, `alertas[]`, `proximo_passo`, `mensagem_whatsapp` | 8000 / low |
| `resumo_cliente` | Clientes, aba "IA" do histórico (quem ativou a IA) | `client_id` | `resumo`, `preferencias[]`, `cuidados[]`, `frequencia_media_dias` (inteiro ou nulo), `sugestao_retorno`, `servicos_sugeridos[]`, `mensagem_whatsapp` | 8000 / low |

Contexto do resumo: até 40 atendimentos e 40 anotações do histórico técnico, observações do cadastro e nomes dos serviços ativos, sempre como a pessoa logada vê (a profissional só os próprios atendimentos e as observações que a permissão libera).

A mensagem sugerida é editável, pode ser copiada ou aberta no WhatsApp; enviar é sempre um clique da pessoa (LLM-03).

## 6. Códigos de erro

Mesma tabela da origem (mensagem pública, nunca a do provedor), mais `ritmo` (429) e `nao_encontrado` (404). `ia_nao_configurada` responde 200 com `ok: false`. Na validação e na falha de geração, a tela mostra só o diagnóstico seguro "Status 401 | authentication_error".

## 7. Configuração e fluxo

1. Escolher o provedor; a tela mostra o passo a passo e o link para gerar a chave.
2. Colar a chave e validar (`validar_chave`: Anthropic faz uma chamada mínima com `claude-haiku-5-5` e lista os modelos; OpenAI e Google listam os modelos). Nada é salvo.
3. Escolher o modelo e, na primeira ativação do provedor, marcar o consentimento LGPD.
4. `salvar_configuracao`: valida de novo, confere o modelo na lista da conta, cifra, desativa o provedor anterior e grava `consentimento_em`.
5. Trocar de provedor (desativa; a chave fica guardada) e Desativar totalmente (apaga as chaves) são feitos direto no banco, pelo RLS.
6. Chamada real com 401 marca `status_chave = 'invalida'` e os símbolos de IA somem até nova validação.

## 8. Implantação

1. Aplicar a migração.
2. Criar o segredo `IA_ENCRYPTION_KEY` (32+ caracteres aleatórios) nas Edge Functions do Supabase (pendencias-humanas.md item 50).
3. Publicar a função: `supabase functions deploy ia` (verificação de JWT ligada).

Sem o segredo, a função responde 503 com aviso e o resto do portal segue normal.
