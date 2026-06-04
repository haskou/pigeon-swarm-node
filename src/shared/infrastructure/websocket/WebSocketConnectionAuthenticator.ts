import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PublicKey, Signature } from '@haskou/value-objects';
import { IncomingMessage } from 'http';

import { WebSocketCredentials } from './WebSocketCredentials';

export class WebSocketConnectionAuthenticator {
  private static readonly maximumClockSkewInMilliseconds = 5 * 60 * 1000;
  private static readonly usedNonces = new Set<string>();

  private ensureNonceHasNotBeenUsed(
    identityId: IdentityId,
    nonce: string,
  ): void {
    const nonceKey = `${identityId.toString()}:${nonce}`;

    if (WebSocketConnectionAuthenticator.usedNonces.has(nonceKey)) {
      throw new InvalidSignedRequestError();
    }

    WebSocketConnectionAuthenticator.usedNonces.add(nonceKey);
  }

  private ensureTimestampIsFresh(timestamp: string): void {
    const timestampAsNumber = Number(timestamp);

    if (
      !Number.isInteger(timestampAsNumber) ||
      Math.abs(Date.now() - timestampAsNumber) >
        WebSocketConnectionAuthenticator.maximumClockSkewInMilliseconds
    ) {
      throw new InvalidSignedRequestError();
    }
  }

  private getCredential(
    request: IncomingMessage,
    url: URL,
    queryParam: string,
    header: string,
  ): string {
    const value =
      url.searchParams.get(queryParam) || this.getHeader(request, header);

    if (!value) {
      throw new InvalidSignedRequestError();
    }

    return value;
  }

  private getCredentials(request: IncomingMessage): WebSocketCredentials {
    const url = new URL(request.url || '/', 'http://localhost');

    return {
      identityId: this.getCredential(
        request,
        url,
        'identityId',
        'x-identity-id',
      ),
      nonce: this.getCredential(request, url, 'nonce', 'x-nonce'),
      signature: this.getCredential(request, url, 'signature', 'x-signature'),
      timestamp: this.getCredential(request, url, 'timestamp', 'x-timestamp'),
    };
  }

  private getHeader(
    request: IncomingMessage,
    header: string,
  ): string | undefined {
    const value = request.headers[header];

    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }

  public authenticate(
    request: IncomingMessage,
    websocketPath: string,
  ): IdentityId {
    const credentials = this.getCredentials(request);
    const identityId = new IdentityId(credentials.identityId);
    const canonicalPayload =
      new SignedHttpRequestVerifier().getCanonicalPayload(
        'GET',
        websocketPath,
        credentials.timestamp,
        credentials.nonce,
        {},
      );
    const isValid = PublicKey.fromPEM(identityId.toString()).isValidSignature(
      JSON.stringify(canonicalPayload),
      new Signature(credentials.signature),
    );

    if (!isValid) {
      throw new InvalidSignedRequestError();
    }

    this.ensureTimestampIsFresh(credentials.timestamp);
    this.ensureNonceHasNotBeenUsed(identityId, credentials.nonce);

    return identityId;
  }
}
