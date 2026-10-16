import { SignedHttpRequestSignature } from '@haskou/pigeon-swarm-crypto';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';

export function assertSignedRequestTimestampIsFresh(timestamp: string): void {
  if (!SignedHttpRequestSignature.isFresh(Number(timestamp), Date.now())) {
    throw new InvalidSignedRequestError();
  }
}
