import { AlertTriangle, CheckSquare } from 'lucide-react';
import { alertas, campoVisivel, origemDe, textoResposta } from './logic';
import type { Tema } from './temas';
import type { EsquemaFicha, Respostas } from './tipos';

export type DadosAssinatura = {
  assinaturaCliente: string | null;
  assinaturaResponsavel?: string | null;
  responsavel?: { nome: string | null; cpf: string | null; parentesco: string | null } | null;
  assinadoEm?: string | null;
  ip?: string | null;
  dispositivo?: string | null;
  hash?: string | null;
};

type Props = {
  esquema: EsquemaFicha;
  tema: Tema;
  estabelecimento: string;
  profissional?: string | null;
  dadosSalao: Respostas;
  respostas: Respostas;
  assinatura: DadosAssinatura;
  /** Quadro de alertas clínicos (para a equipe; a cópia da cliente não mostra). */
  mostrarAlertas?: boolean;
  /** Marca d'água de documento cancelado. */
  cancelado?: string | null;
};

const cpfFormatado = (d: string | null | undefined) =>
  d && d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d ?? '';

const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '';

/**
 * Documento preenchido, só leitura, no modelo visual escolhido. É a mesma tela que vira
 * PDF pelo "Imprimir / Salvar como PDF" do navegador (texto selecionável, sem biblioteca).
 */
export function DocumentoFicha({ esquema, tema, estabelecimento, profissional, dadosSalao, respostas, assinatura, mostrarAlertas, cancelado }: Props) {
  const lista = mostrarAlertas ? alertas(esquema, respostas) : [];
  const nome = typeof respostas.nome_completo === 'string' ? respostas.nome_completo : '';
  return (
    <article className={`relative ${tema.folha} p-5 sm:p-8 print:shadow-none print:border-0 print:rounded-none space-y-5 text-slate-900`}>
      {cancelado && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
          <span className="text-6xl font-black text-red-500/20 -rotate-12">CANCELADA</span>
        </div>
      )}
      <header className={tema.cabecalho}>
        <p className={tema.marca}>{estabelecimento}</p>
        <h1 className={tema.titulo}>{esquema.titulo}</h1>
        {esquema.subtitulo && <p className={tema.subtitulo}>{esquema.subtitulo}</p>}
        {profissional && <p className={`${tema.subtitulo} !mt-1`}>Profissional: {profissional}</p>}
      </header>

      {cancelado && <p className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-lg p-3">Ficha cancelada: {cancelado}</p>}

      {lista.length > 0 && (
        <section className={`${tema.alerta} p-4 break-inside-avoid`}>
          <h2 className="font-bold text-sm flex items-center gap-2"><AlertTriangle size={16} /> Atenção antes do procedimento ({lista.length})</h2>
          <ul className="mt-2 text-sm space-y-1 list-disc pl-5">
            {lista.map((a) => <li key={a.id}><strong>{a.rotulo}</strong> {a.resposta}</li>)}
          </ul>
        </section>
      )}

      {esquema.secoes.map((s) => {
        const campos = s.campos.filter((c) => c.tipo !== 'informativo' && campoVisivel(c, origemDe(c) === 'salao' ? dadosSalao : respostas));
        const fonte = (origem: string) => (origem === 'salao' ? dadosSalao : respostas);
        const preenchidos = campos.filter((c) => textoResposta(c, fonte(origemDe(c))) !== '');
        if (preenchidos.length === 0) return null;
        const aceites = preenchidos.filter((c) => c.tipo === 'aceite');
        const demais = preenchidos.filter((c) => c.tipo !== 'aceite');
        return (
          <section key={s.id} className={`${tema.secao} space-y-3 break-inside-avoid-page`}>
            <h2 className={tema.secaoTitulo}>{s.titulo}</h2>
            {demais.length > 0 && (
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
                {demais.map((c) => (
                  <div key={c.id} className={`${c.largo || c.tipo === 'texto_longo' ? 'sm:col-span-2 print:col-span-2' : ''} break-inside-avoid`}>
                    <dt className={tema.ajuda}>{c.rotulo}</dt>
                    <dd className={`${tema.resposta} text-sm whitespace-pre-line`}>{textoResposta(c, fonte(origemDe(c)))}</dd>
                  </div>
                ))}
              </dl>
            )}
            {aceites.length > 0 && (
              <ul className="space-y-2">
                {aceites.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-sm break-inside-avoid">
                    <CheckSquare size={16} className="mt-0.5 shrink-0" /> <span>{c.rotulo}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {esquema.declaracaoFinal && <p className="text-sm italic">{esquema.declaracaoFinal}</p>}

      <section className="grid gap-6 sm:grid-cols-2 print:grid-cols-2 pt-2 break-inside-avoid">
        <Assinatura imagem={assinatura.assinaturaCliente} legenda={nome || 'Cliente'} detalhe={cpfFormatado(typeof respostas.cpf === 'string' ? respostas.cpf : null) || 'Cliente'} />
        {assinatura.assinaturaResponsavel && assinatura.responsavel && (
          <Assinatura imagem={assinatura.assinaturaResponsavel} legenda={assinatura.responsavel.nome ?? ''}
            detalhe={`Responsável legal (${assinatura.responsavel.parentesco ?? ''}), CPF ${cpfFormatado(assinatura.responsavel.cpf)}`} />
        )}
      </section>

      {assinatura.assinadoEm && (
        <footer className="border-t border-slate-200 pt-3 text-[10px] leading-relaxed text-slate-500 break-inside-avoid">
          <p>Assinado eletronicamente na tela do celular em {dataHora(assinatura.assinadoEm)}{assinatura.ip ? `, IP ${assinatura.ip}` : ''}.</p>
          {assinatura.dispositivo && <p>Dispositivo: {assinatura.dispositivo}</p>}
          {assinatura.hash && <p className="break-all">Código de integridade (SHA-256): {assinatura.hash}</p>}
          <p>Modelo {esquema.versao}. Dados tratados conforme a LGPD; pedidos sobre seus dados pelo WhatsApp do salão.</p>
        </footer>
      )}
    </article>
  );
}

function Assinatura({ imagem, legenda, detalhe }: { imagem: string | null | undefined; legenda: string; detalhe: string }) {
  return (
    <div className="text-center">
      <div className="h-24 flex items-end justify-center border-b border-slate-500">
        {imagem ? <img src={imagem} alt={`Assinatura de ${legenda}`} className="max-h-24 max-w-full object-contain" /> : null}
      </div>
      <p className="text-sm font-medium mt-1">{legenda}</p>
      <p className="text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}
