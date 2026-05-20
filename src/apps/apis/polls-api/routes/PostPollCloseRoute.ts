import { PollCloseMessage } from '@app/contexts/polls/application/close/messages/PollCloseMessage';
import { PollCloser } from '@app/contexts/polls/application/close/PollCloser';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { JsonController, Param, Post, Req, Res } from 'routing-controllers';

import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollCloseRoute extends PollRouteSupport {
  @Post('/:pollId/close')
  public async closePoll(
    @Param('pollId') pollId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.accessPollScope(actor, poll);
    const updatedPoll = await new PollCloser(
      this.repository(),
      this.eventPublisher,
    ).close(
      new PollCloseMessage(pollId, actor.valueOf(), scopeAccess.recipients),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
