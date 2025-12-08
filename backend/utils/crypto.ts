import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.FACE_ENC_KEY_BASE64!, 'base64'); // 32 bytes

export function encryptFaceEncoding(plainNums: number[]): string {
  const iv = crypto.randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(plainNums));
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64'); // store this string
}

export function decryptFaceEncoding(b64: string): number[] {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.slice(0,12);
  const tag = buf.slice(12,28);
  const ciphertext = buf.slice(28);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString()) as number[];
}