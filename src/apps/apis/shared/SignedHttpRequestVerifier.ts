import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PublicKey, Signature } from '@haskou/value-objects';
import { createHash } from 'crypto';
import { Request } from 'express';

import { InvalidSignedRequestError } from './errors/InvalidSignedRequestError';
import { MissingSignedRequestHeaderError } from './errors/MissingSignedRequestHeaderError';

type SignedRequestPayload = {
  bodyHash: string;
  method: string;
  nonce: string;
  path: string;
  timestamp: string;
};

export class SignedHttpRequestVerifier {
  private getRequiredHeader(request: Request, header: string): string {
    const value = request.header(header);

    if (!value) {
      throw new MissingSignedRequestHeaderError(header);
    }

    return value;
  }

  private hashBody(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body || {}))
      .digest('hex');
  }

  public getCanonicalPayload(
    method: string,
    path: string,
    timestamp: string,
    nonce: string,
    body: unknown,
  ): SignedRequestPayload {
    return {
      bodyHash: this.hashBody(body),
      method: method.toUpperCase(),
      nonce,
      path,
      timestamp,
    };
  }

  public verify(request: Request): IdentityId {
    const identityId = new IdentityId(
      this.getRequiredHeader(request, 'x-identity-id'),
    );
    const timestamp = this.getRequiredHeader(request, 'x-timestamp');
    const nonce = this.getRequiredHeader(request, 'x-nonce');
    const signature = new Signature(
      this.getRequiredHeader(request, 'x-signature'),
    );
    const payload = this.getCanonicalPayload(
      request.method,
      request.path,
      timestamp,
      nonce,
      request.body,
    );
    const isValid = PublicKey.fromPEM(identityId.toString()).isValidSignature(
      JSON.stringify(payload),
      signature,
    );

    if (!isValid) {
      throw new InvalidSignedRequestError();
    }

    return identityId;
  }
}
