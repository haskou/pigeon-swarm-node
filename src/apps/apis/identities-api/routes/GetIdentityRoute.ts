import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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
    const candidate = await this.finder.findCandidate(
      new IdentityFinderMessage(decodeURIComponent(identityId)),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(
        new IdentityViewModel(
          candidate.getIdentity(),
          candidate.getExternalIdentifier(),
        ).toResource(),
      );
  }
}
