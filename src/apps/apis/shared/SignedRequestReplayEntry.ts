/**
 * One signature the replay guard accepted: when it expires, who signed it, the
 * client address it is charged to and whether the signer is one this node does
 * not serve.
 */
export interface SignedRequestReplayEntry {
  expiration: number;
  signer: string;
  source: string;
  stranger: boolean;
}
