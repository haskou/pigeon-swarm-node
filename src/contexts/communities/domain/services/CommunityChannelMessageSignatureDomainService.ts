import { PublicKey, Signature } from '@haskou/value-objects';

import { CommunityChannelMessage } from '../CommunityChannelMessage';

type CommunityChannelMessageMentionPrimitives = ReturnType<
  CommunityChannelMessage['toPrimitives']
>['mentions'];

type CommunityChannelMessageSignaturePayload = {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  mentions?: CommunityChannelMessageMentionPrimitives;
  plaintextPayload?: string;
  type: 'poll' | 'sent';
};
type CommunityChannelMessageDeletionSignaturePayload = {
  actorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  id: string;
  targetMessageId: string;
  type: 'deleted';
};
type CommunityChannelMessageEditionSignaturePayload = {
  attachmentExternalIdentifiers: string[];
  authorIdentityId: string;
  channelId: string;
  communityId: string;
  createdAt: number;
  encryptedPayload?: string;
  id: string;
  mentions?: CommunityChannelMessageMentionPrimitives;
  plaintextPayload?: string;
  type: 'edited';
};
type CommunityChannelSignaturePayload =
  | CommunityChannelMessageSignaturePayload
  | CommunityChannelMessageDeletionSignaturePayload
  | CommunityChannelMessageEditionSignaturePayload;

export class CommunityChannelMessageSignatureDomainService {
  private isMessagePayload(
    payload: CommunityChannelSignaturePayload,
  ): payload is
    | CommunityChannelMessageSignaturePayload
    | CommunityChannelMessageEditionSignaturePayload {
    return payload.type === 'sent' || payload.type === 'edited';
  }

  private mentions(
    mentions: CommunityChannelMessageSignaturePayload['mentions'],
  ): CommunityChannelMessageSignaturePayload['mentions'] | undefined {
    return mentions && mentions.length > 0 ? mentions : undefined;
  }

  private getCanonicalDeletionPayload(
    payload: CommunityChannelMessageDeletionSignaturePayload,
  ): CommunityChannelMessageDeletionSignaturePayload {
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

  private getCanonicalEditionPayload(
    payload: CommunityChannelMessageEditionSignaturePayload,
  ): CommunityChannelMessageEditionSignaturePayload {
    return {
      attachmentExternalIdentifiers: payload.attachmentExternalIdentifiers,
      authorIdentityId: payload.authorIdentityId,
      channelId: payload.channelId,
      communityId: payload.communityId,
      createdAt: payload.createdAt,
      encryptedPayload: payload.encryptedPayload,
      id: payload.id,
      mentions: this.mentions(payload.mentions),
      plaintextPayload: payload.plaintextPayload,
      type: payload.type,
    };
  }

  private getCanonicalSentPayload(
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
      mentions: this.mentions(payload.mentions),
      plaintextPayload: payload.plaintextPayload,
      type: payload.type,
    };
  }

  private getCanonicalMessagePayload(
    payload:
      | CommunityChannelMessageSignaturePayload
      | CommunityChannelMessageEditionSignaturePayload,
  ):
    | CommunityChannelMessageSignaturePayload
    | CommunityChannelMessageEditionSignaturePayload {
    return payload.type === 'edited'
      ? this.getCanonicalEditionPayload(payload)
      : this.getCanonicalSentPayload(payload);
  }

  private getCanonicalPayload(
    payload: CommunityChannelSignaturePayload,
  ): CommunityChannelSignaturePayload {
    return payload.type === 'deleted'
      ? this.getCanonicalDeletionPayload(payload)
      : this.getCanonicalMessagePayload(payload);
  }

  private getCompatibleMessagePayloads(
    payload:
      | CommunityChannelMessageSignaturePayload
      | CommunityChannelMessageEditionSignaturePayload,
  ): (
    | CommunityChannelMessageSignaturePayload
    | CommunityChannelMessageEditionSignaturePayload
  )[] {
    const canonicalPayload = this.getCanonicalMessagePayload(payload);

    if (!payload.mentions || payload.mentions.length > 0) {
      return [canonicalPayload];
    }

    return [
      canonicalPayload,
      {
        ...canonicalPayload,
        mentions: [],
      },
    ];
  }

  private getCompatiblePayloads(
    payload: CommunityChannelSignaturePayload,
  ): CommunityChannelSignaturePayload[] {
    if (this.isMessagePayload(payload)) {
      return this.getCompatibleMessagePayloads(payload);
    }

    return [this.getCanonicalPayload(payload)];
  }

  public serializePayload(payload: CommunityChannelSignaturePayload): string {
    return JSON.stringify(this.getCanonicalPayload(payload));
  }

  public isValidSignature(
    publicKey: PublicKey,
    payload: CommunityChannelSignaturePayload,
    signature: Signature,
  ): boolean {
    return this.getCompatiblePayloads(payload).some((compatiblePayload) =>
      publicKey.isValidSignature(JSON.stringify(compatiblePayload), signature),
    );
  }
}
