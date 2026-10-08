// Módulos do portal, papéis e preferências de interface (o que aparece no menu e nas rotas).
// Importante: esconder um módulo é só interface. Quem barra o acesso aos dados é o RLS
// do banco (AUZ-07); por isso cada módulo de administradora também é protegido lá.
import {
  BarChart3, CalendarDays, ClipboardList, DollarSign, HandCoins, LayoutDashboard, Scissors,
  Gem, Package, Settings, ShoppingCart, SquareKanban, Store, UserCog, Users, Wallet, type LucideIcon,
} from 'lucide-react';

export type Papel = 'admin' | 'professional';

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Administradora',
  professional: 'Profissional parceiro',
};

export type IdGrupo = 'principal' | 'estabelecimento' | 'financeiro' | 'relatorios' | 'sistema';

export type IdModulo =
  | 'resumo' | 'meu_painel' | 'agenda' | 'tarefas'
  | 'clientes' | 'profissionais' | 'servicos'
  | 'financas' | 'pagamentos' | 'pdv' | 'pacotes'
  | 'relatorio_comissoes'
  | 'configuracoes' | 'plano';

export type Modulo = {
  id: IdModulo;
  rotulo: string;
  caminho: string;
  icone: LucideIcon;
  grupo: IdGrupo;
  papeis: Papel[];
  /** Pode ser escondido nas preferências de interface. */
  ocultavel: boolean;
  descricao: string;
};

export const GRUPOS: { id: IdGrupo; rotulo: string | null; icone: LucideIcon | null }[] = [
  { id: 'principal', rotulo: null, icone: null },
  { id: 'estabelecimento', rotulo: 'Meu Estabelecimento', icone: Store },
  { id: 'financeiro', rotulo: 'Financeiro', icone: DollarSign },
  { id: 'relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  { id: 'sistema', rotulo: null, icone: null },
];

const TODOS: Papel[] = ['admin', 'professional'];
const ADMIN: Papel[] = ['admin'];

export const MODULOS: Modulo[] = [
  { id: 'resumo', rotulo: 'Resumo Diário', caminho: '/dashboard', icone: LayoutDashboard, grupo: 'principal', papeis: ADMIN, ocultavel: true,
    descricao: 'Faturamento, despesas e atendimentos do período.' },
  { id: 'meu_painel', rotulo: 'Meu Painel', caminho: '/meu-painel', icone: Wallet, grupo: 'principal', papeis: TODOS, ocultavel: true,
    descricao: 'Faturamento do dia, projeção de ganhos e fechamentos para conferir.' },
  { id: 'agenda', rotulo: 'Agenda', caminho: '/agenda', icone: CalendarDays, grupo: 'principal', papeis: TODOS, ocultavel: true,
    descricao: 'Agendamentos, bloqueios e lembretes de retorno.' },
  { id: 'tarefas', rotulo: 'Tarefas', caminho: '/tarefas', icone: SquareKanban, grupo: 'principal', papeis: TODOS, ocultavel: true,
    descricao: 'Kanban operacional do salão (reposição, organização, manutenção).' },
  { id: 'clientes', rotulo: 'Clientes', caminho: '/clientes', icone: Users, grupo: 'estabelecimento', papeis: TODOS, ocultavel: true,
    descricao: 'Cadastro de clientes e histórico técnico.' },
  { id: 'profissionais', rotulo: 'Profissionais', caminho: '/profissionais', icone: UserCog, grupo: 'estabelecimento', papeis: ADMIN, ocultavel: true,
    descricao: 'Equipe, acessos, CPF, CNPJ/MEI e contrato.' },
  { id: 'servicos', rotulo: 'Serviços', caminho: '/servicos', icone: Scissors, grupo: 'estabelecimento', papeis: ADMIN, ocultavel: true,
    descricao: 'Catálogo, preços, tempos e comissão por profissional.' },
  { id: 'financas', rotulo: 'Finanças', caminho: '/financas', icone: DollarSign, grupo: 'financeiro', papeis: ADMIN, ocultavel: true,
    descricao: 'Receitas e despesas do negócio e pessoais.' },
  { id: 'pagamentos', rotulo: 'Pagamento de Profissionais', caminho: '/pagamentos', icone: HandCoins, grupo: 'financeiro', papeis: ADMIN, ocultavel: true,
    descricao: 'Comissões, gorjetas, fechamentos e assinaturas.' },
  { id: 'pdv', rotulo: 'Checkout PDV', caminho: '/pdv', icone: ShoppingCart, grupo: 'financeiro', papeis: ADMIN, ocultavel: true,
    descricao: 'Finalização de atendimento e forma de pagamento.' },
  { id: 'pacotes', rotulo: 'Pacotes', caminho: '/pacotes', icone: Package, grupo: 'financeiro', papeis: ADMIN, ocultavel: true,
    descricao: 'Venda de pacotes de sessões, saldo, validade e extrato.' },
  { id: 'relatorio_comissoes', rotulo: 'Relatório de Comissões', caminho: '/relatorios/comissoes', icone: ClipboardList, grupo: 'relatorios', papeis: TODOS, ocultavel: true,
    descricao: 'Atendimentos com valor bruto, comissão e líquido, com PDF.' },
  { id: 'plano', rotulo: 'Plano', caminho: '/plano', icone: Gem, grupo: 'sistema', papeis: TODOS, ocultavel: true,
    descricao: 'Plano do estabelecimento, prazo da demonstração e uso dos limites.' },
  { id: 'configuracoes', rotulo: 'Configurações', caminho: '/configuracoes', icone: Settings, grupo: 'sistema', papeis: TODOS, ocultavel: false,
    descricao: 'Preferências de interface e regras de comissão.' },
];

export type PreferenciasUi = { ocultar: IdModulo[] };

const IDS = new Set<string>(MODULOS.map((m) => m.id));

/** Lê o JSON salvo no banco aceitando só chaves conhecidas (o resto é ignorado). */
export function normalizarPreferencias(bruto: unknown): PreferenciasUi {
  const ocultar = (bruto && typeof bruto === 'object' && Array.isArray((bruto as { ocultar?: unknown }).ocultar))
    ? ((bruto as { ocultar: unknown[] }).ocultar.filter((x): x is IdModulo => typeof x === 'string' && IDS.has(x)))
    : [];
  return { ocultar: [...new Set(ocultar)].filter((id) => MODULOS.find((m) => m.id === id)?.ocultavel) };
}

export function modulosDoPapel(papel: Papel): Modulo[] {
  return MODULOS.filter((m) => m.papeis.includes(papel));
}

export function modulosVisiveis(papel: Papel, prefs: PreferenciasUi): Modulo[] {
  const ocultos = new Set(prefs.ocultar);
  return modulosDoPapel(papel).filter((m) => !m.ocultavel || !ocultos.has(m.id));
}

export function moduloVisivel(id: IdModulo, papel: Papel, prefs: PreferenciasUi): boolean {
  return modulosVisiveis(papel, prefs).some((m) => m.id === id);
}

/** Primeira tela ao entrar: a agenda, se estiver visível; senão o primeiro módulo visível. */
export function rotaInicial(papel: Papel, prefs: PreferenciasUi): string {
  const visiveis = modulosVisiveis(papel, prefs);
  return (visiveis.find((m) => m.id === 'agenda') ?? visiveis[0]).caminho;
}

export function moduloDaRota(caminho: string): Modulo | undefined {
  return MODULOS.find((m) => caminho === m.caminho || caminho.startsWith(m.caminho + '/'));
}
