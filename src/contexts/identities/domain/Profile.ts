import { PrimitiveOf } from '@haskou/value-objects';

import { ProfileBiography } from './value-objects/ProfileBiography';
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
    );
  }

  constructor(
    public readonly name: ProfileName,
    public readonly biography?: ProfileBiography,
    public readonly picture?: ProfileImage,
  ) {}

  public toPrimitives() {
    return {
      biography: this.biography?.valueOf(),
      name: this.name.valueOf(),
      picture: this.picture?.valueOf(),
    };
  }
}
