import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageDeletion } from '../../../domain/entities/messages/CommunityChannelMessageDeletion';
import { CommunityChannelMessageSignaturePayload } from '../../../domain/entities/messages/CommunityChannelMessageSignaturePayload';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessageDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly deletion: CommunityChannelMessageDeletion;
  public readonly signature: Signature;
  public readonly signaturePayload: CommunityChannelMessageSignaturePayload;
  public readonly targetMessageId: CommunityChannelMessageId;

  constructor(input: {
    actorIdentityId: string;
    channelId: string;
    communityId: string;
    createdAt: number;
    messageId: string;
    signature: string;
    targetMessageId: string;
  }) {
    this.actorIdentityId = new IdentityId(input.actorIdentityId);
    this.communityId = new CommunityId(input.communityId);
    this.channelId = new CommunityChannelId(input.channelId);
    this.targetMessageId = new CommunityChannelMessageId(input.targetMessageId);
    this.signature = new Signature(input.signature);
    this.deletion = new CommunityChannelMessageDeletion(
      new CommunityChannelMessageId(input.messageId),
      this.signature,
      new Timestamp(input.createdAt),
    );
    this.signaturePayload =
      CommunityChannelMessageSignaturePayload.fromPrimitives({
        actorIdentityId: input.actorIdentityId,
        channelId: input.channelId,
        communityId: input.communityId,
        createdAt: input.createdAt,
        id: input.messageId,
        targetMessageId: input.targetMessageId,
        type: 'deleted',
      });
  }
}
