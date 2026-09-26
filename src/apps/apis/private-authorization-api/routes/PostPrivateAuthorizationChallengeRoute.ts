import { PrivateOperationChallengeMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationChallengeMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPrivateAuthorizationChallengeBody } from '../bodies/PostPrivateAuthorizationChallengeBody';
import { PrivateAuthorizationRouteSupport } from './PrivateAuthorizationRouteSupport';

@JsonController('/private-authorization')
export class PostPrivateAuthorizationChallengeRoute extends PrivateAuthorizationRouteSupport {
  private readonly acceptor = this.get<PrivateOperationAcceptor>(
    PrivateOperationAcceptor,
  );

  @Post('/challenges')
  public async challenge(
    @Body({ options: { limit: '256kb' } })
    body: PostPrivateAuthorizationChallengeBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = this.authenticate(request);
    const challenge = await this.acceptor.challenge(
      new PrivateOperationChallengeMessage(
        identityId.valueOf(),
        body.signedOperationJson,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({ challenge });
  }
}
