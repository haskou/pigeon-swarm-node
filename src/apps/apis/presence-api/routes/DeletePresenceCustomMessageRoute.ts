import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IdentityPresenceUpdater from '@app/contexts/presence/application/update/IdentityPresenceUpdater';
import { IdentityPresenceUpdateMessage } from '@app/contexts/presence/application/update/messages/IdentityPresenceUpdateMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Req, Res } from 'routing-controllers';

import { IdentityPresenceViewModel } from '../view-model/IdentityPresenceViewModel';

@JsonController('/presence')
export class DeletePresenceCustomMessageRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly updater = this.get<IdentityPresenceUpdater>(
    IdentityPresenceUpdater,
  );

  @Delete('/me/custom-message')
  public async deleteCustomMessage(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const presence = await this.updater.clearCustomMessage(
      new IdentityPresenceUpdateMessage(identityId.valueOf()),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new IdentityPresenceViewModel(presence, identityId).toResource());
  }
}
