import DiagnosticsSessionExporter from '@app/contexts/diagnostics/application/export/DiagnosticsSessionExporter';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, Req, Res } from 'routing-controllers';

import { NodeDiagnosticsViewModel } from '../view-model/NodeDiagnosticsViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/diagnostics')
export class GetNodeDiagnosticsRoute extends NodeOwnerRouteSupport {
  private readonly exporter = this.get<DiagnosticsSessionExporter>(
    DiagnosticsSessionExporter,
  );

  @Get('/')
  public async getDiagnostics(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertOwnerCanManageNode(request);

    const session = await this.exporter.export();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeDiagnosticsViewModel(session).toResource());
  }
}
