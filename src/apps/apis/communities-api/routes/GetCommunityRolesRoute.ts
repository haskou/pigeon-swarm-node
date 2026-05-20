import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunityRolesRoute extends CommunityRouteSupport {
  @Get('/:communityId/roles')
  public async getRoles(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const primitives = community.toPrimitives();

    community.assertIsMember(actorIdentityId);

    return response.status(HttpRouteStatusEnum.OK).send({
      memberRoles: primitives.memberRoles,
      roles: primitives.roles,
    });
  }
}
