import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationMessagePinner from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinner';
import { ConversationMessagePinCreateMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinCreateMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

@JsonController('/conversations')
export class PostConversationMessagePinRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly pinner = this.get<ConversationMessagePinner>(
    ConversationMessagePinner,
  );

  @Post('/:conversationId/messages/:messageId/pin')
  public async pinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);

    await this.pinner.pin(
      new ConversationMessagePinCreateMessage(
        identityId.valueOf(),
        conversationId,
        messageId,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      messageId,
      pinnedByIdentityId: identityId.valueOf(),
    });
  }
}
