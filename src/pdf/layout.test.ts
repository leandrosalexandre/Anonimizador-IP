import { describe, expect, it } from 'vitest';
import { classifyPage, countAlnum, groupLines, linesToText } from './layout';

const item = (str: string, x: number, y: number, width = str.length * 5, fontSize = 10) => ({
  str,
  x,
  y,
  width,
  fontSize,
});

describe('layout', () => {
  it('ordena por linha e por posição horizontal, inserindo espaços', () => {
    const lines = groupLines([
      item('mundo', 60, 100.4),
      item('Olá', 30, 100),
      item('segunda', 30, 114),
      item('linha', 70, 114.3),
    ]);
    expect(linesToText(lines)).toBe('Olá mundo\nsegunda linha');
  });

  it('não insere espaço entre pedaços colados da mesma palavra', () => {
    expect(linesToText(groupLines([item('Inqué', 10, 50, 25), item('rito', 35, 50)]))).toBe(
      'Inquérito',
    );
  });

  it('separa parágrafos por linha em branco', () => {
    expect(linesToText(groupLines([item('A', 10, 50), item('B', 10, 120)]))).toBe('A\n\nB');
  });

  it('classifica a página pela quantidade de texto útil', () => {
    expect(countAlnum('fls. 12 — ok!')).toBe(7);
    expect(classifyPage('Fls. 3')).toBe('image');
    expect(classifyPage('Termo de declarações da vítima, prestado nesta data')).toBe('text');
  });
});
