import NodeReadiness from '@app/apps/NodeReadiness';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Response } from 'express';
import { Get, JsonController, Res } from 'routing-controllers';

@JsonController('/node/readiness')
export class GetNodeReadinessRoute extends Route {
  private readonly readiness: NodeReadiness =
    this.get<NodeReadiness>(NodeReadiness);

  @Get()
  public getNodeReadiness(@Res() response: Response): Response {
    const ready = this.readiness.isReady();

    return response
      .status(
        ready
          ? HttpRouteStatusEnum.OK
          : HttpRouteStatusEnum.SERVICE_UNAVAILABLE,
      )
      .set('Cache-Control', 'no-store')
      .send({ status: ready ? 'ready' : 'not_ready' });
  }
}
