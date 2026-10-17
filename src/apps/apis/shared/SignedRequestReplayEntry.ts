/**
 * One signature the replay guard accepted: when it expires, who signed it and,
 * for a signer the node does not serve, the client address it is charged to.
 */
export interface SignedRequestReplayEntry {
  expiration: number;
  signer: string;
  strangerSource?: string;
}
