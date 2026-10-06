import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ContentReplicationRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationRegistrar';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Param, Put, Req, Res } from 'routing-controllers';

import { PutContentReplicationBody } from '../bodies/PutContentReplicationBody';
import { PutContentReplicationRequest } from '../requests/PutContentReplicationRequest';

@JsonController('/ipfs')
export class PutContentReplicationRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly registrar = this.get<ContentReplicationRegistrar>(
    ContentReplicationRegistrar,
  );

  @Put('/replication/:cid')
  public async request(
    @Param('cid') cid: string,
    @Body() body: PutContentReplicationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.registrar.register(
      new PutContentReplicationRequest(
        identityId.valueOf(),
        cid,
        body,
      ).getMessage(),
    );

    return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
  }
}
