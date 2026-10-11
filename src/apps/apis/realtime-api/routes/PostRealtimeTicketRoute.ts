import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { realtimeTicketStore } from '@app/shared/infrastructure/websocket/RealtimeTicketStore';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { JsonController, Post, Req, Res } from 'routing-controllers';

import { RealtimeTicketCapacityExceededError } from '../errors/RealtimeTicketCapacityExceededError';

@JsonController('/realtime/v1')
export class PostRealtimeTicketRoute extends Route {
  private readonly authenticator = this.get<SignedHttpRequestAuthenticator>(
    SignedHttpRequestAuthenticator,
  );

  @Post('/tickets')
  public async issueTicket(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticator.authenticate(request);
    const issued = realtimeTicketStore.issue(identityId.valueOf());

    if (!issued) {
      throw new RealtimeTicketCapacityExceededError();
    }

    response.setHeader('Cache-Control', 'no-store');

    return response.status(HttpRouteStatusEnum.CREATED).send({
      expiresAt: issued.expiresAt,
      ticket: issued.ticket,
    });
  }
}
