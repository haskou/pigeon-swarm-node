import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelPermissions } from './CommunityChannelPermissions';
import { CommunityChannelId } from './value-objects/CommunityChannelId';
import { CommunityChannelName } from './value-objects/CommunityChannelName';

export class CommunityVoiceChannel {
  public static create(name: CommunityChannelName): CommunityVoiceChannel {
    return new CommunityVoiceChannel(
      CommunityChannelId.generate(),
      name,
      CommunityChannelPermissions.visibleForEveryone(),
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityVoiceChannel>,
  ): CommunityVoiceChannel {
    return new CommunityVoiceChannel(
      new CommunityChannelId(primitives.id),
      new CommunityChannelName(primitives.name),
      CommunityChannelPermissions.fromPrimitives(primitives.permissions),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly id: CommunityChannelId,
    private name: CommunityChannelName,
    private readonly permissions: CommunityChannelPermissions,
    private readonly createdAt: Timestamp,
  ) {}

  private type(): 'voice' {
    return 'voice';
  }

  public getId(): CommunityChannelId {
    return this.id;
  }

  public rename(name: CommunityChannelName): void {
    this.name = name;
  }

  public getPermissions(): CommunityChannelPermissions {
    return this.permissions;
  }

  public updatePermissions(permissions: CommunityChannelPermissions): void {
    this.permissions.updateVisibleRoleIds(permissions.getVisibleRoleIds());
  }

  public toPrimitives() {
    return {
      createdAt: this.createdAt.valueOf(),
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      permissions: this.permissions.toPrimitives(),
      type: this.type(),
    };
  }
}
