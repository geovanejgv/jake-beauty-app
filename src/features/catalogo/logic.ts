// Regras do catálogo replicadas do banco (public.servico_condicoes) para mostrar na tela
// o que será cobrado. O valor gravado é sempre o calculado pelo banco (VAL-07).
import type { Servico, Vinculo } from './api';

export type Condicoes = { oferece: boolean; valor: number; minutos: number; comissao: number; origemComissao: 'servico_profissional' | 'perfil' | 'servico' | 'nenhuma' };

export function condicoesEfetivas(servico: Servico, vinculo: Vinculo | undefined, comissaoPerfil: number | null | undefined): Condicoes {
  const origemComissao: Condicoes['origemComissao'] =
    vinculo?.comissao_percentual != null ? 'servico_profissional'
      : comissaoPerfil != null ? 'perfil'
        : servico.comissao_base_percentual != null ? 'servico' : 'nenhuma';
  return {
    oferece: !!vinculo?.ativo && servico.ativo,
    valor: Number(vinculo?.valor_personalizado ?? servico.preco_base),
    minutos: Number(vinculo?.tempo_execucao_minutos ?? servico.duracao_base_minutos),
    comissao: Number(vinculo?.comissao_percentual ?? comissaoPerfil ?? servico.comissao_base_percentual ?? 0),
    origemComissao,
  };
}

/** "60% profissional / 40% salão" */
export function divisao(comissao: number): string {
  const p = Math.round(comissao * 100) / 100;
  const s = Math.round((100 - p) * 100) / 100;
  return `${p.toLocaleString('pt-BR')}% profissional / ${s.toLocaleString('pt-BR')}% salão`;
}

export function duracaoTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} min`;
}

/** Situação do "ticar a categoria inteira": todos, nenhum ou parte habilitados. */
export function estadoCategoria(servicos: Servico[], habilitados: Set<string>): 'todos' | 'nenhum' | 'parcial' {
  const ativos = servicos.filter((s) => s.ativo);
  if (!ativos.length) return 'nenhum';
  const n = ativos.filter((s) => habilitados.has(s.id)).length;
  return n === 0 ? 'nenhum' : n === ativos.length ? 'todos' : 'parcial';
}
