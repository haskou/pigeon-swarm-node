import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityRoles } from './CommunityRoles';
import { CommunityRoleId } from './value-objects/CommunityRoleId';

export class CommunityMembership {
  public static create(
    members: IdentityId[],
    roles: CommunityRoles,
    bannedMembers: IdentityId[] = [],
  ): CommunityMembership {
    return new CommunityMembership(members, roles, bannedMembers);
  }

  constructor(
    private readonly members: IdentityId[],
    private readonly roles: CommunityRoles,
    private readonly bannedMembers: IdentityId[],
  ) {}

  public add(member: IdentityId): void {
    this.members.push(member);
  }

  public ban(member: IdentityId): void {
    if (!this.isBanned(member)) {
      this.bannedMembers.push(member);
    }

    if (this.isMember(member)) {
      this.remove(member);
    }
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

  public isBanned(identityId: IdentityId): boolean {
    return this.bannedMembers.some((member) => member.isEqual(identityId));
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

  public unban(member: IdentityId): void {
    const index = this.bannedMembers.findIndex((candidate) =>
      candidate.isEqual(member),
    );

    if (index !== -1) {
      this.bannedMembers.splice(index, 1);
    }
  }

  public toPrimitives() {
    return {
      bannedMemberIds: this.bannedMembers.map((member) => member.valueOf()),
      memberIds: this.members.map((member) => member.valueOf()),
      memberRoles: this.roles.toPrimitives().memberRoles,
      roles: this.roles.toPrimitives().roles,
    };
  }
}
