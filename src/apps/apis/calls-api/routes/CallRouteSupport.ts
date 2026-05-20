import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { Call } from '@app/contexts/calls/domain/Call';
import { CallScope } from '@app/contexts/calls/domain/CallScope';
import { CallNotFoundError } from '@app/contexts/calls/domain/errors/CallNotFoundError';
import { InvalidCallScopeError } from '@app/contexts/calls/domain/errors/InvalidCallScopeError';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { MongoCallRepository } from '@app/contexts/calls/infrastructure/mongo/MongoCallRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { MongoCommunityRepository } from '@app/contexts/communities/infrastructure/mongo/MongoCommunityRepository';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

import { PostCallBody } from '../bodies/PostCallBody';

type ValidatedCallScope = {
  networkId: NetworkId;
  participantIds: IdentityId[];
  scope: CallScope;
};

export abstract class CallRouteSupport extends Route {
  protected readonly eventPublisher: DomainEventPublisher =
    this.get<MessageBus>(MessageBus);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected callRepository(): MongoCallRepository {
    return new MongoCallRepository(this.get<MongoDB>(MongoDB));
  }

  protected conversationRepository(): MongoConversationRepository {
    return this.get<MongoConversationRepository>(MongoConversationRepository);
  }

  protected communityRepository(): MongoCommunityRepository {
    return new MongoCommunityRepository(this.get<MongoDB>(MongoDB));
  }

  protected async findCall(callId: string): Promise<Call> {
    const call = await this.callRepository().findById(new CallId(callId));

    if (!call) {
      throw new CallNotFoundError();
    }

    return call;
  }

  protected async findAccessibleCall(
    callId: string,
    requesterIdentityId: IdentityId,
  ): Promise<Call> {
    const call = await this.findCall(callId);

    if (!call.hasParticipant(requesterIdentityId)) {
      throw new CallNotFoundError();
    }

    return call;
  }

  private async validateConversationScope(
    requesterIdentityId: IdentityId,
    body: PostCallBody,
  ): Promise<ValidatedCallScope> {
    if (!body.conversationId) {
      throw new InvalidCallScopeError();
    }

    const conversation = await this.conversationRepository().findById(
      new ConversationId(body.conversationId),
    );

    if (!conversation || !conversation.hasParticipant(requesterIdentityId)) {
      throw new InvalidCallScopeError();
    }

    const primitives = conversation.toPrimitives();

    return {
      networkId: conversation.getNetworkId(),
      participantIds: primitives.participantIds.map(
        (participantId) => new IdentityId(participantId),
      ),
      scope: CallScope.conversation(new ConversationId(body.conversationId)),
    };
  }

  private async validateCommunityChannelScope(
    requesterIdentityId: IdentityId,
    body: PostCallBody,
  ): Promise<ValidatedCallScope> {
    if (!body.communityId || !body.channelId) {
      throw new InvalidCallScopeError();
    }

    const community = await this.communityRepository().findById(
      new CommunityId(body.communityId),
    );

    if (!community) {
      throw new InvalidCallScopeError();
    }

    const channelId = new CommunityChannelId(body.channelId);

    community.assertCanConnectVoice(requesterIdentityId, channelId);
    const primitives = community.toPrimitives();

    return {
      networkId: new NetworkId(primitives.networkId),
      participantIds: primitives.memberIds.map(
        (memberId) => new IdentityId(memberId),
      ),
      scope: CallScope.communityChannel(
        new CommunityId(body.communityId),
        channelId,
      ),
    };
  }

  protected async validateScope(
    requesterIdentityId: IdentityId,
    body: PostCallBody,
  ): Promise<ValidatedCallScope> {
    if (body.scopeType === 'conversation') {
      return this.validateConversationScope(requesterIdentityId, body);
    }

    return this.validateCommunityChannelScope(requesterIdentityId, body);
  }
}
