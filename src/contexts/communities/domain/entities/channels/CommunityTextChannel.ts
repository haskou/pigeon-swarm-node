import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../value-objects/CommunityChannelId';
import { CommunityChannelName } from '../../value-objects/CommunityChannelName';
import { CommunityChannelType } from '../../value-objects/CommunityChannelType';
import { CommunityChannelPermissions } from './CommunityChannelPermissions';

export class CommunityTextChannel {
  public static create(
    name: CommunityChannelName,
    id: CommunityChannelId = CommunityChannelId.generate(),
    createdAt: Timestamp = Timestamp.now(),
  ): CommunityTextChannel {
    return new CommunityTextChannel(
      id,
      name,
      CommunityChannelPermissions.visibleForEveryone(),
      createdAt,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityTextChannel>,
  ): CommunityTextChannel {
    return new CommunityTextChannel(
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
      type: CommunityChannelType.textPrimitive(),
    };
  }
}
