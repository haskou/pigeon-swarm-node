export interface RestResponseData {
  [key: string]: unknown;
  cid?: string;
  expiresAt?: number;
  id?: string;
  inviteToken?: string;
  keychainExternalIdentifier?: string;
  results?: RestResponseData[];
  signalId?: string;
  stickers?: RestResponseData[];
}
