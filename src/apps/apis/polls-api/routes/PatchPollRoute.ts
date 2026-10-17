import { PollCloseMessage } from '@app/contexts/polls/application/close/messages/PollCloseMessage';
import { PollCloser } from '@app/contexts/polls/application/close/PollCloser';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchPollBody } from '../bodies/PatchPollBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PatchPollRoute extends PollRouteSupport {
  private readonly closer = this.get<PollCloser>(PollCloser);

  @Patch('/:pollId')
  public async closePoll(
    @Param('pollId') pollId: string,
    @Body() body: PatchPollBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.managePollScope(actor, poll);
    const updatedPoll = await this.closer.close(
      new PollCloseMessage(
        pollId,
        actor.valueOf(),
        scopeAccess.audience,
        body.createdAt,
        body.mutation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
