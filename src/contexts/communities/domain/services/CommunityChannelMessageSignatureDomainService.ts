import { PublicKey, Signature } from '@haskou/value-objects';

import { CommunityChannelMessage } from '../CommunityChannelMessage';

type CommunityChannelMessageSignaturePayload = Omit<
  ReturnType<CommunityChannelMessage['toPrimitives']>,
  'signature'
>;

export class CommunityChannelMessageSignatureDomainService {
  private getCanonicalPayload(
    payload: CommunityChannelMessageSignaturePayload,
  ): CommunityChannelMessageSignaturePayload {
    return {
      attachmentExternalIdentifiers: payload.attachmentExternalIdentifiers,
      authorIdentityId: payload.authorIdentityId,
      channelId: payload.channelId,
      communityId: payload.communityId,
      createdAt: payload.createdAt,
      encryptedPayload: payload.encryptedPayload,
      id: payload.id,
      type: payload.type,
    };
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: CommunityChannelMessageSignaturePayload,
    signature: Signature,
  ): boolean {
    return publicKey.isValidSignature(
      JSON.stringify(this.getCanonicalPayload(payload)),
      signature,
    );
  }
}
