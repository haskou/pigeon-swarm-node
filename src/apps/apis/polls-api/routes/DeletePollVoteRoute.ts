import { PollVoteRemoveMessage } from '@app/contexts/polls/application/remove-vote/messages/PollVoteRemoveMessage';
import { PollVoteRemover } from '@app/contexts/polls/application/remove-vote/PollVoteRemover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { DeletePollVoteBody } from '../bodies/DeletePollVoteBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class DeletePollVoteRoute extends PollRouteSupport {
  private readonly remover = this.get<PollVoteRemover>(PollVoteRemover);

  @Delete('/:pollId/votes/me')
  public async removeVote(
    @Param('pollId') pollId: string,
    @Body() body: DeletePollVoteBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.accessPollScope(actor, poll);
    const updatedPoll = await this.remover.remove(
      new PollVoteRemoveMessage(
        pollId,
        actor.valueOf(),
        scopeAccess.audience,
        body.mutation,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
