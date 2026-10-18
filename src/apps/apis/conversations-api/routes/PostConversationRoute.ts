import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationCreator from '@app/contexts/conversations/application/create-conversation/ConversationCreator';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  BadRequestError,
  Body,
  JsonController,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostConversationBody } from '../bodies/PostConversationBody';
import { PostConversationRequest } from '../requests/PostConversationRequest';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

@JsonController('/conversations')
export class PostConversationRoute extends Route {
  private readonly creator: ConversationCreator =
    this.get<ConversationCreator>(ConversationCreator);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  /**
   * A participant id is refused as a bad request, not a conflict, when it is
   * not the canonical encoding of a usable identity key.
   */
  private static isParticipantId(participantId: string): boolean {
    try {
      return new IdentityId(participantId).isCanonicalKey();
    } catch {
      return false;
    }
  }

  @Post()
  public async createConversation(
    @Body() body: PostConversationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    if (!body.participantIds.every(PostConversationRoute.isParticipantId)) {
      throw new BadRequestError('Invalid participant id.');
    }
    const conversation = await this.creator.create(
      new PostConversationRequest(body, ownerIdentityId).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
