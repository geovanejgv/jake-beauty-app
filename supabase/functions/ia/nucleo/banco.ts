import type { BancoIa, NovaGeracao, RegistroUso } from './servico.ts';
import type { AnotacaoIa, AtendimentoIa, ClienteIa, LeadIa, LeitorIa, SessaoIa } from './funcionalidades/tipos.ts';
import type { ProvedorIa } from './tipos.ts';

/**
 * Implementação de BancoIa e LeitorIa com o supabase-js da Edge Function.
 *
 * - "usuario": cliente com o JWT da própria sessão; o RLS decide (LLM-02, LLM-12).
 * - "servico": chave de serviço, usada SÓ para ler a coluna cifrada (que o
 *   navegador não lê), gravar o log de uso e o resultado (que o navegador não
 *   inclui). Toda consulta com ela filtra pelo perfil e pelo estabelecimento da
 *   sessão, lidos do banco, nunca do corpo da requisição (AUZ-02, AUZ-03).
 */

// Tipo mínimo do supabase-js usado aqui (o núcleo não importa o pacote).
// deno-lint-ignore no-explicit-any
type Consulta = any;
export type ClienteSupabase = { from(tabela: string): Consulta };

function falhou(error: unknown): void {
  if (error) throw new Error('falha_banco');
}

export function criarBanco(usuario: ClienteSupabase, servico: ClienteSupabase, sessao: SessaoIa): BancoIa {
  const doPerfil = (q: Consulta) => q.eq('user_id', sessao.usuarioId).eq('estabelecimento_id', sessao.estabelecimentoId);
  const agora = () => new Date().toISOString();

  return {
    async linhaChave(provedor?: ProvedorIa) {
      let q = doPerfil(servico.from('user_ai_settings').select('provider, model_preference, api_key_encrypted'));
      q = provedor ? q.eq('provider', provedor) : q.eq('is_active', true);
      const { data, error } = await q.maybeSingle();
      falhou(error);
      return data ?? null;
    },

    async usoDesde(desdeIso: string, contarValidacao: boolean) {
      let q = doPerfil(servico.from('ai_usage_logs').select('id', { count: 'exact', head: true })).gte('created_at', desdeIso);
      if (!contarValidacao) q = q.neq('acao', 'validar_chave');
      const { count, error } = await q;
      falhou(error);
      return count ?? 0;
    },

    async registrarUso(r: RegistroUso) {
      const { error } = await servico.from('ai_usage_logs').insert({
        user_id: sessao.usuarioId,
        estabelecimento_id: sessao.estabelecimentoId,
        provider: r.provedor,
        acao: r.acao,
        sucesso: r.sucesso,
        codigo_erro: r.codigoErro ?? null,
        modelo: r.modelo ?? null,
        duracao_ms: r.duracaoMs ?? null,
        tokens_entrada: r.tokensEntrada ?? null,
        tokens_saida: r.tokensSaida ?? null,
      });
      falhou(error);
    },

    async salvarGeracao(g: NovaGeracao) {
      const { data, error } = await servico.from('ai_generations').insert({
        estabelecimento_id: sessao.estabelecimentoId,
        user_id: sessao.usuarioId,
        funcionalidade: g.funcionalidade,
        provider: g.provedor,
        modelo: g.modelo,
        client_id: g.vinculo.client_id ?? null,
        lead_id: g.vinculo.lead_id ?? null,
        parametros: g.parametros,
        conteudo: g.conteudo,
      }).select('id, created_at, modelo').single();
      falhou(error);
      if (!data) throw new Error('falha_banco');
      return data as { id: string; created_at: string; modelo: string };
    },

    async configuracaoSalva(provedor: ProvedorIa) {
      const { data, error } = await usuario.from('user_ai_settings').select('id').eq('provider', provedor).maybeSingle();
      falhou(error);
      return data ?? null;
    },

    async gravarConfiguracao(provedor, campos, nova) {
      // No máximo uma ativa (índice único parcial): desativa as outras antes.
      const { error: e1 } = await usuario.from('user_ai_settings').update({ is_active: false }).eq('is_active', true).neq('provider', provedor);
      falhou(e1);
      const linha = { ...campos, is_active: true, status_chave: 'valida', validada_em: agora() };
      const { error: e2 } = nova
        ? await usuario.from('user_ai_settings').insert({ ...linha, provider: provedor, consentimento_em: agora() })
        : await usuario.from('user_ai_settings').update(linha).eq('provider', provedor);
      falhou(e2);
    },

    async marcarChave(provedor, status) {
      const { error } = await usuario.from('user_ai_settings')
        .update({ status_chave: status, ...(status === 'valida' ? { validada_em: agora() } : {}) })
        .eq('provider', provedor).neq('status_chave', status);
      falhou(error);
    },
  };
}

export function criarLeitor(usuario: ClienteSupabase): LeitorIa {
  return {
    async lead(id: string): Promise<LeadIa | null> {
      const { data, error } = await usuario.from('leads')
        .select('id, nome, origem, interesse, resumo, etapa, valor_estimado, proxima_acao, motivo_perda, created_at')
        .eq('id', id).maybeSingle();
      falhou(error);
      return data ?? null;
    },

    async cliente(id: string): Promise<ClienteIa | null> {
      // A view mascara o que a permissão da profissional não libera (observações vêm nulas).
      const { data, error } = await usuario.from('clientes_visiveis').select('id, name, notes').eq('id', id).maybeSingle();
      falhou(error);
      return data ? { id: data.id, nome: data.name ?? '', observacoes: data.notes ?? null } : null;
    },

    async anotacoesCliente(id: string, limite: number): Promise<AnotacaoIa[]> {
      const { data, error } = await usuario.from('cliente_historico').select('tipo, texto, created_at')
        .eq('cliente_id', id).order('created_at', { ascending: false }).limit(limite);
      falhou(error);
      return data ?? [];
    },

    async atendimentosCliente(id: string, limite: number): Promise<AtendimentoIa[]> {
      const { data, error } = await usuario.from('appointments').select('start_time, status, servicos(nome), services(name)')
        .eq('client_id', id).not('is_block', 'is', true).order('start_time', { ascending: false }).limit(limite);
      falhou(error);
      return (data ?? []).map((a: { start_time: string; status: string | null; servicos?: { nome?: string } | null; services?: { name?: string } | null }) => ({
        inicio: a.start_time,
        status: a.status,
        servico: a.servicos?.nome ?? a.services?.name ?? null,
      }));
    },

    async nomesServicos(limite: number): Promise<string[]> {
      const { data, error } = await usuario.from('servicos').select('nome').eq('ativo', true).order('nome').limit(limite);
      falhou(error);
      return (data ?? []).map((s: { nome: string }) => s.nome);
    },
  };
}
