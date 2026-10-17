import DiagnosticsSessionOpener from '@app/contexts/diagnostics/application/open/DiagnosticsSessionOpener';
import { DiagnosticsSessionOpenMessage } from '@app/contexts/diagnostics/application/open/messages/DiagnosticsSessionOpenMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutNodeDiagnosticsBody } from '../bodies/PutNodeDiagnosticsBody';
import { NodeDiagnosticsViewModel } from '../view-model/NodeDiagnosticsViewModel';
import { NodeOwnerRouteSupport } from './NodeOwnerRouteSupport';

@JsonController('/node/diagnostics')
export class PutNodeDiagnosticsRoute extends NodeOwnerRouteSupport {
  private readonly opener = this.get<DiagnosticsSessionOpener>(
    DiagnosticsSessionOpener,
  );

  @Put('/')
  public async putDiagnostics(
    @Body() body: PutNodeDiagnosticsBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const session = await this.writeAsNodeOwner(request, () =>
      this.opener.open(
        new DiagnosticsSessionOpenMessage(body.minutes, body.consent),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NodeDiagnosticsViewModel(session).toResource());
  }
}
