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

  /** The exact bytes the request signer signed, as the library defines them. */
  public signingContent(request: SignedHttpRequest, timestamp: string): string {
    try {
      return SignedHttpRequestSignature.signingContent({
        body: request.body as SignedHttpRequestBody,
        method: request.method,
        path: request.path,
        timestamp: Number(timestamp),
      });
    } catch {
      throw new InvalidSignedRequestError();
    }
  }

  public verifySignature(request: SignedHttpRequest): {
    identityId: IdentityId;
    timestamp: string;
  } {
    const identityId = new IdentityId(
      this.getRequiredHeader(request, 'x-identity-id'),
    );
    const timestamp = this.getRequiredHeader(request, 'x-timestamp');
    const signature = new Signature(
      this.getRequiredHeader(request, 'x-signature'),
    );
    const isValid = PublicKey.fromPEM(identityId.toString()).isValidSignature(
      this.signingContent(request, timestamp),
      signature,
    );

    if (!isValid) {
      throw new InvalidSignedRequestError();
    }

    return { identityId, timestamp };
  }

  public verify(request: SignedHttpRequest): IdentityId {
    return this.verifySignature(request).identityId;
  }
}
