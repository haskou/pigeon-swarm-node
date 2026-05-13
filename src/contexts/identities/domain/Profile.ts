import { PrimitiveOf } from '@haskou/value-objects';

import { ProfileBanner } from './value-objects/ProfileBanner';
import { ProfileBiography } from './value-objects/ProfileBiography';
import { ProfileHandle } from './value-objects/ProfileHandle';
import { ProfileImage } from './value-objects/ProfileImage';
import { ProfileName } from './value-objects/ProfileName';

export class Profile {
  public static fromPrimitives(primitives: PrimitiveOf<Profile>): Profile {
    return new Profile(
      new ProfileName(primitives.name),
      primitives.biography
        ? new ProfileBiography(primitives.biography)
        : undefined,
      primitives.picture ? new ProfileImage(primitives.picture) : undefined,
      primitives.banner ? new ProfileBanner(primitives.banner) : undefined,
      primitives.handle ? new ProfileHandle(primitives.handle) : undefined,
    );
  }

  constructor(
    private readonly name: ProfileName,
    private readonly biography?: ProfileBiography,
    private readonly picture?: ProfileImage,
    private readonly banner?: ProfileBanner,
    private readonly handle?: ProfileHandle,
  ) {}

  public toPrimitives() {
    return {
      banner: this.banner?.valueOf(),
      biography: this.biography?.valueOf(),
      handle: this.handle?.valueOf(),
      name: this.name.valueOf(),
      picture: this.picture?.valueOf(),
    };
  }
}
