import { Enum } from '@haskou/value-objects';

const communityJoinMethods = {
  ADDED: 'added',
  APPROVAL: 'approval',
  AUTOMATIC: 'automatic',
  INVITATION: 'invitation',
  INVITE_LINK: 'invite_link',
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

  /** The identity accepts a direct invitation addressed to it. */
  public static readonly INVITATION = new CommunityJoinMethod(
    communityJoinMethods.INVITATION,
  );

  /** The identity redeems an invite link. */
  public static readonly INVITE_LINK = new CommunityJoinMethod(
    communityJoinMethods.INVITE_LINK,
  );

  public getValues(): string[] {
    return Object.values(communityJoinMethods);
  }

  /** Whether the joining identity signs its own join. */
  public isSelfJoin(): boolean {
    return (
      this.isEqual(CommunityJoinMethod.AUTOMATIC) ||
      this.isEqual(CommunityJoinMethod.INVITATION) ||
      this.isEqual(CommunityJoinMethod.INVITE_LINK)
    );
  }
}
