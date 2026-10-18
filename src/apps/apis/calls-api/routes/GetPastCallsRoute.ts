import CallHistoryFinder from '@app/contexts/calls/application/find-call-history/CallHistoryFinder';
import { CallHistoryFindMessage } from '@app/contexts/calls/application/find-call-history/messages/CallHistoryFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { CallsPageRequest } from '../requests/CallsPageRequest';
import { CallHistoryViewModel } from '../view-model/CallHistoryViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/past-calls')
export class GetPastCallsRoute extends CallRouteSupport {
  private readonly finder = this.get<CallHistoryFinder>(CallHistoryFinder);

  @Get()
  public async getCallHistory(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const pageRequest = new CallsPageRequest('past-calls', limit, cursor);
    const page = await this.finder.find(
      new CallHistoryFindMessage(
        requesterIdentityId.valueOf(),
        pageRequest.getLimit(),
        pageRequest.getAfterPosition(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new CallHistoryViewModel(
          page.items,
          pageRequest.nextCursor(page.nextPosition),
        ).toResource(),
      );
  }
}
