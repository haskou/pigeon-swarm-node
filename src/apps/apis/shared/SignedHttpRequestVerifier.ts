import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  canonicalSignedRequestPayload,
  SignedRequestPayload,
} from '@app/contexts/shared/domain/value-objects/SignedRequestPayload';
import { PublicKey, Signature } from '@haskou/pigeon-swarm-crypto';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from './errors/MissingSignedRequestHeaderError';
import { SignedHttpRequest } from './SignedHttpRequest';

export type { SignedHttpRequest } from './SignedHttpRequest';

export class SignedHttpRequestVerifier {
  private getCanonicalTimestamp(timestamp: number | string): number {
    const canonicalTimestamp = Number(timestamp);

    if (!Number.isInteger(canonicalTimestamp)) {
      throw new InvalidSignedRequestError();
    }

    return canonicalTimestamp;
  }

  public getRequiredHeader(request: SignedHttpRequest, header: string): string {
    const value = request.header(header);
    const normalizedValue = Array.isArray(value) ? value[0] : value;

    if (!normalizedValue) {
      throw new MissingSignedRequestHeaderError(header);
    }

    return normalizedValue;
  }

  public getCanonicalPayload(
    method: string,
    path: string,
    timestamp: number | string,
    body: unknown,
  ): SignedRequestPayload {
    return canonicalSignedRequestPayload(
      method,
      path,
      this.getCanonicalTimestamp(timestamp),
      body,
    );
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
    const payload = this.getCanonicalPayload(
      request.method,
      request.path,
      timestamp,
      request.body,
    );
    const isValid = PublicKey.fromPEM(identityId.toString()).isValidSignature(
      JSON.stringify(payload),
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
