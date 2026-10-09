import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityInviteExpiredError } from '../../errors/CommunityInviteExpiredError';
import { CommunityInviteUsesExceededError } from '../../errors/CommunityInviteUsesExceededError';
import { CommunityId } from '../../value-objects/CommunityId';
import { CommunityInviteMaxUses } from '../../value-objects/CommunityInviteMaxUses';
import { CommunityInviteNonce } from '../../value-objects/CommunityInviteNonce';
import { CommunityInviteToken } from '../../value-objects/CommunityInviteToken';
import { CommunityInviteUses } from '../../value-objects/CommunityInviteUses';

export class CommunityInvite {
  public static create(
    communityId: CommunityId,
    creatorIdentityId: IdentityId,
    nonce: CommunityInviteNonce,
    createdAt: Timestamp,
    expiresAt?: Timestamp,
    maxUses: CommunityInviteMaxUses = new CommunityInviteMaxUses(1),
  ): CommunityInvite {
    return new CommunityInvite(
      CommunityInviteToken.derive(
        communityId.valueOf(),
        creatorIdentityId.valueOf(),
        nonce.valueOf(),
      ),
      communityId,
      creatorIdentityId,
      nonce,
      createdAt,
      expiresAt,
      maxUses,
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityInvite>,
  ): CommunityInvite {
    return new CommunityInvite(
      new CommunityInviteToken(primitives.token),
      new CommunityId(primitives.communityId),
      new IdentityId(primitives.creatorIdentityId),
      new CommunityInviteNonce(primitives.nonce),
      new Timestamp(primitives.createdAt),
      primitives.expiresAt ? new Timestamp(primitives.expiresAt) : undefined,
      new CommunityInviteMaxUses(primitives.maxUses),
    );
  }

  constructor(
    private readonly token: CommunityInviteToken,
    private readonly communityId: CommunityId,
    private readonly creatorIdentityId: IdentityId,
    private readonly nonce: CommunityInviteNonce,
    private readonly createdAt: Timestamp,
    private readonly expiresAt: Timestamp | undefined,
    private readonly maxUses: CommunityInviteMaxUses,
  ) {}

  public isExpired(now: Timestamp = Timestamp.now()): boolean {
    return this.expiresAt?.isBeforeOrEqual(now) ?? false;
  }

  /**
   * Uses are signed records written by each acceptor, so concurrent
   * acceptances on partitioned nodes can exceed maxUses.
   */
  public checkAcceptanceAvailability(
    uses: CommunityInviteUses,
    now: Timestamp = Timestamp.now(),
  ): void {
    assert(!this.isExpired(now), new CommunityInviteExpiredError());
    assert(
      uses.isLessThan(this.maxUses),
      new CommunityInviteUsesExceededError(),
    );
  }

  public getCommunityId(): CommunityId {
    return this.communityId;
  }

  public getToken(): CommunityInviteToken {
    return this.token;
  }

  public toPrimitives() {
    return {
      communityId: this.communityId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      creatorIdentityId: this.creatorIdentityId.valueOf(),
      expiresAt: this.expiresAt?.valueOf(),
      maxUses: this.maxUses.valueOf(),
      nonce: this.nonce.valueOf(),
      token: this.token.valueOf(),
    };
  }
}
