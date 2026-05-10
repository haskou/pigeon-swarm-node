import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { NodeOwnerAssignerMessage } from '@app/contexts/nodes/application/assign-owner/messages/NodeOwnerAssignerMessage';
import NodeOwnerAssigner from '@app/contexts/nodes/application/assign-owner/NodeOwnerAssigner';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeOwnerBody } from '../bodies/PutNodeOwnerBody';
import { NodeViewModel } from '../view-model/NodeViewModel';

@JsonController('/node/owner')
export class PutNodeOwnerRoute extends Route {
  private readonly assigner: NodeOwnerAssigner =
    this.get<NodeOwnerAssigner>(NodeOwnerAssigner);

  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Put('/')
  public async putOwner(
    @Body() body: PutNodeOwnerBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const ownerIdentityId =
      body.identityId ?? authenticatedIdentityId.valueOf();

    await this.assigner.assignOwner(
      new NodeOwnerAssignerMessage(
        ownerIdentityId,
        authenticatedIdentityId.valueOf(),
      ),
    );

    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeViewModel(node).toResource());
  }
}
