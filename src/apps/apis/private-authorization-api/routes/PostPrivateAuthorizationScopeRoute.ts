import { NodeOwnerRouteSupport } from '@app/apps/apis/nodes-api/routes/NodeOwnerRouteSupport';
import { PrivateAuthorizationScopeProvisionMessage } from '@app/contexts/private-authorization/application/provision-scope/messages/PrivateAuthorizationScopeProvisionMessage';
import PrivateAuthorizationScopeProvisioner from '@app/contexts/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisioner';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostPrivateAuthorizationScopeBody } from '../bodies/PostPrivateAuthorizationScopeBody';
import { PrivateAuthorizationRequestBodyLimit } from './PrivateAuthorizationRequestBodyLimit';

@JsonController('/private-authorization')
export class PostPrivateAuthorizationScopeRoute extends NodeOwnerRouteSupport {
  private readonly provisioner = this.get<PrivateAuthorizationScopeProvisioner>(
    PrivateAuthorizationScopeProvisioner,
  );

  @Post('/scopes')
  public async provision(
    @Body({ options: { limit: PrivateAuthorizationRequestBodyLimit } })
    body: PostPrivateAuthorizationScopeBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticateNodeOwner(request);
    const result = await this.provisioner.provision(
      new PrivateAuthorizationScopeProvisionMessage(
        identityId.valueOf(),
        body.signedGenesisJson,
        body.protectedMlsState,
        body.projection,
      ),
    );
    const status = result.isAccepted()
      ? HttpRouteStatusEnum.CREATED
      : HttpRouteStatusEnum.OK;

    return response.status(status).send({ status: result.valueOf() });
  }
}
