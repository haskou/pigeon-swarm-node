import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityModerationLogDetails } from '@app/contexts/communities/domain/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '@app/contexts/communities/domain/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '@app/contexts/communities/domain/CommunityModerationTarget';
import { CommunityNotFoundError } from '@app/contexts/communities/domain/errors/CommunityNotFoundError';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityModerationAction } from '@app/contexts/communities/domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '@app/contexts/communities/domain/value-objects/CommunityModerationTargetType';
import { MongoCommunityMessageReactionRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageReactionRepository';
import { MongoCommunityChannelMessageRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityChannelMessageRepository';
import { MongoCommunityInviteRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityInviteRepository';
import { MongoCommunityModerationLogRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityModerationLogRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { MongoCommunityRequestStore } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRequestStore';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { ValueObject } from '@haskou/value-objects';
import { Request } from 'express';

export abstract class CommunityRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  protected readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected repository(): MongoCommunityRepository {
    return new MongoCommunityRepository(this.get<MongoDB>(MongoDB));
  }

  protected messageRepository(): MongoCommunityChannelMessageRepository {
    return new MongoCommunityChannelMessageRepository(
      this.get<MongoDB>(MongoDB),
    );
  }

  protected reactions(): MongoCommunityMessageReactionRepository {
    return new MongoCommunityMessageReactionRepository(
      this.get<MongoDB>(MongoDB),
    );
  }

  protected inviteRepository(): MongoCommunityInviteRepository {
    return new MongoCommunityInviteRepository(this.get<MongoDB>(MongoDB));
  }

  protected membershipRequests(): MongoCommunityRequestStore {
    return new MongoCommunityRequestStore(this.get<MongoDB>(MongoDB));
  }

  protected moderationLogs(): MongoCommunityModerationLogRepository {
    return new MongoCommunityModerationLogRepository(
      this.get<MongoDB>(MongoDB),
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
    const community = await this.repository().findById(new CommunityId(id));

    if (!community) {
      throw new CommunityNotFoundError();
    }

    return community;
  }
}
