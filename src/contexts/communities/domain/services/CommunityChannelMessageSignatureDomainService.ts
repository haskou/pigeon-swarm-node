import { PublicKey, Signature } from '@haskou/value-objects';

import { CommunityChannelMessage } from '../CommunityChannelMessage';

type CommunityChannelMessageSignaturePayload = Omit<
  ReturnType<CommunityChannelMessage['toPrimitives']>,
  'signature'
>;
type CommunityChannelMessageDeletionSignaturePayload = {
  actorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  id: string;
  targetMessageId: string;
  type: 'deleted';
};
type CommunityChannelSignaturePayload =
  | CommunityChannelMessageSignaturePayload
  | CommunityChannelMessageDeletionSignaturePayload;

export class CommunityChannelMessageSignatureDomainService {
  private getCanonicalPayload(
    payload: CommunityChannelSignaturePayload,
  ): CommunityChannelSignaturePayload {
    if (payload.type === 'deleted') {
      return {
        actorIdentityId: payload.actorIdentityId,
        channelId: payload.channelId,
        communityId: payload.communityId,
        createdAt: payload.createdAt,
        id: payload.id,
        targetMessageId: payload.targetMessageId,
        type: payload.type,
      };
    }

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

  public serializePayload(payload: CommunityChannelSignaturePayload): string {
    return JSON.stringify(this.getCanonicalPayload(payload));
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: CommunityChannelSignaturePayload,
    signature: Signature,
  ): boolean {
    return publicKey.isValidSignature(
      this.serializePayload(payload),
      signature,
    );
  }
}
