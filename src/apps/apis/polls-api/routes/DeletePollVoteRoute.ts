import { PollVoteRemoveMessage } from '@app/contexts/polls/application/remove-vote/messages/PollVoteRemoveMessage';
import { PollVoteRemover } from '@app/contexts/polls/application/remove-vote/PollVoteRemover';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class DeletePollVoteRoute extends PollRouteSupport {
  @Delete('/:pollId/votes/me')
  public async removeVote(
    @Param('pollId') pollId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.accessPollScope(actor, poll);
    const updatedPoll = await new PollVoteRemover(
      this.repository(),
      this.eventPublisher,
    ).remove(
      new PollVoteRemoveMessage(
        pollId,
        actor.valueOf(),
        scopeAccess.recipients,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
