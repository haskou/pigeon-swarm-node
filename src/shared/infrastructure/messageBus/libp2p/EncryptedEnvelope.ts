export interface EncryptedEnvelope {
  algorithm: 'aes-256-gcm';
  encrypted: true;
  iv: string;
  payload: string;
  tag: string;
}
