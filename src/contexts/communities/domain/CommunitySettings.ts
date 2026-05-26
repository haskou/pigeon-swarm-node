import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityVisibility } from './value-objects/CommunityVisibility';

export class CommunitySettings {
  public static create(
    discoverable: boolean,
    visibility = CommunityVisibility.PRIVATE,
  ): CommunitySettings {
    return new CommunitySettings(Timestamp.now(), discoverable, visibility);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunitySettings>,
  ): CommunitySettings {
    return new CommunitySettings(
      new Timestamp(primitives.createdAt),
      primitives.discoverable ?? true,
      new CommunityVisibility(primitives.visibility ?? 'private'),
    );
  }

  constructor(
    private readonly createdAt: Timestamp,
    private discoverable: boolean,
    private readonly visibility: CommunityVisibility,
  ) {}

  public updateDiscoverable(discoverable: boolean): void {
    this.discoverable = discoverable;
  }

  public getVisibility(): CommunityVisibility {
    return this.visibility;
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      discoverable: this.discoverable,
      visibility: this.visibility.valueOf(),
    };
  }
}
