import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from '../../../domain/value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelDraftSaveMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly encryptedPayload: CommunityChannelMessageEncryptedPayload;
  public readonly updatedAt: Timestamp;

  constructor(
    actorIdentityId: string,
    communityId: string,
    channelId: string,
    encryptedPayload: string,
    updatedAt?: number,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.channelId = new CommunityChannelId(channelId);
    this.encryptedPayload = new CommunityChannelMessageEncryptedPayload(
      encryptedPayload,
    );
    this.updatedAt = updatedAt ? new Timestamp(updatedAt) : Timestamp.now();
  }
}
