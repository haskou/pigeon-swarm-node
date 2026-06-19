import { PollCloseMessage } from '@app/contexts/polls/application/close/messages/PollCloseMessage';
import { PollCloser } from '@app/contexts/polls/application/close/PollCloser';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollCloseRoute extends PollRouteSupport {
  private readonly closer = this.get<PollCloser>(PollCloser);

  @Post('/:pollId/close')
  public async closePoll(
    @Param('pollId') pollId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.managePollScope(actor, poll);
    const updatedPoll = await this.closer.close(
      new PollCloseMessage(pollId, actor.valueOf(), scopeAccess.audience),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
