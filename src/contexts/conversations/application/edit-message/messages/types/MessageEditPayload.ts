export type MessageEditPayload = {
  createdAt: number;
  encryptedPayload: string;
  id: string;
  previousMessageIds?: string[];
  signature: string;
};
