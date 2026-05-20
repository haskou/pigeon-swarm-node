import { CommunityPermission } from '@app/contexts/communities/domain/value-objects/CommunityPermission';
import { CommunityRoleName } from '@app/contexts/communities/domain/value-objects/CommunityRoleName';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
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
  @Post('/:communityId/roles')
  public async addRole(
    @Param('communityId') communityId: string,
    @Body() body: CommunityRoleBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const community = await this.findCommunity(communityId);
    const role = community.addRole(
      actorIdentityId,
      new CommunityRoleName(body.name),
      body.permissions.map((permission) => new CommunityPermission(permission)),
    );

    await this.repository().save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return response.status(HttpRouteStatusEnum.OK).send(role.toPrimitives());
  }
}
