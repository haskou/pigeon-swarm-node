import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { ConversationNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationNotFoundError';
import { ConversationParticipantNotFoundError } from '@app/contexts/conversations/domain/errors/ConversationParticipantNotFoundError';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { MongoConversationDraftRepository } from '@app/contexts/conversations/infrastructure/mongo/MongoConversationDraftRepository';
import MongoConversationRepository from '@app/contexts/conversations/infrastructure/mongo/MongoConversationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Timestamp } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  Get,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutConversationDraftBody } from '../bodies/PutConversationDraftBody';

@JsonController('/conversations')
export class ConversationDraftsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private conversationRepository(): MongoConversationRepository {
    return this.get<MongoConversationRepository>(MongoConversationRepository);
  }

  private draftRepository(): MongoConversationDraftRepository {
    return new MongoConversationDraftRepository(this.get<MongoDB>(MongoDB));
  }

  private async assertCanRead(
    conversationId: ConversationId,
    identityId: IdentityId,
  ): Promise<void> {
    const conversation =
      await this.conversationRepository().findById(conversationId);

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    if (!conversation.hasParticipant(identityId)) {
      throw new ConversationParticipantNotFoundError();
    }
  }

  @Get('/me/drafts')
  public async listDrafts(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const drafts = await this.draftRepository().findByIdentity(identityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      drafts: drafts.map((draft) => ({
        conversationId: draft.conversationId,
        encryptedPayload: draft.encryptedPayload,
        updatedAt: draft.updatedAt,
      })),
    });
  }

  @Put('/:conversationId/draft')
  public async saveDraft(
    @Param('conversationId') conversationId: string,
    @Body() body: PutConversationDraftBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const domainConversationId = new ConversationId(conversationId);
    const updatedAt = body.updatedAt
      ? new Timestamp(body.updatedAt)
      : Timestamp.now();

    await this.assertCanRead(domainConversationId, identityId);
    await this.draftRepository().save(
      identityId,
      domainConversationId,
      body.encryptedPayload,
      updatedAt,
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      encryptedPayload: body.encryptedPayload,
      updatedAt: updatedAt.valueOf(),
    });
  }

  @Delete('/:conversationId/draft')
  public async deleteDraft(
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const domainConversationId = new ConversationId(conversationId);

    await this.assertCanRead(domainConversationId, identityId);
    await this.draftRepository().delete(identityId, domainConversationId);

    return response.status(HttpRouteStatusEnum.OK).send({ conversationId });
  }
}
