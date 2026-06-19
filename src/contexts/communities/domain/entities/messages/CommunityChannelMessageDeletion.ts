import { Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageId } from '../../value-objects/CommunityChannelMessageId';

export class CommunityChannelMessageDeletion {
  constructor(
    private readonly id: CommunityChannelMessageId,
    private readonly signature: Signature,
    private readonly createdAt: Timestamp,
  ) {}

  public getId(): CommunityChannelMessageId {
    return this.id;
  }

  public getCreatedAt(): Timestamp {
    return this.createdAt;
  }

  public getSignature(): Signature {
    return this.signature;
  }
}
