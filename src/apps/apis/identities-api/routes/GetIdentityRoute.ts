import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Get, JsonController, Param, Res } from 'routing-controllers';

import { IdentityViewModel } from '../view-model/IdentityViewModel';

@JsonController('/identities')
export class GetIdentityRoute extends Route {
  private readonly finder: IdentityFinder =
    this.get<IdentityFinder>(IdentityFinder);

  @Get('/:identityId')
  public async getIdentity(
    @Param('identityId') identityId: string,
    @Res() response: Response,
  ): Promise<Response> {
    const identity = await this.finder.find(
      new IdentityFinderMessage(decodeURIComponent(identityId)),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new IdentityViewModel(identity).toResource());
  }
}
