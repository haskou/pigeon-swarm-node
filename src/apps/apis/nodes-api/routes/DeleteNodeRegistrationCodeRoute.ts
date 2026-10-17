import { NodeRegistrationCodeRevokerMessage } from '@app/contexts/nodes/application/revoke-registration-code/messages/NodeRegistrationCodeRevokerMessage';
import NodeRegistrationCodeRevoker from '@app/contexts/nodes/application/revoke-registration-code/NodeRegistrationCodeRevoker';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/registration-codes')
export class DeleteNodeRegistrationCodeRoute extends NodeOwnerRouteSupport {
  private readonly revoker = this.get<NodeRegistrationCodeRevoker>(
    NodeRegistrationCodeRevoker,
  );

  @Delete('/:codeId')
  public async deleteRegistrationCode(
    @Param('codeId') codeId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.writeAsNodeOwner(request, () =>
      this.revoker.revoke(new NodeRegistrationCodeRevokerMessage(codeId)),
    );

    return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
  }
}
