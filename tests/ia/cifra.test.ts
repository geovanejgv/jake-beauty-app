import { describe, expect, it } from 'vitest';
import { cifrarChave, contextoChaveIa, decifrarChave } from '../../supabase/functions/ia/nucleo/cifra.ts';

/** CRI-04, CRI-05, CRI-06: AES-256-GCM com subchave HKDF e AAD pessoa + provedor. */
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-123';
const CHAVE = 'sk-ant-api03-chave-ficticia-para-teste_0123456789';
const ctx = contextoChaveIa('aa000000-0000-0000-0000-0000000000a1', 'anthropic');

describe('cifra da chave de API', () => {
  it('ida e volta', async () => {
    const c = await cifrarChave(CHAVE, ctx, SEGREDO);
    expect(c).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(c).not.toContain(CHAVE);
    expect(await decifrarChave(c, ctx, SEGREDO)).toBe(CHAVE);
  });
  it('IV diferente a cada cifra', async () => {
    const a = await cifrarChave(CHAVE, ctx, SEGREDO);
    const b = await cifrarChave(CHAVE, ctx, SEGREDO);
    expect(a.split('.')[1]).not.toBe(b.split('.')[1]);
    expect(a).not.toBe(b);
  });
  it('cifra copiada para outra pessoa ou outro provedor não abre (AAD)', async () => {
    const c = await cifrarChave(CHAVE, ctx, SEGREDO);
    await expect(decifrarChave(c, contextoChaveIa('bb000000-0000-0000-0000-0000000000b1', 'anthropic'), SEGREDO)).rejects.toThrow('Não foi possível decifrar');
    await expect(decifrarChave(c, contextoChaveIa('aa000000-0000-0000-0000-0000000000a1', 'openai'), SEGREDO)).rejects.toThrow('Não foi possível decifrar');
  });
  it('segredo trocado não abre; segredo curto é recusado', async () => {
    const c = await cifrarChave(CHAVE, ctx, SEGREDO);
    await expect(decifrarChave(c, ctx, `${SEGREDO}-outro`)).rejects.toThrow('Não foi possível decifrar');
    await expect(cifrarChave(CHAVE, ctx, 'curto')).rejects.toThrow();
  });
  it('formato v1 obrigatório e adulteração detectada', async () => {
    await expect(decifrarChave(CHAVE, ctx, SEGREDO)).rejects.toThrow('formato');
    const c = await cifrarChave(CHAVE, ctx, SEGREDO);
    const partes = c.split('.');
    const adulterada = [partes[0], partes[1], partes[2], partes[3].slice(0, -2) + (partes[3].endsWith('AA') ? 'BB' : 'AA')].join('.');
    await expect(decifrarChave(adulterada, ctx, SEGREDO)).rejects.toThrow('Não foi possível decifrar');
  });
});
