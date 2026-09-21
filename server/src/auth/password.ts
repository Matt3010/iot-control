import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Una password non si conserva: si conserva una derivata e il suo sale. */
export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, KEY_LENGTH)).toString('hex');
  return { salt, hash };
}

/** Confronto a tempo costante: la lunghezza della risposta non deve dire nulla. */
export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const expected = Buffer.from(hash, 'hex');
  const actual = await derive(password, salt, KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
