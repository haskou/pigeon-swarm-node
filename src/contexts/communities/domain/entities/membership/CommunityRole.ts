import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityPermission } from '../../value-objects/CommunityPermission';
import { CommunityRoleId } from '../../value-objects/CommunityRoleId';
import { CommunityRoleName } from '../../value-objects/CommunityRoleName';

export class CommunityRole {
  public static everyone(): CommunityRole {
    return new CommunityRole(
      CommunityRoleId.everyone(),
      new CommunityRoleName('everyone'),
      CommunityPermission.basicMemberPermissions(),
      true,
    );
  }

  public static create(
    name: CommunityRoleName,
    permissions: CommunityPermission[],
  ): CommunityRole {
    return new CommunityRole(
      CommunityRoleId.generate(),
      name,
      permissions,
      false,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityRole>,
  ): CommunityRole {
    return new CommunityRole(
      new CommunityRoleId(primitives.id),
      new CommunityRoleName(primitives.name),
      primitives.permissions.map(
        (permission) => new CommunityPermission(permission),
      ),
      primitives.builtIn,
    );
  }

  constructor(
    private readonly id: CommunityRoleId,
    private name: CommunityRoleName,
    private permissions: CommunityPermission[],
    private readonly builtIn: boolean,
  ) {}

  public getId(): CommunityRoleId {
    return this.id;
  }

  public isBuiltIn(): boolean {
    return this.builtIn;
  }

  public allows(permission: CommunityPermission): boolean {
    return this.permissions.some((candidate) => candidate.isEqual(permission));
  }

  public rename(name: CommunityRoleName): void {
    this.name = name;
  }

  public updatePermissions(permissions: CommunityPermission[]): void {
    this.permissions = permissions;
  }

  public toPrimitives() {
    return {
      builtIn: this.builtIn,
      id: this.id.valueOf(),
      name: this.name.valueOf(),
      permissions: this.permissions.map((permission) => permission.valueOf()),
    };
  }
}
