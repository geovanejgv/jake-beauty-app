import { describe, expect, it } from 'vitest';
import { backupEmDia, dataBr, linhasDeDados, nomeArquivoBackup, reais } from './logic';
import { crc32, escreverXlsx, nomeDeAba } from './xlsx';

/** Lê de volta os arquivos de um ZIP sem compressão (diretório central). */
function lerZip(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let fim = zip.length - 22;
  while (v.getUint32(fim, true) !== 0x06054b50) fim--;
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const arquivos = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    const tam = v.getUint32(p + 20, true);
    const nomeLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(zip.subarray(p + 46, p + 46 + nomeLen));
    const inicio = local + 30 + v.getUint16(local + 26, true);
    arquivos.set(nome, dec.decode(zip.subarray(inicio, inicio + tam)));
    p += 46 + nomeLen;
  }
  return arquivos;
}

describe('aviso mensal', () => {
  it('sem backup ou de mês anterior = pendente; do mês corrente = em dia', () => {
    expect(backupEmDia(null, '2026-10-05')).toBe(false);
    expect(backupEmDia('2026-09-30T23:00:00Z', '2026-10-01')).toBe(false);
    expect(backupEmDia('2026-10-01T09:00:00Z', '2026-10-18')).toBe(true);
  });
});

describe('formatos da planilha', () => {
  it('reais, datas, nome do arquivo e contagem', () => {
    expect(reais(1234.5)).toBe('1234,50');
    expect(reais('80')).toBe('80,00');
    expect(reais(null)).toBe('');
    expect(dataBr('2026-10-05T12:00:00Z')).toBe('05/10/2026');
    expect(dataBr(null)).toBe('');
    expect(nomeArquivoBackup('clientes', '2026-10-18')).toBe('backup-clientes-2026-10-18.xlsx');
    expect(linhasDeDados([{ linhas: [['a'], ['1'], ['2']] }, { linhas: [['b']] }])).toBe(2);
    expect(nomeDeAba('Contas: a/receber [2026] com nome muito comprido demais')).toHaveLength(31);
  });
});

describe('gerador de .xlsx', () => {
  it('crc32 confere com o valor de referência', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('o arquivo abre e traz as abas, os valores e o cabeçalho em negrito', () => {
    const zip = escreverXlsx([
      { nome: 'Clientes', linhas: [['Nome', 'Telefone'], ['Ana & Cia <VIP>', '(11) 9 0000-0000']], larguras: [30, 16] },
      { nome: 'Outra', linhas: [['X']] },
    ]);
    expect(String.fromCharCode(zip[0], zip[1])).toBe('PK');
    const arquivos = lerZip(zip);
    expect([...arquivos.keys()]).toContain('xl/worksheets/sheet2.xml');
    expect(arquivos.get('xl/workbook.xml')).toContain('name="Clientes"');
    const folha = arquivos.get('xl/worksheets/sheet1.xml')!;
    expect(folha).toContain('Ana &amp; Cia &lt;VIP&gt;');
    expect(folha).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(folha).toContain('<col min="1" max="1" width="30" customWidth="1"/>');
  });
});
