import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityId } from '../../value-objects/CommunityId';

/**
 * A joiner's request to be admitted under an invitation: the possession proof
 * shows it holds the link, the consent shows it agrees to join. It carries no
 * authority, and no admission ever references it.
 */
export class CommunityInvitationClaim {
  public static idOf(invitationId: string, identityId: IdentityId): string {
    return `invitation-claim:${invitationId}:${identityId.valueOf()}`;
  }

  public static create(
    communityId: CommunityId,
    invitationId: string,
    identityId: IdentityId,
    possession: string,
    consent: string,
  ): CommunityInvitationClaim {
    return new CommunityInvitationClaim(
      communityId,
      invitationId,
      identityId,
      possession,
      consent,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityInvitationClaim>,
  ): CommunityInvitationClaim {
    return new CommunityInvitationClaim(
      new CommunityId(primitives.communityId),
      primitives.invitationId,
      new IdentityId(primitives.identityId),
      primitives.possession,
      primitives.consent,
    );
  }

  private constructor(
    private readonly communityId: CommunityId,
    private readonly invitationId: string,
    private readonly identityId: IdentityId,
    private readonly possession: string,
    private readonly consent: string,
  ) {}

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getInvitationId(): string {
    return this.invitationId;
  }

  public getIdentityId(): IdentityId {
    return this.identityId;
  }

  public getPossession(): string {
    return this.possession;
  }

  public getConsent(): string {
    return this.consent;
  }

  public toPrimitives() {
    return {
      communityId: this.communityId.valueOf(),
      consent: this.consent,
      id: CommunityInvitationClaim.idOf(this.invitationId, this.identityId),
      identityId: this.identityId.valueOf(),
      invitationId: this.invitationId,
      possession: this.possession,
    };
  }
}
