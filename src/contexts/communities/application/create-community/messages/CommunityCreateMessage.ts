import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';

import { CommunityProfile } from '../../../domain/entities/profile/CommunityProfile';
import { CommunitySettings } from '../../../domain/entities/profile/CommunitySettings';
import { CommunityAvatar } from '../../../domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '../../../domain/value-objects/CommunityBanner';
import { CommunityDescription } from '../../../domain/value-objects/CommunityDescription';
import { CommunityName } from '../../../domain/value-objects/CommunityName';
import {
  CommunityVisibility,
  CommunityVisibilityValue,
} from '../../../domain/value-objects/CommunityVisibility';

export class CommunityCreateMessage {
  public readonly networkId: NetworkId;
  public readonly ownerIdentityId: IdentityId;
  public readonly profile: CommunityProfile;
  public readonly settings: CommunitySettings;

  constructor(
    ownerIdentityId: string,
    networkId: string,
    name: string,
    description: string,
    avatar?: string,
    banner?: string,
    options: {
      autoJoinEnabled?: boolean;
      discoverable?: boolean;
      visibility?: CommunityVisibilityValue;
    } = {},
  ) {
    this.ownerIdentityId = new IdentityId(ownerIdentityId);
    this.networkId = new NetworkId(networkId);
    this.profile = new CommunityProfile(
      new CommunityName(name),
      new CommunityDescription(description),
      avatar ? new CommunityAvatar(avatar) : undefined,
      banner ? new CommunityBanner(banner) : undefined,
    );
    this.settings = CommunitySettings.create(
      options.discoverable ?? true,
      new CommunityVisibility(options.visibility ?? 'private'),
      options.autoJoinEnabled ?? false,
    );
  }
}
