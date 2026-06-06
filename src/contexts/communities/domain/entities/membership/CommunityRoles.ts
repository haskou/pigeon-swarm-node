import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, PrimitiveOf } from '@haskou/value-objects';

import { CommunityRoleCannotBeDeletedError } from '../../errors/CommunityRoleCannotBeDeletedError';
import { CommunityRoleNotFoundError } from '../../errors/CommunityRoleNotFoundError';
import { CommunityPermission } from '../../value-objects/CommunityPermission';
import { CommunityRoleId } from '../../value-objects/CommunityRoleId';
import { CommunityRoleName } from '../../value-objects/CommunityRoleName';
import { CommunityMemberRoleAssignment } from './CommunityMemberRoleAssignment';
import { CommunityRole } from './CommunityRole';

export class CommunityRoles {
  public static default(): CommunityRoles {
    return new CommunityRoles([CommunityRole.everyone()], []);
  }

  public static fromPrimitives(
    roles: PrimitiveOf<CommunityRole>[] | undefined,
    memberRoles:
      | Array<{
          identityId: string;
          roleIds: string[];
        }>
      | undefined,
  ): CommunityRoles {
    return new CommunityRoles(
      roles?.map((role) => CommunityRole.fromPrimitives(role)) || [
        CommunityRole.everyone(),
      ],
      (memberRoles || []).map((assignment) => ({
        identityId: new IdentityId(assignment.identityId),
        roleIds: assignment.roleIds.map(
          (roleId) => new CommunityRoleId(roleId),
        ),
      })),
    );
  }

  constructor(
    private readonly roles: CommunityRole[],
    private readonly memberRoles: CommunityMemberRoleAssignment[],
  ) {}

  private findRole(roleId: CommunityRoleId): CommunityRole | undefined {
    return this.roles.find((role) => role.getId().isEqual(roleId));
  }

  private assertExistingRole(roleId: CommunityRoleId): void {
    assert(this.findRole(roleId), new CommunityRoleNotFoundError());
  }

  private roleIdsFor(identityId: IdentityId): CommunityRoleId[] {
    const assignment = this.memberRoles.find((candidate) =>
      candidate.identityId.isEqual(identityId),
    );

    return [CommunityRoleId.everyone(), ...(assignment?.roleIds || [])];
  }

  public add(
    name: CommunityRoleName,
    permissions: CommunityPermission[],
  ): CommunityRole {
    const role = CommunityRole.create(name, permissions);

    this.roles.push(role);

    return role;
  }

  public update(
    roleId: CommunityRoleId,
    name: CommunityRoleName,
    permissions: CommunityPermission[],
  ): void {
    const role = this.findRole(roleId);

    assert(role, new CommunityRoleNotFoundError());
    role?.rename(name);
    role?.updatePermissions(permissions);
  }

  public remove(roleId: CommunityRoleId): void {
    const role = this.findRole(roleId);

    assert(role, new CommunityRoleNotFoundError());
    assert(!role?.isBuiltIn(), new CommunityRoleCannotBeDeletedError());

    const roleIndex = this.roles.findIndex((candidate) =>
      candidate.getId().isEqual(roleId),
    );

    this.roles.splice(roleIndex, 1);

    for (const assignment of this.memberRoles) {
      assignment.roleIds = assignment.roleIds.filter((assignedRoleId) =>
        assignedRoleId.isNotEqual(roleId),
      );
    }
  }

  public assign(identityId: IdentityId, roleIds: CommunityRoleId[]): void {
    roleIds.forEach((roleId) => this.assertExistingRole(roleId));

    const assignableRoleIds = roleIds.filter((roleId) => !roleId.isEveryone());
    const existingAssignment = this.memberRoles.find((candidate) =>
      candidate.identityId.isEqual(identityId),
    );

    if (existingAssignment) {
      existingAssignment.roleIds = assignableRoleIds;

      return;
    }

    this.memberRoles.push({
      identityId,
      roleIds: assignableRoleIds,
    });
  }

  public removeMember(identityId: IdentityId): void {
    const index = this.memberRoles.findIndex((assignment) =>
      assignment.identityId.isEqual(identityId),
    );

    if (index !== -1) {
      this.memberRoles.splice(index, 1);
    }
  }

  public memberHasPermission(
    identityId: IdentityId,
    permission: CommunityPermission,
  ): boolean {
    return this.roleIdsFor(identityId).some((roleId) =>
      this.findRole(roleId)?.allows(permission),
    );
  }

  public memberHasAnyRole(
    identityId: IdentityId,
    roleIds: CommunityRoleId[],
  ): boolean {
    const assignedRoleIds = this.roleIdsFor(identityId);

    return roleIds.some((roleId) =>
      assignedRoleIds.some((assignedRoleId) => assignedRoleId.isEqual(roleId)),
    );
  }

  public toPrimitives() {
    return {
      memberRoles: this.memberRoles.map((assignment) => ({
        identityId: assignment.identityId.valueOf(),
        roleIds: assignment.roleIds.map((roleId) => roleId.valueOf()),
      })),
      roles: this.roles.map((role) => role.toPrimitives()),
    };
  }
}
