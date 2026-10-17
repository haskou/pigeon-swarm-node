import { Enum } from '@haskou/value-objects';

const communityJoinMethods = {
  ADDED: 'added',
  APPROVAL: 'approval',
  AUTOMATIC: 'automatic',
  INVITATION: 'invitation',
} as const;

export class CommunityJoinMethod extends Enum<string> {
  /** A member with manage-members permission adds the identity directly. */
  public static readonly ADDED = new CommunityJoinMethod(
    communityJoinMethods.ADDED,
  );

  /** A member with approve-members permission accepts a join request. */
  public static readonly APPROVAL = new CommunityJoinMethod(
    communityJoinMethods.APPROVAL,
  );

  /** The identity joins an auto-join community by itself. */
  public static readonly AUTOMATIC = new CommunityJoinMethod(
    communityJoinMethods.AUTOMATIC,
  );

  /**
   * A member with manage-members permission admits the claim of an identity
   * that holds an invitation link and consents to join.
   */
  public static readonly INVITATION = new CommunityJoinMethod(
    communityJoinMethods.INVITATION,
  );

  public getValues(): string[] {
    return Object.values(communityJoinMethods);
  }

  /** Whether the joining identity signs its own join. */
  public isSelfJoin(): boolean {
    return this.isEqual(CommunityJoinMethod.AUTOMATIC);
  }

  /** Whether a signed record outside the operation log must allow the join. */
  public requiresReference(): boolean {
    return this.isEqual(CommunityJoinMethod.APPROVAL);
  }
}
