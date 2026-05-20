import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class GetPollRoute extends PollRouteSupport {
  @Get('/:pollId')
  public async getPoll(
    @Param('pollId') pollId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);

    await this.accessPollScope(actor, poll);

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(poll).toResource());
  }
}
