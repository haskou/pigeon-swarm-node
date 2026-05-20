import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityRoles } from './CommunityRoles';
import { CommunityRoleId } from './value-objects/CommunityRoleId';

export class CommunityMembership {
  public static create(
    members: IdentityId[],
    roles: CommunityRoles,
  ): CommunityMembership {
    return new CommunityMembership(members, roles);
  }

  constructor(
    private readonly members: IdentityId[],
    private readonly roles: CommunityRoles,
  ) {}

  public add(member: IdentityId): void {
    this.members.push(member);
  }

  public assignRoles(member: IdentityId, roleIds: CommunityRoleId[]): void {
    this.roles.assign(member, roleIds);
  }

  public getRoles(): CommunityRoles {
    return this.roles;
  }

  public hasMembers(): boolean {
    return this.members.length > 0;
  }

  public isMember(identityId: IdentityId): boolean {
    return this.members.some((member) => member.isEqual(identityId));
  }

  public remove(member: IdentityId): void {
    const memberIndex = this.members.findIndex((currentMember) =>
      currentMember.isEqual(member),
    );

    this.members.splice(memberIndex, 1);
    this.roles.removeMember(member);
  }

  public size(): number {
    return this.members.length;
  }

  public toPrimitives() {
    return {
      memberIds: this.members.map((member) => member.valueOf()),
      memberRoles: this.roles.toPrimitives().memberRoles,
      roles: this.roles.toPrimitives().roles,
    };
  }
}
