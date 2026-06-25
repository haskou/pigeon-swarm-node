import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationMessagePinsFinder from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinsFinder';
import { ConversationMessagePinsFindMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinsFindMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { ConversationMessagePinsResource } from '../resources/ConversationMessagePinsResource';
import { MessageViewModel } from '../view-model/MessageViewModel';

@JsonController('/conversations')
export class GetConversationMessagePinsRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  private readonly finder = this.get<ConversationMessagePinsFinder>(
    ConversationMessagePinsFinder,
  );

  @Get('/:conversationId/pins')
  public async listPins(
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const pins = await this.finder.find(
      new ConversationMessagePinsFindMessage(
        identityId.valueOf(),
        conversationId,
      ),
    );
    const resources: ConversationMessagePinsResource['pins'] = pins.map(
      (pin) => ({
        createdAt: pin.createdAt,
        message: new MessageViewModel(pin.message).toResource(),
        messageId: pin.messageId,
        pinnedByIdentityId: pin.pinnedByIdentityId,
      }),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      conversationId,
      pins: resources,
    });
  }
}
