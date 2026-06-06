export type SignedRequestPayload = {
  bodyHash: string;
  method: string;
  nonce: string;
  path: string;
  timestamp: string;
};
