import { PollVoteCastMessage } from '@app/contexts/polls/application/cast-vote/messages/PollVoteCastMessage';
import { PollVoteCaster } from '@app/contexts/polls/application/cast-vote/PollVoteCaster';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostPollVoteBody } from '../bodies/PostPollVoteBody';
import { PollViewModel } from '../view-model/PollViewModel';
import { PollRouteSupport } from './PollRouteSupport';

@JsonController('/polls')
export class PostPollVoteRoute extends PollRouteSupport {
  @Post('/:pollId/votes')
  public async castVote(
    @Param('pollId') pollId: string,
    @Body() body: PostPollVoteBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actor = await this.authenticate(request);
    const poll = await this.findPoll(pollId);
    const scopeAccess = await this.accessPollScope(actor, poll);
    const updatedPoll = await new PollVoteCaster(
      this.repository(),
      this.eventPublisher,
    ).cast(
      new PollVoteCastMessage(
        pollId,
        actor.valueOf(),
        body.optionIds,
        scopeAccess.recipients,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new PollViewModel(updatedPoll).toResource());
  }
}
