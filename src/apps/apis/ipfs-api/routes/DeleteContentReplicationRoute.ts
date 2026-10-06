import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ContentReplicationUnregistrar from '@app/contexts/content-replication/application/unregister-content/ContentReplicationUnregistrar';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
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

import { DeleteContentReplicationBody } from '../bodies/DeleteContentReplicationBody';
import { DeleteContentReplicationRequest } from '../requests/DeleteContentReplicationRequest';

@JsonController('/ipfs')
export class DeleteContentReplicationRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly unregistrar = this.get<ContentReplicationUnregistrar>(
    ContentReplicationUnregistrar,
  );

  @Delete('/replication/:cid')
  public async request(
    @Param('cid') cid: string,
    @Body() body: DeleteContentReplicationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);

    await this.unregistrar.unregister(
      new DeleteContentReplicationRequest(
        identityId.valueOf(),
        cid,
        body,
      ).getMessage(),
    );

    return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
  }
}
