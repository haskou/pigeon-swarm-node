import { CommunityAvatar } from './value-objects/CommunityAvatar';
import { CommunityBanner } from './value-objects/CommunityBanner';
import { CommunityDescription } from './value-objects/CommunityDescription';
import { CommunityName } from './value-objects/CommunityName';

export class CommunityProfile {
  constructor(
    private readonly name: CommunityName,
    private readonly description: CommunityDescription,
    private readonly avatar?: CommunityAvatar,
    private readonly banner?: CommunityBanner,
  ) {}

  public getName(): CommunityName {
    return this.name;
  }

  public getDescription(): CommunityDescription {
    return this.description;
  }

  public getAvatar(): CommunityAvatar | undefined {
    return this.avatar;
  }

  public getBanner(): CommunityBanner | undefined {
    return this.banner;
  }
}
