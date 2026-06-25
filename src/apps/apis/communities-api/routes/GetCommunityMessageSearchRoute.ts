import CommunityMessagesSearchFinder from '@app/contexts/communities/application/search-messages/CommunityMessagesSearchFinder';
import { CommunityMessagesSearchMessage } from '@app/contexts/communities/application/search-messages/messages/CommunityMessagesSearchMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityMessageSearchViewModel } from '../view-model/CommunityMessageSearchViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityMessageSearchRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunityMessagesSearchFinder>(
    CommunityMessagesSearchFinder,
  );

  @Get('/:communityId/messages/search')
  public async searchCommunityMessages(
    @Param('communityId') communityId: string,
    @QueryParam('query') query: string | undefined,
    @QueryParam('limit') limit: number | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const result = await this.finder.find(
      new CommunityMessagesSearchMessage(
        communityId,
        actorIdentityId.valueOf(),
        query,
        limit,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CommunityMessageSearchViewModel(
          communityId,
          result.getMessages(),
          result.getReactions(),
        ).toResource(),
      );
  }
}
