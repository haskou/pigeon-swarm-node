import CommunityRoleDeleter from '@app/contexts/communities/application/delete-role/CommunityRoleDeleter';
import { CommunityRoleDeleteMessage } from '@app/contexts/communities/application/delete-role/messages/CommunityRoleDeleteMessage';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityViewModel } from '../view-model/CommunityViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class DeleteCommunityRoleRoute extends CommunityRouteSupport {
  private readonly deleter =
    this.get<CommunityRoleDeleter>(CommunityRoleDeleter);

  @Delete('/:communityId/roles/:roleId')
  public async deleteRole(
    @Param('communityId') communityId: string,
    @Param('roleId') roleId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.deleter.delete(
      new CommunityRoleDeleteMessage(
        communityId,
        roleId,
        actorIdentityId.valueOf(),
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CommunityViewModel(community).toResource());
  }
}
