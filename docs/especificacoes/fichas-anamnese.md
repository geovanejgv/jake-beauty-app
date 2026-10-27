# Fichas de anamnese, fotodepilação e termo de consentimento

Situação: implementado no código; migração `supabase/migrations/20261031120000_fichas_anamnese.sql` **não aplicada** em produção (pendencias-humanas.md, item 58).

## Objetivo

Trocar as fichas em papel (anamnese, fotodepilação laser/IPL e termo de responsabilidade) por documentos que a cliente preenche e assina na tela do celular, com prova de quando, de onde e do que foi assinado.

## Fluxo

1. A equipe abre **Fichas e Termos**, escolhe o documento e a cliente. No termo, preenche procedimento, valor, forma de pagamento e cuidados (a cliente só lê).
2. O app gera um link pessoal (`/ficha#<token>`), válido por 72 horas e de uso único. Envio pelo WhatsApp, cópia do link ou "Abrir aqui" no aparelho do salão.
3. A cliente responde, assina com o dedo e envia. Menor de 18 anos: o responsável legal informa nome, CPF e parentesco e assina junto.
4. O banco valida tudo de novo, grava as respostas, as assinaturas, data, IP, dispositivo e o hash SHA-256 do conteúdo, e invalida o link.
5. A equipe vê a ficha com o quadro **Atenção antes do procedimento** (respostas de risco) e salva em PDF pelo navegador.

## Decisões técnicas

| Pedido original | Decisão | Motivo |
| --- | --- | --- |
| Campos em JSON no banco | Mantido: `fichas.campos` guarda o modelo copiado na criação; `fichas.respostas` e `fichas.dados_salao` guardam as respostas | Ficha assinada não muda quando o modelo muda |
| Biblioteca React que processe o JSON | Renderizador próprio (`FormularioFicha.tsx`) | Sem dependência nova (DEP-01); o mesmo JSON é validado no banco por `ficha_validar_respostas`, o que nenhuma biblioteca de formulário faz |
| Canvas de assinatura | `AssinaturaCanvas.tsx`, eventos de ponteiro, sem biblioteca | Traço mínimo, alta densidade limitada a 2x, PNG conferido no banco |
| jsPDF + html2canvas | Impressão do navegador ("Salvar como PDF") com a página `/fichas/:id/imprimir` | html2canvas gera imagem (texto não selecionável, arquivo pesado, falha com CSS moderno) e exige duas dependências; o app já usa esse padrão em `ImprimirComissoes.tsx` |

## Segurança

- Link: token de 244 bits (`gen_random_uuid` duas vezes), no fragmento da URL (não vai ao servidor nem a logs); o banco guarda só o SHA-256.
- Sem login, só duas funções: `ficha_publica_abrir` e `ficha_publica_assinar`. A tabela fica fechada para `anon`.
- RLS: administradora vê as fichas do estabelecimento; profissional só as dela. Política restritiva e gatilho de guarda do estabelecimento.
- Pela API só se cria ficha pendente e só se cancela (com motivo). Ficha assinada não é alterada nem excluída; só a administradora cancela.
- Trilha: `ficha_criada`, `ficha_link_gerado`, `ficha_assinada`, `ficha_cancelada` em `access_logs`, com o estabelecimento da ficha.
- Modelo visual: escolhido pela administradora por documento (`ficha_preferencias`); a ficha grava o modelo na criação, pelo banco.

## Modelos visuais

`src/features/fichas/temas.ts`: Clássico, Rosé, Minimalista, Noir & Dourado e Verde Spa. Escolha em Fichas e Termos > Modelos visuais.

## Fora deste escopo

- Editor de modelos pela tela (hoje os modelos ficam em `src/features/fichas/modelos.ts`, versionados).
- Avaliação técnica da profissional (fototipo confirmado, parâmetros do aparelho, retornos): vai no histórico técnico da cliente.
- Cifra em campo dos dados de saúde (CRI-04) e rotina de exclusão ao fim do prazo de guarda (LGP-03).
