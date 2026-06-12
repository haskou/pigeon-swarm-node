export type SignedRequestPayload = {
  bodyHash: string;
  method: string;
  path: string;
  timestamp: number;
};
