import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { CallRepository } from '@app/contexts/calls/domain/repositories/CallRepository';
import { MongoCallRepository } from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import { CommunityRepository } from '@app/contexts/communities/domain/repositories/CommunityRepository';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationRepository } from '@app/contexts/conversations/domain/repositories/ConversationRepository';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class CallRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected callRepository(): CallRepository {
    return new MongoCallRepository(this.get<MongoDB>(MongoDB));
  }

  protected conversationRepository(): ConversationRepository {
    return this.get<MongoConversationRepository>(MongoConversationRepository);
  }

  protected communityRepository(): CommunityRepository {
    return new MongoCommunityRepository(this.get<MongoDB>(MongoDB));
  }
}
