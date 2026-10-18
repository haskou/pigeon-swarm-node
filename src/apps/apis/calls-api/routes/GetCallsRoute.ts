import ActiveCallsFinder from '@app/contexts/calls/application/find-active-calls/ActiveCallsFinder';
import { ActiveCallsFindMessage } from '@app/contexts/calls/application/find-active-calls/messages/ActiveCallsFindMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { CallsPageRequest } from '../requests/CallsPageRequest';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class GetCallsRoute extends CallRouteSupport {
  private readonly finder = this.get<ActiveCallsFinder>(ActiveCallsFinder);

  @Get()
  public async getCalls(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const requesterIdentityId = await this.authenticate(request);
    const pageRequest = new CallsPageRequest('calls', limit, cursor);
    const page = await this.finder.find(
      new ActiveCallsFindMessage(
        requesterIdentityId.valueOf(),
        pageRequest.getLimit(),
        pageRequest.getAfterPosition(),
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      calls: await Promise.all(
        page.items.map((call) => this.presentCall(call)),
      ),
      nextCursor: pageRequest.nextCursor(page.nextPosition),
    });
  }
}
