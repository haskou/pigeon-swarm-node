import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

export class CommunitySettings {
  public static create(
    createdAt: Timestamp,
    discoverable: boolean,
  ): CommunitySettings {
    return new CommunitySettings(createdAt, discoverable);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunitySettings>,
  ): CommunitySettings {
    return new CommunitySettings(
      new Timestamp(primitives.createdAt),
      primitives.discoverable ?? true,
    );
  }

  constructor(
    private readonly createdAt: Timestamp,
    private discoverable: boolean,
  ) {}

  public updateDiscoverable(discoverable: boolean): void {
    this.discoverable = discoverable;
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      discoverable: this.discoverable,
    };
  }
}
