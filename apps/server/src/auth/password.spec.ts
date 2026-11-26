import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('哈希后可正确校验', async () => {
    const stored = await hashPassword('S3cret!');
    expect(stored.startsWith('scrypt:')).toBe(true);
    await expect(verifyPassword('S3cret!', stored)).resolves.toBe(true);
  });

  it('错误密码校验失败', async () => {
    const stored = await hashPassword('S3cret!');
    await expect(verifyPassword('wrong', stored)).resolves.toBe(false);
  });

  it('同一密码两次哈希结果不同（随机盐）', async () => {
    const a = await hashPassword('S3cret!');
    const b = await hashPassword('S3cret!');
    expect(a).not.toBe(b);
  });

  it('格式不符的存量哈希一律校验失败', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt::')).resolves.toBe(false);
  });
});
