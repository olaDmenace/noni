// Application-layer AES-256-GCM for agent session notes (F-017, arch §9.2).
// Output format: base64(iv):base64(authTag):base64(ciphertext)
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.NOTE_ENCRYPTION_KEY, 'hex');

export function encryptNote(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptNote(payload: string): string {
  const [iv, tag, data] = payload.split(':');
  if (!iv || !tag || !data) throw new Error('Malformed encrypted note');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
