import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelMessageEncryptedPayload } from './value-objects/CommunityChannelMessageEncryptedPayload';
import { CommunityId } from './value-objects/CommunityId';

export class CommunityChannelDraft {
  constructor(
    private readonly communityId: CommunityId,
    private readonly channelId: CommunityChannelId,
    private readonly encryptedPayload: CommunityChannelMessageEncryptedPayload,
    private readonly updatedAt: Timestamp,
  ) {}

  public getChannelId(): CommunityChannelId {
    return this.channelId;
  }

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getEncryptedPayload(): CommunityChannelMessageEncryptedPayload {
    return this.encryptedPayload;
  }

  public getUpdatedAt(): Timestamp {
    return this.updatedAt;
  }
}
