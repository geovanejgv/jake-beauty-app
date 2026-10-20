import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { nomeProvedor } from '../../../supabase/functions/ia/nucleo/catalogo.ts';
import type { ProvedorIa } from '../../../supabase/functions/ia/nucleo/tipos.ts';
import { iaKeys, listarConfiguracoes } from './api';

export type DisponibilidadeIa =
  | { carregando: true; ativa: false }
  | { carregando: false; ativa: false }
  | { carregando: false; ativa: true; provedor: ProvedorIa; nomeProvedor: string; modelo: string; chaveValida: boolean };

/**
 * IA da pessoa logada, para as telas decidirem o que mostrar. Lida direto do banco
 * (RLS: só as próprias linhas, sem a coluna da chave). Falha de leitura = "sem IA":
 * nenhuma tela depende da IA.
 */
export function useDisponibilidadeIa(): DisponibilidadeIa {
  const { perfil } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: iaKeys.configuracoes(perfil?.id),
    queryFn: listarConfiguracoes,
    enabled: !!perfil,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (isLoading) return { carregando: true, ativa: false };
  const ativa = data?.find((c) => c.is_active);
  if (!ativa) return { carregando: false, ativa: false };
  return { carregando: false, ativa: true, provedor: ativa.provider, nomeProvedor: nomeProvedor(ativa.provider), modelo: ativa.model_preference, chaveValida: ativa.status_chave === 'valida' };
}

/** IA ligada e com a última chave aceita pelo provedor: só aí os símbolos de IA aparecem. */
export function useIaPronta(): boolean {
  const ia = useDisponibilidadeIa();
  return ia.ativa && ia.chaveValida;
}

/** Recarrega a disponibilidade (depois de salvar, trocar ou desativar; ou de uma chamada que mudou o status da chave). */
export function useRecarregarIa() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['ia', 'configuracoes'] });
}
