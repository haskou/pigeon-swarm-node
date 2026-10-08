import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/**
 * Who governs a conversation: the creator, who is above the admins, and the
 * admins the creator or other admins appointed.
 */
export class ConversationAdmins {
  constructor(
    private readonly creatorId: IdentityId | undefined = undefined,
    private readonly adminIds: IdentityId[] = [],
  ) {}

  public getAdminIds(): IdentityId[] {
    return [...this.adminIds];
  }

  public getCreatorId(): IdentityId | undefined {
    return this.creatorId;
  }

  public isAdmin(identityId: IdentityId): boolean {
    return this.adminIds.some((admin) => admin.isEqual(identityId));
  }

  public toPrimitives() {
    return {
      adminIds: this.adminIds.map((admin) => admin.valueOf()),
      creatorId: this.creatorId?.valueOf(),
    };
  }
}
