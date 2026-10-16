import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  PublicKey,
  Signature,
  SignedHttpRequestBody,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from './errors/MissingSignedRequestHeaderError';
import { SignedHttpRequest } from './SignedHttpRequest';

export type { SignedHttpRequest } from './SignedHttpRequest';

export class SignedHttpRequestVerifier {
  public getRequiredHeader(request: SignedHttpRequest, header: string): string {
    const value = request.header(header);
    const normalizedValue = Array.isArray(value) ? value[0] : value;

    if (!normalizedValue) {
      throw new MissingSignedRequestHeaderError(header);
    }

    return normalizedValue;
  }

  /**
   * Verifies that `key` signed the request at `timestamp` with `signature`,
   * which must be the single canonical encoding of the signature bytes.
   */
  public verifyWith(
    request: SignedHttpRequest,
    timestamp: string,
    signature: string,
    key: PublicKey,
  ): Signature {
    try {
      const parsed = new Signature(signature);
      SignedHttpRequestSignature.verify(
        {
          body: request.body as SignedHttpRequestBody,
          method: request.method,
          path: request.path,
          timestamp: Number(timestamp),
        },
        parsed,
        key,
      );

      return parsed;
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  public verifySignature(request: SignedHttpRequest): {
    identityId: IdentityId;
    signature: Signature;
    timestamp: string;
  } {
    const identityId = new IdentityId(
      this.getRequiredHeader(request, 'x-identity-id'),
    );
    const timestamp = this.getRequiredHeader(request, 'x-timestamp');
    const signature = this.verifyWith(
      request,
      timestamp,
      this.getRequiredHeader(request, 'x-signature'),
      PublicKey.fromPEM(identityId.toString()),
    );

    return { identityId, signature, timestamp };
  }

  public verify(request: SignedHttpRequest): IdentityId {
    return this.verifySignature(request).identityId;
  }
}
