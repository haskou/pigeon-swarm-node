import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationFrontierFinder from '@app/contexts/conversations/application/find-frontier/ConversationFrontierFinder';
import { ConversationId } from '@app/contexts/conversations/domain/value-objects/ConversationId';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

@JsonController('/conversations')
export class GetConversationFrontierRoute extends Route {
  private readonly finder = this.get<ConversationFrontierFinder>(
    ConversationFrontierFinder,
  );

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Get('/:conversationId/frontier')
  public async getFrontier(
    @Param('conversationId') conversationId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    return response.status(HttpRouteStatusEnum.OK).send({
      frontier: await this.finder.find(
        new ConversationId(conversationId),
        requesterIdentityId,
      ),
    });
  }
}
