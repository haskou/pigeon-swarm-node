import { IdentityId } from '../../../shared/domain/value-objects/IdentityId';
import { Community } from '../../domain/Community';
import { CommunityModerationLogDetails } from '../../domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';

export default class CommunityModerationLogRecorder {
  constructor(
    private readonly moderationLogRepository: CommunityModerationLogRepository,
  ) {}

  public async record(
    community: Community,
    actorIdentityId: IdentityId,
    action: CommunityModerationAction,
    target: CommunityModerationTarget,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.moderationLogRepository.save(
      CommunityModerationLogEntry.record(
        community.getId(),
        actorIdentityId,
        action,
        target,
        new CommunityModerationLogDetails(details),
      ),
    );
  }
}
