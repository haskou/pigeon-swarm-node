import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import CommunityFinder from '@app/contexts/communities/application/find-community/CommunityFinder';
import { CommunityFindMessage } from '@app/contexts/communities/application/find-community/messages/CommunityFindMessage';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/entities/moderation/CommunityModerationTarget';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityInviteRepository from '@app/contexts/communities/domain/repositories/CommunityInviteRepository';
import CommunityMembershipRequestRepository from '@app/contexts/communities/domain/repositories/CommunityMembershipRequestRepository';
import CommunityMessageReactionRepository from '@app/contexts/communities/domain/repositories/CommunityMessageReactionRepository';
import CommunityModerationLogRepository from '@app/contexts/communities/domain/repositories/CommunityModerationLogRepository';
import CommunityRepository from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { ValueObject } from '@haskou/value-objects';
import { Request } from 'express';

export abstract class CommunityRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly communityFinder = this.get<CommunityFinder>(CommunityFinder);

  protected authenticate(request: Request): IdentityId {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected repository(): CommunityRepository {
    return this.get<CommunityRepository>(CommunityRepository);
  }

  protected messageRepository(): CommunityChannelMessageRepository {
    return this.get<CommunityChannelMessageRepository>(
      CommunityChannelMessageRepository,
    );
  }

  protected reactions(): CommunityMessageReactionRepository {
    return this.get<CommunityMessageReactionRepository>(
      CommunityMessageReactionRepository,
    );
  }

  protected inviteRepository(): CommunityInviteRepository {
    return this.get<CommunityInviteRepository>(CommunityInviteRepository);
  }

  protected membershipRequests(): CommunityMembershipRequestRepository {
    return this.get<CommunityMembershipRequestRepository>(
      CommunityMembershipRequestRepository,
    );
  }

  protected moderationLogs(): CommunityModerationLogRepository {
    return this.get<CommunityModerationLogRepository>(
      CommunityModerationLogRepository,
    );
  }

  protected async recordModerationLog(
    community: Community,
    actorIdentityId: IdentityId,
    action: CommunityModerationAction,
    target: CommunityModerationTarget,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await this.moderationLogs().save(
      CommunityModerationLogEntry.record(
        community.getId(),
        actorIdentityId,
        action,
        target,
        new CommunityModerationLogDetails(details),
      ),
    );
  }

  protected moderationTarget(
    type: CommunityModerationTargetType,
    id: ValueObject<string>,
  ): CommunityModerationTarget {
    return CommunityModerationTarget.create(type, id);
  }

  protected communityTarget(community: Community): CommunityModerationTarget {
    return this.moderationTarget(
      CommunityModerationTargetType.COMMUNITY,
      community.getId(),
    );
  }

  protected async findCommunity(id: string): Promise<Community> {
    return this.communityFinder.find(new CommunityFindMessage(id));
  }
}
