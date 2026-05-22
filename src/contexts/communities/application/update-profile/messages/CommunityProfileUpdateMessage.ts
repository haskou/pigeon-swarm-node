import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityAvatar } from '../../../domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '../../../domain/value-objects/CommunityBanner';
import { CommunityDescription } from '../../../domain/value-objects/CommunityDescription';
import { CommunityName } from '../../../domain/value-objects/CommunityName';

export class CommunityProfileUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly avatar?: CommunityAvatar;
  public readonly banner?: CommunityBanner;
  public readonly description: CommunityDescription;
  public readonly discoverable?: boolean;
  public readonly name: CommunityName;

  constructor(
    actorIdentityId: string,
    name: string,
    description: string,
    avatar?: string,
    banner?: string,
    discoverable?: boolean,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.name = new CommunityName(name);
    this.description = new CommunityDescription(description);
    this.avatar = avatar ? new CommunityAvatar(avatar) : undefined;
    this.banner = banner ? new CommunityBanner(banner) : undefined;
    this.discoverable = discoverable;
  }
}
