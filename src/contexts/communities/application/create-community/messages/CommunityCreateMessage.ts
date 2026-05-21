import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityAvatar } from '../../../domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '../../../domain/value-objects/CommunityBanner';
import { CommunityDescription } from '../../../domain/value-objects/CommunityDescription';
import { CommunityName } from '../../../domain/value-objects/CommunityName';

export class CommunityCreateMessage {
  public readonly avatar?: CommunityAvatar;
  public readonly banner?: CommunityBanner;
  public readonly discoverable: boolean;
  public readonly description: CommunityDescription;
  public readonly name: CommunityName;
  public readonly networkId: NetworkId;
  public readonly ownerIdentityId: IdentityId;

  constructor(
    ownerIdentityId: string,
    networkId: string,
    name: string,
    description: string,
    avatar?: string,
    banner?: string,
    discoverable = true,
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.networkId = new NetworkId(networkId);
    this.name = new CommunityName(name);
    this.description = new CommunityDescription(description);
    this.avatar = avatar ? new CommunityAvatar(avatar) : undefined;
    this.banner = banner ? new CommunityBanner(banner) : undefined;
    this.discoverable = discoverable;
  }
}
