// Regras das fichas na tela. A validação espelha public.ficha_validar_respostas (o banco
// valida de novo; aqui é só para avisar a cliente antes de enviar).
import type { Campo, EsquemaFicha, Respostas, Responsavel, ValorResposta } from './tipos';

export type Origem = 'cliente' | 'salao';

const ID_VALIDO = /^[a-z][a-z0-9_]{0,59}$/;
const so = (s: string) => s.replace(/\D/g, '');

export const chaveDetalhe = (id: string) => `${id}__detalhe`;

export function todosOsCampos(esquema: EsquemaFicha): Campo[] {
  return esquema.secoes.flatMap((s) => s.campos);
}

export function origemDe(campo: Campo): Origem {
  return campo.origem ?? 'cliente';
}

export function campoVisivel(campo: Campo, respostas: Respostas): boolean {
  if (!campo.mostrarSe) return true;
  return respostas[campo.mostrarSe.campo] === campo.mostrarSe.igual;
}

export function cpfValido(valor: string): boolean {
  const d = so(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function vazio(campo: Campo, v: ValorResposta | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return campo.tipo === 'aceite' && v === false;
}

/** Data ISO (aaaa-mm-dd) válida, entre 1900 e hoje. */
function dataValida(v: string, hoje: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return false;
  return v >= '1900-01-01' && v <= hojeIso(hoje);
}

export function hojeIso(hoje = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}

/**
 * Prepara as respostas para enviar: tira campos escondidos, vazios e detalhes sem "sim",
 * deixa só dígitos em CPF e telefone e apara os textos.
 */
export function limparRespostas(esquema: EsquemaFicha, respostas: Respostas, origem: Origem): Respostas {
  const saida: Respostas = {};
  for (const campo of todosOsCampos(esquema)) {
    if (campo.tipo === 'informativo' || origemDe(campo) !== origem || !campoVisivel(campo, respostas)) continue;
    let v = respostas[campo.id];
    if (typeof v === 'string') v = ['cpf', 'telefone'].includes(campo.tipo) ? so(v) : v.trim();
    if (vazio(campo, v)) continue;
    saida[campo.id] = v as ValorResposta;
    const det = respostas[chaveDetalhe(campo.id)];
    if (campo.tipo === 'sim_nao' && campo.detalhe && v === 'sim' && typeof det === 'string' && det.trim()) {
      saida[chaveDetalhe(campo.id)] = det.trim();
    }
  }
  // Condições dependem das respostas já limpas (um campo escondido não libera outro).
  for (const campo of todosOsCampos(esquema)) {
    if (campo.id in saida && !campoVisivel(campo, saida)) delete saida[campo.id];
  }
  return saida;
}

/** Primeiro problema encontrado (mesma ordem e texto do banco), ou null. */
export function validarRespostas(esquema: EsquemaFicha, respostas: Respostas, origem: Origem, hoje = new Date()): { campo: string; mensagem: string } | null {
  const permitidas = new Set<string>();
  for (const campo of todosOsCampos(esquema)) {
    if (campo.tipo === 'informativo' || origemDe(campo) !== origem) continue;
    permitidas.add(campo.id);
    if (campo.tipo === 'sim_nao' && campo.detalhe) permitidas.add(chaveDetalhe(campo.id));
    const v = respostas[campo.id];
    const erro = (mensagem: string) => ({ campo: campo.id, mensagem });
    if (!campoVisivel(campo, respostas)) {
      if (v !== undefined) return erro(`Campo não esperado: ${campo.rotulo}`);
      continue;
    }
    if (vazio(campo, v)) {
      if (campo.obrigatorio) return erro(`${campo.tipo === 'aceite' ? 'Confirme' : 'Preencha'}: ${campo.rotulo}`);
      if (chaveDetalhe(campo.id) in respostas) return erro(`Campo não esperado: ${campo.rotulo}`);
      continue;
    }
    switch (campo.tipo) {
      case 'texto': case 'texto_longo': case 'telefone': case 'cpf': case 'email': case 'data': {
        if (typeof v !== 'string') return erro(`Resposta inválida: ${campo.rotulo}`);
        const max = Math.min(campo.max ?? (campo.tipo === 'texto_longo' ? 2000 : 200), 4000);
        if (v.length > max) return erro(`Texto longo demais: ${campo.rotulo}`);
        if (campo.tipo === 'cpf' && !cpfValido(v)) return erro('CPF inválido.');
        if (campo.tipo === 'telefone' && !/^\d{10,13}$/.test(v)) return erro(`Telefone inválido: ${campo.rotulo}`);
        if (campo.tipo === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return erro('E-mail inválido.');
        if (campo.tipo === 'data' && !dataValida(v, hoje)) return erro(`Data inválida: ${campo.rotulo}`);
        break;
      }
      case 'numero':
        if (typeof v !== 'number' || !Number.isFinite(v)) return erro(`Número inválido: ${campo.rotulo}`);
        if (v < (campo.min ?? 0) || v > (campo.max ?? 1_000_000)) return erro(`Número fora do limite: ${campo.rotulo}`);
        break;
      case 'sim_nao': {
        if (v !== 'sim' && v !== 'nao') return erro(`Resposta inválida: ${campo.rotulo}`);
        if (campo.detalhe) {
          const det = respostas[chaveDetalhe(campo.id)];
          if (v === 'sim') {
            if (det !== undefined && typeof det !== 'string') return erro(`Resposta inválida: ${campo.rotulo}`);
            const texto = (typeof det === 'string' ? det : '').trim();
            if (!texto && campo.detalhe.obrigatorio) return erro(`Preencha: ${campo.detalhe.rotulo}`);
            if (texto.length > 500) return erro(`Texto longo demais: ${campo.rotulo}`);
          } else if (det !== undefined) {
            return erro(`Campo não esperado: ${campo.rotulo}`);
          }
        }
        break;
      }
      case 'escolha_unica': {
        const validas = new Set((campo.opcoes ?? []).map((o) => o.valor));
        if (typeof v !== 'string' || !validas.has(v)) return erro(`Opção inválida: ${campo.rotulo}`);
        break;
      }
      case 'escolha_multipla': {
        const validas = new Set((campo.opcoes ?? []).map((o) => o.valor));
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !validas.has(x)) || new Set(v).size !== v.length) {
          return erro(`Opção inválida: ${campo.rotulo}`);
        }
        break;
      }
      case 'aceite':
        if (v !== true) return erro(`Resposta inválida: ${campo.rotulo}`);
        break;
      default:
        return erro('Modelo de ficha inválido.');
    }
  }
  if (Object.keys(respostas).some((k) => !permitidas.has(k))) return { campo: '', mensagem: 'Campo não previsto na ficha.' };
  return null;
}

/** Idade completa em anos numa data (aaaa-mm-dd). */
export function idade(nascimento: string, hoje = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return null;
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
  return anos;
}

/** Menor de 18 anos: assina com o responsável legal. */
export function ehMenor(esquema: EsquemaFicha, respostas: Respostas, hoje = new Date()): boolean {
  const nasc = esquema.campoNascimento ? respostas[esquema.campoNascimento] : undefined;
  if (typeof nasc !== 'string') return false;
  const anos = idade(nasc, hoje);
  return anos !== null && anos < 18;
}

export function validarResponsavel(r: Responsavel): string | null {
  if (r.nome.trim().length < 3) return 'Preencha o nome do responsável legal.';
  if (r.parentesco.trim().length < 2) return 'Preencha o parentesco do responsável legal.';
  if (!cpfValido(r.cpf)) return 'CPF do responsável inválido.';
  return null;
}

/** Texto da resposta para leitura (documento, impressão e alertas). */
export function textoResposta(campo: Campo, respostas: Respostas): string {
  const v = respostas[campo.id];
  if (v === undefined || v === '') return '';
  const rotuloOpcao = (x: string) => campo.opcoes?.find((o) => o.valor === x)?.rotulo ?? x;
  switch (campo.tipo) {
    case 'sim_nao': {
      const det = respostas[chaveDetalhe(campo.id)];
      return v === 'sim' ? `Sim${typeof det === 'string' && det ? ` (${det})` : ''}` : 'Não';
    }
    case 'aceite': return v === true ? 'Confirmado' : '';
    case 'escolha_unica': return rotuloOpcao(String(v));
    case 'escolha_multipla': return Array.isArray(v) ? v.map(rotuloOpcao).join(', ') : '';
    case 'data': return typeof v === 'string' ? v.split('-').reverse().join('/') : '';
    case 'cpf': { const d = so(String(v)); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(v); }
    case 'telefone': { const d = so(String(v)); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : String(v); }
    case 'numero': return campo.id === 'valor' ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(v);
    default: return String(v);
  }
}

/** Respostas que pedem atenção da profissional antes do procedimento. */
export function alertas(esquema: EsquemaFicha, respostas: Respostas): { id: string; rotulo: string; resposta: string }[] {
  const lista: { id: string; rotulo: string; resposta: string }[] = [];
  for (const campo of todosOsCampos(esquema)) {
    const v = respostas[campo.id];
    if (v === undefined) continue;
    const marcado =
      (campo.tipo === 'sim_nao' && campo.alertaSe !== undefined && v === campo.alertaSe) ||
      (campo.tipo === 'escolha_unica' && campo.opcoes?.some((o) => o.alerta && o.valor === v)) ||
      (campo.tipo === 'escolha_multipla' && Array.isArray(v) && campo.opcoes?.some((o) => o.alerta && v.includes(o.valor)));
    if (marcado) lista.push({ id: campo.id, rotulo: campo.rotulo, resposta: textoResposta(campo, respostas) });
  }
  return lista;
}

/** Problemas de estrutura de um modelo (ids repetidos, opções faltando, condição apontando para o nada). */
export function problemasDoModelo(esquema: EsquemaFicha): string[] {
  const problemas: string[] = [];
  const ids = new Set<string>();
  for (const campo of todosOsCampos(esquema)) {
    if (!ID_VALIDO.test(campo.id)) problemas.push(`id inválido: ${campo.id}`);
    if (ids.has(campo.id)) problemas.push(`id repetido: ${campo.id}`);
    ids.add(campo.id);
    if ((campo.tipo === 'escolha_unica' || campo.tipo === 'escolha_multipla') && !(campo.opcoes?.length)) problemas.push(`sem opções: ${campo.id}`);
    if (campo.detalhe && campo.tipo !== 'sim_nao') problemas.push(`detalhe fora de sim/não: ${campo.id}`);
  }
  for (const campo of todosOsCampos(esquema)) {
    if (campo.mostrarSe && !ids.has(campo.mostrarSe.campo)) problemas.push(`condição sem campo: ${campo.id}`);
  }
  if (esquema.campoNascimento && !ids.has(esquema.campoNascimento)) problemas.push('campo de nascimento inexistente');
  return problemas;
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? '';

/** Mensagem para enviar o link à cliente. */
export function mensagemLink(nome: string, estabelecimento: string | null | undefined, titulo: string, link: string): string {
  return [
    `Olá, ${primeiroNome(nome)}!`,
    `Antes do seu atendimento${estabelecimento ? ` no ${estabelecimento}` : ''}, preencha e assine a sua ${titulo.toLowerCase()} pelo celular:`,
    link,
    'O link é pessoal e vale por 72 horas.',
  ].join('\n');
}

/** O token vai no fragmento (#): não aparece em log de servidor nem no Referer. */
export function linkDaFicha(origem: string, token: string): string {
  return `${origem}/ficha#${token}`;
}

export function tokenDoFragmento(hash: string): string | null {
  const t = hash.replace(/^#/, '');
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}
