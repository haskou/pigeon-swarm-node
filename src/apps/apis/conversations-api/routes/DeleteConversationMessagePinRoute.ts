import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationMessageUnpinner from '@app/contexts/conversations/application/manage-pin/ConversationMessageUnpinner';
import { ConversationMessagePinDeleteMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinDeleteMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

@JsonController('/conversations')
export class DeleteConversationMessagePinRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly unpinner = this.get<ConversationMessageUnpinner>(
    ConversationMessageUnpinner,
  );

  @Delete('/:conversationId/messages/:messageId/pin')
  public async unpinMessage(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);

    await this.unpinner.unpin(
      new ConversationMessagePinDeleteMessage(
        identityId.valueOf(),
        conversationId,
        messageId,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      messageId,
    });
  }
}
