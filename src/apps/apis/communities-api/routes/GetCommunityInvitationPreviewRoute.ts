import CommunityInvitationPreviewer from '@app/contexts/communities/application/preview-invitation/CommunityInvitationPreviewer';
import { CommunityInvitationPreviewMessage } from '@app/contexts/communities/application/preview-invitation/messages/CommunityInvitationPreviewMessage';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { DomainError } from '@haskou/value-objects';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  NotFoundError,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { CommunityInvitationPreviewViewModel } from '../view-model/CommunityInvitationPreviewViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

/**
 * Unsigned, so a link holder previews before it has an identity. The
 * invitation key travels in the Authorization header, never in the URL, so
 * it stays out of access logs. A missing or malformed key, an unknown one or
 * an unusable invitation is refused exactly like an unknown community.
 */
@JsonController('/communities')
export class GetCommunityInvitationPreviewRoute extends CommunityRouteSupport {
  private readonly previewer = this.get<CommunityInvitationPreviewer>(
    CommunityInvitationPreviewer,
  );

  @Get('/:communityId/invitation-preview')
  public async previewInvitation(
    @Param('communityId') communityId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(
      request.header('authorization') ?? '',
    );

    if (!match) throw new NotFoundError('Community not found.');

    try {
      const { community, invitation } = await this.previewer.preview(
        new CommunityInvitationPreviewMessage(communityId, match[1]),
      );

      return response
        .status(HttpRouteStatusEnum.OK)
        .send(
          new CommunityInvitationPreviewViewModel(
            community,
            invitation,
          ).toResource(),
        );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new NotFoundError('Community not found.');
      }

      throw error;
    }
  }
}
