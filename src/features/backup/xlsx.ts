// Gerador de planilha .xlsx sem biblioteca (sem dependência nova, DEP-01): XML do formato
// OpenXML dentro de um ZIP sem compressão ("stored"), que o Excel e o Google Planilhas abrem.
// Roda no navegador (Uint8Array e TextEncoder, sem Buffer).

export type Aba = { nome: string; linhas: string[][]; larguras?: number[] };

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { saida.set(p, pos); pos += p.length; }
  return saida;
}

/** ZIP sem compressão com os arquivos dados (nomes em UTF-8). */
export function escreverZip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const cod = new TextEncoder();
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;
  for (const a of arquivos) {
    const nome = cod.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, a.dados.length, true);
    lv.setUint32(22, a.dados.length, true);
    lv.setUint16(26, nome.length, true);
    locais.push(local, nome, a.dados);

    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, a.dados.length, true);
    cv.setUint32(24, a.dados.length, true);
    cv.setUint16(28, nome.length, true);
    cv.setUint32(42, deslocamento, true);
    centrais.push(central, nome);
    deslocamento += 30 + nome.length + a.dados.length;
  }
  const dir = juntar(centrais);
  const fim = new Uint8Array(22);
  const fv = new DataView(fim.buffer);
  fv.setUint32(0, 0x06054b50, true);
  fv.setUint16(8, arquivos.length, true);
  fv.setUint16(10, arquivos.length, true);
  fv.setUint32(12, dir.length, true);
  fv.setUint32(16, deslocamento, true);
  return juntar([...locais, dir, fim]);
}

// Caracteres de controle não são aceitos no XML da planilha (exceto tab e quebras de linha).
const escapar = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Nome de aba aceito pelo Excel: até 31 caracteres e sem \ / ? * [ ] : */
export const nomeDeAba = (nome: string) => nome.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Planilha';

const letra = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Planilha com uma aba por item; todas as células como texto; linha 1 (cabeçalho) em negrito. */
export function escreverXlsx(abas: Aba[]): Uint8Array {
  const cod = new TextEncoder();
  const x = (s: string) => cod.encode(s);
  const folhas = abas.map((a) => {
    const cols = a.larguras?.length
      ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const linhas = a.linhas
      .map((l, r) => `<row r="${r + 1}">${l.map((v, c) => `<c r="${letra(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapar(v ?? '')}</t></is></c>`).join('')}</row>`)
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${linhas}</sheetData></worksheet>`;
  });
  return escreverZip([
    {
      nome: '[Content_Types].xml',
      dados: x(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    },
    {
      nome: '_rels/.rels',
      dados: x(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      nome: 'xl/workbook.xml',
      dados: x(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((a, i) => `<sheet name="${escapar(nomeDeAba(a.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      dados: x(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    {
      nome: 'xl/styles.xml',
      dados: x(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
    },
    ...folhas.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: x(f) })),
  ]);
}
