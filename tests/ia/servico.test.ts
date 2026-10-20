import { describe, expect, it } from 'vitest';
import { cifrarChave, contextoChaveIa } from '../../supabase/functions/ia/nucleo/cifra.ts';
import { COTA_DIARIA, executarFuncionalidade, inicioDoDia, RITMO_POR_HORA, salvarConfiguracao, validarChave, type BancoIa, type Dependencias, type LinhaChave, type NovaGeracao, type RegistroUso } from '../../supabase/functions/ia/nucleo/servico.ts';
import type { LeitorIa } from '../../supabase/functions/ia/nucleo/funcionalidades/tipos.ts';
import type { Buscar } from '../../supabase/functions/ia/nucleo/provedores/http.ts';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-123';
const CHAVE = 'sk-ant-api03-chave-ficticia-para-teste_0123456789';
const sessao = { authId: 'aaaaaaaa-0000-0000-0000-000000000001', usuarioId: 'aa000000-0000-0000-0000-0000000000a1', estabelecimentoId: '5a1ab0e1-0000-4000-8000-000000000001' };
const LEAD = '1a000000-0000-0000-0000-0000000000a1';

const triagemOk = {
  resumo: 'Lead quer design. Contato [EMAIL_1].', temperatura: 'quente', motivo_temperatura: 'Pediu horário.', servicos_de_interesse: ['Design'],
  perguntas_pendentes: [], alertas: [], proximo_passo: 'Ligar.', mensagem_whatsapp: 'Oi, [CLIENTE]! Tudo bem?',
};

function cenario(opcoes: { linha?: LinhaChave | null; uso?: { hora: number; dia: number }; respostaIa?: { status: number; corpo: unknown }; lead?: boolean } = {}) {
  const usos: RegistroUso[] = [];
  const geracoes: NovaGeracao[] = [];
  const marcas: string[] = [];
  const enviados: string[] = [];
  const gravadas: { provedor: string; nova: boolean; cifra: string }[] = [];
  const banco: BancoIa = {
    linhaChave: async () => opcoes.linha ?? null,
    usoDesde: async (_desde, contarValidacao) => (contarValidacao ? opcoes.uso?.hora ?? 0 : opcoes.uso?.dia ?? 0),
    registrarUso: async (r) => { usos.push(r); },
    salvarGeracao: async (g) => { geracoes.push(g); return { id: 'g1', created_at: '2026-10-20T12:00:00Z', modelo: g.modelo }; },
    configuracaoSalva: async () => (opcoes.linha ? { id: 'c1' } : null),
    gravarConfiguracao: async (provedor, campos, nova) => { gravadas.push({ provedor, nova, cifra: campos.api_key_encrypted }); },
    marcarChave: async (_p, s) => { marcas.push(s); },
  };
  const leitor: LeitorIa = {
    lead: async (id) => (opcoes.lead === false || id !== LEAD ? null : {
      id: LEAD, nome: 'Maria Souza', origem: 'instagram', interesse: 'Design', resumo: 'Maria Souza quer horário; e-mail maria@ex.com', etapa: 'novo',
      valor_estimado: 150, proxima_acao: null, motivo_perda: null, created_at: '2026-10-19T10:00:00Z',
    }),
    cliente: async () => null,
    anotacoesCliente: async () => [],
    atendimentosCliente: async () => [],
    nomesServicos: async () => ['Design de sobrancelhas'],
  };
  const buscar: Buscar = async (url, init) => {
    if (init.body) enviados.push(String(init.body));
    const r = url.endsWith('/models?limit=1000')
      ? { status: 200, corpo: { data: [{ id: 'claude-haiku-5-5' }], has_more: false } }
      : opcoes.respostaIa ?? { status: 200, corpo: { content: [{ type: 'text', text: JSON.stringify(triagemOk) }], model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } };
    return new Response(JSON.stringify(r.corpo), { status: r.status });
  };
  const d: Dependencias = { sessao, banco, leitor, segredo: SEGREDO, buscar };
  return { d, usos, geracoes, marcas, enviados, gravadas };
}

const linhaAtiva = async (): Promise<LinhaChave> => ({
  provider: 'anthropic', model_preference: 'claude-haiku-5-5', api_key_encrypted: await cifrarChave(CHAVE, contextoChaveIa(sessao.usuarioId, 'anthropic'), SEGREDO),
});

