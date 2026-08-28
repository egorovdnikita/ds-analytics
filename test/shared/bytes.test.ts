import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from '../../src/shared/bytes';

describe('длина в байтах UTF-8', () => {
  it('латиница — байт на символ', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('кириллица — два байта на символ', () => {
    // Ровно та причина, по которой длина строки не годится для лимита
    // pluginData: «я» весит вдвое больше «a».
    expect(utf8ByteLength('яяя')).toBe(6);
  });

  it('эмодзи считается по кодовой точке, а не по единицам UTF-16', () => {
    expect(utf8ByteLength('💙')).toBe(4);
  });

  it('пустая строка — ноль', () => {
    expect(utf8ByteLength('')).toBe(0);
  });
});
