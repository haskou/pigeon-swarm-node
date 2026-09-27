import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPrivateAuthorizationOperationBody } from '../bodies/PostPrivateAuthorizationOperationBody';
import { PrivateAuthorizationRequestBodyLimit } from './PrivateAuthorizationRequestBodyLimit';
import { PrivateAuthorizationRouteSupport } from './PrivateAuthorizationRouteSupport';

@JsonController('/private-authorization')
export class PostPrivateAuthorizationOperationRoute extends PrivateAuthorizationRouteSupport {
  private readonly acceptor = this.get<PrivateOperationAcceptor>(
    PrivateOperationAcceptor,
  );

  @Post('/operations')
  public async accept(
    @Body({ options: { limit: PrivateAuthorizationRequestBodyLimit } })
    body: PostPrivateAuthorizationOperationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    this.authenticate(request);
    const result = await this.acceptor.accept(
      new PrivateOperationAcceptMessage(
        body.signedOperationJson,
        body.signedFreshnessProofJson,
        body.controlFrame,
      ),
    );
    const status = result.status === 'pending' ? 202 : HttpRouteStatusEnum.OK;

    return response.status(status).send(result);
  }
}
