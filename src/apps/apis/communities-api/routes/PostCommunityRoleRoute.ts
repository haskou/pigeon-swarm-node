import CommunityRoleCreator from '@app/contexts/communities/application/create-role/CommunityRoleCreator';
import { CommunityRoleCreateMessage } from '@app/contexts/communities/application/create-role/messages/CommunityRoleCreateMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityRoleBody } from '../bodies/CommunityRoleBody';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostCommunityRoleRoute extends CommunityRouteSupport {
  private readonly creator =
    this.get<CommunityRoleCreator>(CommunityRoleCreator);

  @Post('/:communityId/roles')
  public async addRole(
    @Param('communityId') communityId: string,
    @Body() body: CommunityRoleBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const role = await this.creator.create(
      new CommunityRoleCreateMessage(
        communityId,
        actorIdentityId.valueOf(),
        body.name,
        body.permissions,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send(role.toPrimitives());
  }
}
