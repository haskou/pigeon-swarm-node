import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationMessagePinner from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinner';
import ConversationMessagePinsFinder from '@app/contexts/conversations/application/manage-pin/ConversationMessagePinsFinder';
import ConversationMessageUnpinner from '@app/contexts/conversations/application/manage-pin/ConversationMessageUnpinner';
import { ConversationMessagePinCreateMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinCreateMessage';
import { ConversationMessagePinDeleteMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinDeleteMessage';
import { ConversationMessagePinsFindMessage } from '@app/contexts/conversations/application/manage-pin/messages/ConversationMessagePinsFindMessage';
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

  private readonly finder = this.get<ConversationMessagePinsFinder>(
    ConversationMessagePinsFinder,
  );

  private readonly pinner = this.get<ConversationMessagePinner>(
    ConversationMessagePinner,
  );

  private readonly unpinner = this.get<ConversationMessageUnpinner>(
    ConversationMessageUnpinner,
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
