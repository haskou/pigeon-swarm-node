import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPresenceUpdater from '@app/contexts/presence/application/update/IdentityPresenceUpdater';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Put, Req, Res } from 'routing-controllers';

import { PutPresenceBody } from '../bodies/PutPresenceBody';
import { PutPresenceRequest } from '../requests/PutPresenceRequest';
import { IdentityPresenceViewModel } from '../view-model/IdentityPresenceViewModel';

@JsonController('/presence')
export class PutPresenceRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly updater = this.get<IdentityPresenceUpdater>(
    IdentityPresenceUpdater,
  );

  @Put('/me')
  public async putPresence(
    @Body() body: PutPresenceBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presence = await this.updater.update(
      new PutPresenceRequest(identityId.valueOf(), body).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new IdentityPresenceViewModel(presence, identityId).toResource());
  }
}
