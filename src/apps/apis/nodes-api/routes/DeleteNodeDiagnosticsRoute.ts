import DiagnosticsSessionCloser from '@app/contexts/diagnostics/application/close/DiagnosticsSessionCloser';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Req, Res } from 'routing-controllers';

import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/diagnostics')
export class DeleteNodeDiagnosticsRoute extends NodeOwnerRouteSupport {
  private readonly closer = this.get<DiagnosticsSessionCloser>(
    DiagnosticsSessionCloser,
  );

  @Delete('/')
  public async deleteDiagnostics(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.writeAsNodeOwner(request, () => this.closer.close());

    return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
  }
}
