import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM: único segredo de longa duração guardado neste projeto que
// dá acesso a uma conta Google de verdade (ver comentário em
// schema.prisma, model GoogleCredential) -- todo outro token da
// plataforma é de vida curta (sessão interna, link de apresentação,
// sessão de portal). GCM em vez de CBC porque autentica o ciphertext
// (authTag) -- sem isso, um ciphertext adulterado só falharia de um jeito
// silencioso e imprevisível na hora de decodificar UTF-8, não travaria
// alto e claro como GCM trava.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // padrão recomendado do próprio Node para GCM

function loadKey(): Buffer {
  const raw = process.env.GOOGLE_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_CREDENTIAL_ENCRYPTION_KEY não configurado -- necessário pra guardar/ler credencial do Google.',
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'GOOGLE_CREDENTIAL_ENCRYPTION_KEY precisa ter 32 bytes em hex (64 caracteres).',
    );
  }
  return key;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptRefreshToken(plainText: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptRefreshToken(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, loadKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plainText = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plainText.toString('utf8');
}
