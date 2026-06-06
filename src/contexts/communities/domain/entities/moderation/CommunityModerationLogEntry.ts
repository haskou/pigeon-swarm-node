import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { PrimitiveOf, Timestamp } from '@haskou/value-objects';

import { CommunityId } from '../../value-objects/CommunityId';
import { CommunityModerationAction } from '../../value-objects/CommunityModerationAction';
import { CommunityModerationLogId } from '../../value-objects/CommunityModerationLogId';
import { CommunityModerationLogDetails } from './CommunityModerationLogDetails';
import { CommunityModerationTarget } from './CommunityModerationTarget';

export class CommunityModerationLogEntry {
  public static record(
    communityId: CommunityId,
    actorIdentityId: IdentityId,
    action: CommunityModerationAction,
    target: CommunityModerationTarget,
    details: CommunityModerationLogDetails = new CommunityModerationLogDetails(
      {},
    ),
  ): CommunityModerationLogEntry {
    return new CommunityModerationLogEntry(
      CommunityModerationLogId.generate(),
      communityId,
      actorIdentityId,
      action,
      target,
      details,
      Timestamp.now(),
    );
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityModerationLogEntry>,
  ): CommunityModerationLogEntry {
    return new CommunityModerationLogEntry(
      new CommunityModerationLogId(primitives.id),
      new CommunityId(primitives.communityId),
      new IdentityId(primitives.actorIdentityId),
      new CommunityModerationAction(primitives.action),
      CommunityModerationTarget.fromPrimitives(primitives.target),
      new CommunityModerationLogDetails(primitives.details || {}),
      new Timestamp(primitives.createdAt),
    );
  }

  constructor(
    private readonly id: CommunityModerationLogId,
    private readonly communityId: CommunityId,
    private readonly actorIdentityId: IdentityId,
    private readonly action: CommunityModerationAction,
    private readonly target: CommunityModerationTarget,
    private readonly details: CommunityModerationLogDetails,
    private readonly createdAt: Timestamp,
  ) {}

  public getId(): CommunityModerationLogId {
    return this.id;
  }

  public toPrimitives() {
    return {
      action: this.action.valueOf(),
      actorIdentityId: this.actorIdentityId.valueOf(),
      communityId: this.communityId.valueOf(),
      createdAt: this.createdAt.valueOf(),
      details: this.details.toPrimitives(),
      id: this.id.valueOf(),
      target: this.target.toPrimitives(),
    };
  }
}
