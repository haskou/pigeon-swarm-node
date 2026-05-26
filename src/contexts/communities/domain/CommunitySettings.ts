import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityVisibility } from './value-objects/CommunityVisibility';

export class CommunitySettings {
  public static create(
    discoverable: boolean,
    visibility = CommunityVisibility.PRIVATE,
    autoJoinEnabled = false,
  ): CommunitySettings {
    return new CommunitySettings(
      Timestamp.now(),
      discoverable,
      visibility,
      autoJoinEnabled,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunitySettings>,
  ): CommunitySettings {
    return new CommunitySettings(
      new Timestamp(primitives.createdAt),
      primitives.discoverable ?? true,
      new CommunityVisibility(primitives.visibility ?? 'private'),
      primitives.autoJoinEnabled ?? false,
    );
  }

  constructor(
    private readonly createdAt: Timestamp,
    private discoverable: boolean,
    private readonly visibility: CommunityVisibility,
    private autoJoinEnabled: boolean,
  ) {}

  public updateDiscoverable(discoverable: boolean): void {
    this.discoverable = discoverable;
  }

  public updateAutoJoinEnabled(autoJoinEnabled: boolean): void {
    this.autoJoinEnabled = autoJoinEnabled;
  }

  public getVisibility(): CommunityVisibility {
    return this.visibility;
  }

  public isAutoJoinEnabled(): boolean {
    return this.autoJoinEnabled;
  }

  public toPrimitives() {
    return {
      autoJoinEnabled: this.autoJoinEnabled,
      createdAt: this.createdAt.valueOf(),
      discoverable: this.discoverable,
      visibility: this.visibility.valueOf(),
    };
  }
}
