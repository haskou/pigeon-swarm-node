import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityInviteExpiredError } from './errors/CommunityInviteExpiredError';
import { CommunityInviteUsesExceededError } from './errors/CommunityInviteUsesExceededError';
import { CommunityId } from './value-objects/CommunityId';
import { CommunityInviteMaxUses } from './value-objects/CommunityInviteMaxUses';
import { CommunityInviteToken } from './value-objects/CommunityInviteToken';
import { CommunityInviteUses } from './value-objects/CommunityInviteUses';

export class CommunityInvite {
  public static create(
    communityId: CommunityId,
    creatorIdentityId: IdentityId,
    expiresAt?: Timestamp,
    maxUses: CommunityInviteMaxUses = new CommunityInviteMaxUses(1),
  ): CommunityInvite {
    return new CommunityInvite(
      CommunityInviteToken.generate(),
      communityId,
      creatorIdentityId,
      Timestamp.now(),
      expiresAt,
      maxUses,
      CommunityInviteUses.zero(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityInvite>,
  ): CommunityInvite {
    return new CommunityInvite(
      new CommunityInviteToken(primitives.token),
      new CommunityId(primitives.communityId),
      new IdentityId(primitives.creatorIdentityId),
      new Timestamp(primitives.createdAt),
      primitives.expiresAt ? new Timestamp(primitives.expiresAt) : undefined,
      new CommunityInviteMaxUses(primitives.maxUses),
      new CommunityInviteUses(primitives.uses),
    );
  }

  constructor(
    private readonly token: CommunityInviteToken,
    private readonly communityId: CommunityId,
    private readonly creatorIdentityId: IdentityId,
    private readonly createdAt: Timestamp,
    private readonly expiresAt: Timestamp | undefined,
    private readonly maxUses: CommunityInviteMaxUses,
    private uses: CommunityInviteUses,
  ) {}

  private isExpired(now: Timestamp): boolean {
    return Boolean(this.expiresAt && this.expiresAt.valueOf() <= now.valueOf());
  }

  private hasUsesAvailable(): boolean {
    return this.uses.valueOf() < this.maxUses.valueOf();
  }

  public accept(now: Timestamp = Timestamp.now()): void {
    assert(!this.isExpired(now), new CommunityInviteExpiredError());
    assert(this.hasUsesAvailable(), new CommunityInviteUsesExceededError());

    this.uses = this.uses.next();
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
      token: this.token.valueOf(),
      uses: this.uses.valueOf(),
    };
  }
}