describe('executarFuncionalidade', () => {
  it('sem configuração = ia_nao_configurada (status 200 na função)', async () => {
    const c = cenario();
    expect(await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'ia_nao_configurada' });
  });
  it('entrada com campo extra ou id inválido é recusada (VAL-02, AUZ-06)', async () => {
    const c = cenario({ linha: await linhaAtiva() });
    await expect(executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD, estabelecimento_id: 'x' })).rejects.toThrow('Campos não permitidos');
    await expect(executarFuncionalidade(c.d, 'triagem_lead', { lead_id: 'nao-e-uuid' })).rejects.toThrow('Campo inválido');
  });
  it('sucesso: dados pessoais não vão ao provedor, voltam na resposta, resultado salvo e uso só com metadados', async () => {
    const c = cenario({ linha: await linhaAtiva() });
    const r = await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const enviado = c.enviados.join('\n');
    expect(enviado).not.toContain('Maria');
    expect(enviado).not.toContain('maria@ex.com');
    expect(enviado).toContain('[CLIENTE]');
    expect(enviado).toContain('<dados nome=\\"lead\\">');
    expect((r.resultado as typeof triagemOk).mensagem_whatsapp).toBe('Oi, Maria! Tudo bem?');
    expect((r.resultado as typeof triagemOk).resumo).toContain('maria@ex.com');
    expect(c.geracoes[0]).toMatchObject({ funcionalidade: 'triagem_lead', provedor: 'anthropic', vinculo: { lead_id: LEAD } });
    expect(c.usos).toHaveLength(1);
    expect(JSON.stringify(c.usos)).not.toMatch(/Maria|maria@|sk-ant/);
    expect(c.marcas).toEqual(['valida']);
  });
  it('lead de outro estabelecimento (RLS devolve nada) = nao_encontrado, sem chamar o provedor (LLM-02)', async () => {
    const c = cenario({ linha: await linhaAtiva(), lead: false });
    expect(await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'nao_encontrado' });
    expect(c.enviados).toHaveLength(0);
  });
  it('cota diária e ritmo por hora (LLM-11)', async () => {
    const cota = cenario({ linha: await linhaAtiva(), uso: { hora: 0, dia: COTA_DIARIA } });
    expect(await executarFuncionalidade(cota.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'cota_diaria' });
    const ritmo = cenario({ linha: await linhaAtiva(), uso: { hora: RITMO_POR_HORA, dia: 0 } });
    expect(await executarFuncionalidade(ritmo.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'ritmo' });
    expect(cota.enviados.length + ritmo.enviados.length).toBe(0);
  });
  it('401 do provedor registra a falha sem conteúdo e marca a chave como inválida', async () => {
    const c = cenario({ linha: await linhaAtiva(), respostaIa: { status: 401, corpo: { error: { type: 'authentication_error', message: CHAVE } } } });
    const r = await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD });
    expect(r).toMatchObject({ ok: false, codigo: 'chave_invalida', diagnostico: { status: 401, tipo: 'authentication_error' } });
    expect(JSON.stringify(r)).not.toContain(CHAVE);
    expect(c.usos[0]).toMatchObject({ sucesso: false, codigoErro: 'chave_invalida' });
    expect(c.marcas).toEqual(['invalida']);
    expect(c.geracoes).toHaveLength(0);
  });
  it('saída fora do formato não é salva (LLM-08)', async () => {
    const c = cenario({ linha: await linhaAtiva(), respostaIa: { status: 200, corpo: { content: [{ type: 'text', text: '{"resumo":"x","extra":1}' }], stop_reason: 'end_turn' } } });
    expect(await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'resposta_invalida' });
    expect(c.geracoes).toHaveLength(0);
  });
  it('cifra de outra pessoa (AAD) não abre: chave_invalida', async () => {
    const outra = { ...(await linhaAtiva()), api_key_encrypted: await cifrarChave(CHAVE, contextoChaveIa('bb000000-0000-0000-0000-0000000000b1', 'anthropic'), SEGREDO) };
    const c = cenario({ linha: outra });
    expect(await executarFuncionalidade(c.d, 'triagem_lead', { lead_id: LEAD })).toMatchObject({ ok: false, codigo: 'chave_invalida' });
  });
});

describe('configuração', () => {
  it('validar devolve os modelos de texto ordenados e registra a validação', async () => {
    const c = cenario();
    expect(await validarChave(c.d, 'anthropic', CHAVE)).toEqual({ ok: true, modelos: ['claude-haiku-5-5'] });
    expect(c.usos[0]).toMatchObject({ acao: 'validar_chave', sucesso: true });
  });
  it('primeira ativação exige consentimento LGPD', async () => {
    const c = cenario();
    await expect(salvarConfiguracao(c.d, { provider: 'anthropic', api_key: CHAVE, modelo: 'claude-haiku-5-5' })).rejects.toThrow('confirme que concorda');
    expect(c.gravadas).toHaveLength(0);
  });
  it('salva cifrada só com modelo da conta', async () => {
    const c = cenario();
    await expect(salvarConfiguracao(c.d, { provider: 'anthropic', api_key: CHAVE, modelo: 'claude-inexistente', consentimento: true })).rejects.toThrow('não está disponível');
    await salvarConfiguracao(c.d, { provider: 'anthropic', api_key: CHAVE, modelo: 'claude-haiku-5-5', consentimento: true });
    expect(c.gravadas).toHaveLength(1);
    expect(c.gravadas[0]).toMatchObject({ provedor: 'anthropic', nova: true });
    expect(c.gravadas[0].cifra).toMatch(/^v1\./);
    expect(c.gravadas[0].cifra).not.toContain(CHAVE);
  });
  it('troca de modelo reaproveita a chave salva', async () => {
    const c = cenario({ linha: await linhaAtiva() });
    await salvarConfiguracao(c.d, { provider: 'anthropic', modelo: 'claude-haiku-5-5' });
    expect(c.gravadas[0]).toMatchObject({ nova: false });
  });
  it('dia começa à meia-noite de Brasília', () => {
    expect(inicioDoDia(new Date('2026-10-20T02:00:00Z'))).toBe('2026-10-19T03:00:00.000Z');
    expect(inicioDoDia(new Date('2026-10-20T04:00:00Z'))).toBe('2026-10-20T03:00:00.000Z');
  });
});
