import { AlertCircle, Check } from 'lucide-react';
import { campoVisivel, chaveDetalhe, hojeIso, origemDe, textoResposta, type Origem } from './logic';
import type { Tema } from './temas';
import type { Campo, EsquemaFicha, Respostas, ValorResposta } from './tipos';

type Props = {
  esquema: EsquemaFicha;
  origem: Origem;
  respostas: Respostas;
  onMudar: (r: Respostas) => void;
  tema: Tema;
  /** Respostas do salão, mostradas só para leitura no formulário da cliente. */
  dadosSalao?: Respostas;
  campoComErro?: string | null;
};

/** CPF com pontos e traço enquanto digita (o valor salvo fica só com dígitos). */
function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

/**
 * Monta o formulário a partir do JSON da ficha. Mostra só os campos da origem pedida
 * ("cliente" no celular dela; "salao" ao criar a ficha).
 */
export function FormularioFicha({ esquema, origem, respostas, onMudar, tema, dadosSalao, campoComErro }: Props) {
  // Várias chaves de uma vez (ex.: "não" apaga o detalhe) para não perder a primeira alteração.
  const definir = (alteracoes: Record<string, ValorResposta | undefined>) => {
    const novo = { ...respostas };
    for (const [id, v] of Object.entries(alteracoes)) {
      if (v === undefined) delete novo[id]; else novo[id] = v;
    }
    onMudar(novo);
  };

  const secoesSalao = origem === 'cliente' && dadosSalao
    ? esquema.secoes.filter((s) => s.campos.some((c) => origemDe(c) === 'salao' && dadosSalao[c.id] !== undefined))
    : [];

  return (
    <div className="space-y-6">
      {secoesSalao.map((s) => (
        <section key={`salao-${s.id}`} className={`${tema.secao} space-y-3`}>
          <h2 className={tema.secaoTitulo}>{s.titulo}</h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {s.campos.filter((c) => origemDe(c) === 'salao' && dadosSalao![c.id] !== undefined).map((c) => (
              <div key={c.id} className={c.largo ? 'sm:col-span-2' : ''}>
                <dt className={tema.ajuda}>{c.rotulo}</dt>
                <dd className={`${tema.resposta} whitespace-pre-line`}>{textoResposta(c, dadosSalao!)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      {esquema.secoes.map((s) => {
        const campos = s.campos.filter((c) => origemDe(c) === origem && campoVisivel(c, respostas));
        if (campos.length === 0) return null;
        return (
          <section key={s.id} className={`${tema.secao} space-y-4`}>
            <div>
              <h2 className={tema.secaoTitulo}>{s.titulo}</h2>
              {s.descricao && origem === 'cliente' && <p className={`${tema.ajuda} mt-1`}>{s.descricao}</p>}
            </div>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.id} id={`campo-${c.id}`} className={c.largo || ['sim_nao', 'aceite', 'texto_longo', 'escolha_multipla', 'escolha_unica', 'informativo'].includes(c.tipo) ? 'sm:col-span-2' : ''}>
                  <CampoFicha campo={c} respostas={respostas} definir={definir} tema={tema} erro={campoComErro === c.id} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CampoFicha({ campo, respostas, definir, tema, erro }: {
  campo: Campo; respostas: Respostas; definir: (alteracoes: Record<string, ValorResposta | undefined>) => void; tema: Tema; erro: boolean;
}) {
  const v = respostas[campo.id];
  const rotulo = (
    <span className={tema.rotulo}>
      {campo.rotulo}{campo.obrigatorio && campo.tipo !== 'aceite' && <span className="text-red-600"> *</span>}
    </span>
  );
  const ajuda = campo.ajuda ? <span className={`block ${tema.ajuda} mt-0.5`}>{campo.ajuda}</span> : null;
  const borda = erro ? 'ring-2 ring-red-500 rounded-lg' : '';
  const chip = (marcado: boolean) => `px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px] ${marcado ? tema.chipMarcado : tema.chip}`;

  switch (campo.tipo) {
    case 'informativo':
      return <p className={tema.ajuda}>{campo.rotulo}</p>;

    case 'texto': case 'email': case 'cpf': case 'telefone': case 'data': case 'numero': {
      const tipoInput = campo.tipo === 'email' ? 'email' : campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text';
      const modo = campo.tipo === 'cpf' ? 'numeric' : campo.tipo === 'telefone' ? 'tel' : campo.tipo === 'numero' ? 'decimal' : undefined;
      const valor = v === undefined ? '' : campo.tipo === 'cpf' ? mascaraCpf(String(v)) : campo.tipo === 'telefone' ? mascaraTelefone(String(v)) : String(v);
      return (
        <label className="block">
          {rotulo}{ajuda}
          <input
            type={tipoInput} inputMode={modo} value={valor}
            autoComplete={campo.id === 'nome_completo' ? 'name' : campo.tipo === 'email' ? 'email' : campo.tipo === 'telefone' ? 'tel' : campo.id === 'data_nascimento' ? 'bday' : 'off'}
            max={campo.tipo === 'data' ? hojeIso() : campo.tipo === 'numero' ? campo.max : undefined}
            min={campo.tipo === 'data' ? '1900-01-01' : campo.tipo === 'numero' ? campo.min : undefined}
            step={campo.tipo === 'numero' ? 'any' : undefined}
            maxLength={['texto', 'email'].includes(campo.tipo) ? campo.max ?? 200 : undefined}
            onChange={(e) => {
              const t = e.target.value;
              if (campo.tipo === 'numero') definir({ [campo.id]: t === '' ? undefined : Number(t) });
              else if (campo.tipo === 'cpf' || campo.tipo === 'telefone') definir({ [campo.id]: t.replace(/\D/g, '').slice(0, campo.tipo === 'cpf' ? 11 : 13) || undefined });
              else definir({ [campo.id]: t === '' ? undefined : t });
            }}
            className={`${tema.campo} mt-1 text-base ${borda}`}
          />
        </label>
      );
    }

    case 'texto_longo':
      return (
        <label className="block">
          {rotulo}{ajuda}
          <textarea rows={4} maxLength={campo.max ?? 2000} value={typeof v === 'string' ? v : ''}
            onChange={(e) => definir({ [campo.id]: e.target.value === '' ? undefined : e.target.value })}
            className={`${tema.campo} mt-1 text-base ${borda}`} />
        </label>
      );

    case 'sim_nao': {
      const det = respostas[chaveDetalhe(campo.id)];
      return (
        <fieldset className={borda}>
          <legend>{rotulo}{ajuda}</legend>
          <div className="mt-2 flex gap-2">
            {(['sim', 'nao'] as const).map((op) => (
              <button key={op} type="button" aria-pressed={v === op}
                onClick={() => definir(op === 'nao' ? { [campo.id]: op, [chaveDetalhe(campo.id)]: undefined } : { [campo.id]: op })}
                className={`${chip(v === op)} flex-1 sm:flex-none sm:min-w-[96px]`}>
                {op === 'sim' ? 'Sim' : 'Não'}
              </button>
            ))}
          </div>
          {campo.detalhe && v === 'sim' && (
            <label className="block mt-3">
              <span className={tema.ajuda}>{campo.detalhe.rotulo}{campo.detalhe.obrigatorio && <span className="text-red-600"> *</span>}</span>
              <input type="text" maxLength={500} value={typeof det === 'string' ? det : ''}
                onChange={(e) => definir({ [chaveDetalhe(campo.id)]: e.target.value === '' ? undefined : e.target.value })}
                className={`${tema.campo} mt-1 text-base`} />
            </label>
          )}
        </fieldset>
      );
    }

    case 'escolha_unica': case 'escolha_multipla': {
      const multipla = campo.tipo === 'escolha_multipla';
      const lista = multipla && Array.isArray(v) ? v : [];
      const longas = (campo.opcoes ?? []).some((o) => o.rotulo.length > 28);
      return (
        <fieldset className={borda}>
          <legend>{rotulo}{multipla && <span className={tema.ajuda}> (marque todas que se aplicam)</span>}{ajuda}</legend>
          <div className={`mt-2 ${longas ? 'grid gap-2' : 'flex flex-wrap gap-2'}`}>
            {(campo.opcoes ?? []).map((o) => {
              const marcado = multipla ? lista.includes(o.valor) : v === o.valor;
              return (
                <button key={o.valor} type="button" aria-pressed={marcado}
                  onClick={() => {
                    if (!multipla) definir({ [campo.id]: o.valor });
                    else {
                      const nova = marcado ? lista.filter((x) => x !== o.valor) : [...lista, o.valor];
                      definir({ [campo.id]: nova.length ? nova : undefined });
                    }
                  }}
                  className={`${chip(marcado)} ${longas ? 'text-left font-medium' : ''} inline-flex items-center gap-2`}>
                  {marcado && <Check size={16} className="shrink-0" />}{o.rotulo}
                </button>
              );
            })}
          </div>
        </fieldset>
      );
    }

    case 'aceite':
      return (
        <label className={`flex items-start gap-3 p-3 cursor-pointer ${v === true ? tema.chipMarcado : tema.chip} ${borda}`}>
          <input type="checkbox" checked={v === true} onChange={(e) => definir({ [campo.id]: e.target.checked ? true : undefined })}
            className="mt-1 h-5 w-5 shrink-0 accent-current" />
          <span className="text-sm leading-relaxed font-normal">{campo.rotulo}</span>
        </label>
      );

    default:
      return <p className="text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> Campo desconhecido.</p>;
  }
}
