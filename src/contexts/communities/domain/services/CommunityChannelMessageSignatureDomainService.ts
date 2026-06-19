import { assert, PublicKey, Signature } from '@haskou/value-objects';

import { CommunityChannelMessageSignaturePayload } from '../entities/messages/CommunityChannelMessageSignaturePayload';
import { InvalidCommunityChannelMessageSignatureError } from '../errors/InvalidCommunityChannelMessageSignatureError';

export default class CommunityChannelMessageSignatureDomainService {
  public getCanonicalSigningContent(
    payload: CommunityChannelMessageSignaturePayload,
  ): string {
    return JSON.stringify(payload.toPrimitives());
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: CommunityChannelMessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return payload
      .toSigningPrimitiveCandidates()
      .some((candidate) =>
        publicKey.isValidSignature(JSON.stringify(candidate), signature),
      );
  }

  public assertValidSignature(
    publicKey: PublicKey,
    payload: CommunityChannelMessageSignaturePayload,
    signature: Signature,
  ): void {
    assert(
      this.isValidSignature(publicKey, payload, signature),
      new InvalidCommunityChannelMessageSignatureError(),
    );
  }
}
