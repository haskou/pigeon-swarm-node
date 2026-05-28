import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { MessageTargetNotFoundError } from '@app/contexts/conversations/domain/errors/MessageTargetNotFoundError';
import { ConversationMessageWasPinnedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasPinnedEvent';
import { ConversationMessageWasUnpinnedEvent } from '@app/contexts/conversations/domain/events/ConversationMessageWasUnpinnedEvent';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MessageId } from '@app/contexts/conversations/domain/value-objects/MessageId';
import { MongoConversationMessagePinRepository } from '@app/contexts/conversations/infrastructure/mongo/MongoConversationMessagePinRepository';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import {
  Delete,
  Get,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { ConversationMessagePinsResource } from '../resources/ConversationMessagePinsResource';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class ConversationMessagePinsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly eventPublisher = this.get<MessageBus>(MessageBus);

  private conversationRepository(): MongoConversationRepository {
    return this.get<MongoConversationRepository>(MongoConversationRepository);
  }

  private pinRepository(): MongoConversationMessagePinRepository {
    return new MongoConversationMessagePinRepository(
      this.get<MongoDB>(MongoDB),
    );
  }

  private async findReadableConversation(
    conversationId: ConversationId,
    identityId: IdentityId,
  ) {
    const conversation =
      await this.conversationRepository().findById(conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    if (!conversation.hasParticipant(identityId)) {
      throw new ConversationParticipantNotFoundError();
    }

    return conversation;
  }

  @Get('/:conversationId/pins')
  public async listPins(
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const domainConversationId = new ConversationId(conversationId);

    await this.findReadableConversation(domainConversationId, identityId);

    const pins =
      await this.pinRepository().findByConversation(domainConversationId);
    const resources: ConversationMessagePinsResource['pins'] = [];

    for (const pin of pins) {
      const message = await this.conversationRepository().findMessageById(
        domainConversationId,
        new MessageId(pin.messageId),
      );

      if (message) {
        resources.push({
          createdAt: pin.createdAt,
          message: new MessageViewModel(message).toResource(),
          messageId: pin.messageId,
          pinnedByIdentityId: pin.pinnedByIdentityId,
        });
      }
    }

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      pins: resources,
    });
  }

  @Post('/:conversationId/messages/:messageId/pin')
  public async pinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const domainConversationId = new ConversationId(conversationId);
    const domainMessageId = new MessageId(messageId);

    const conversation = await this.findReadableConversation(
      domainConversationId,
      identityId,
    );

    const message = await this.conversationRepository().findMessageById(
      domainConversationId,
      domainMessageId,
    );

    if (!message) {
      throw new MessageTargetNotFoundError();
    }

    await this.pinRepository().pin(
      domainConversationId,
      domainMessageId,
      identityId,
    );
    const conversationPrimitives = conversation.toPrimitives();

    await this.eventPublisher.publish([
      new ConversationMessageWasPinnedEvent(conversationId, {
        messageId,
        networkId: conversationPrimitives.networkId,
        participantIds: conversationPrimitives.participantIds,
        pinnedByIdentityId: identityId.valueOf(),
      }),
    ]);

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      messageId,
      pinnedByIdentityId: identityId.valueOf(),
    });
  }

  @Delete('/:conversationId/messages/:messageId/pin')
  public async unpinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const domainConversationId = new ConversationId(conversationId);
    const domainMessageId = new MessageId(messageId);

    const conversation = await this.findReadableConversation(
      domainConversationId,
      identityId,
    );
    await this.pinRepository().unpin(domainConversationId, domainMessageId);
    const conversationPrimitives = conversation.toPrimitives();

    await this.eventPublisher.publish([
      new ConversationMessageWasUnpinnedEvent(conversationId, {
        messageId,
        networkId: conversationPrimitives.networkId,
        participantIds: conversationPrimitives.participantIds,
        unpinnedByIdentityId: identityId.valueOf(),
      }),
    ]);

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      messageId,
    });
  }
}
