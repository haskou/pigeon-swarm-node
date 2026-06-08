export type PrivateNetworkRelayRecordEnvelope = {
  encryptedRelayRecord: {
    algorithm: 'aes-256-gcm';
    authTag: string;
    ciphertext: string;
    iv: string;
  };
  version: 2;
};
