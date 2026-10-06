import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { Request, Response } from 'express';
import {
  Body,
  Delete,
  JsonController,
  Param,
  Req,
  Res,
} from 'routing-controllers';

import { ConversationSignedOperationBody } from '../bodies/ConversationSignedOperationBody';
import { ConversationMemberRouteSupport } from './ConversationMemberRouteSupport';

@JsonController('/conversations')
export class DeleteConversationMemberRoute extends ConversationMemberRouteSupport {
  /** Declared first so `me` is never read as an identity. */
  @Delete('/:conversationId/members/me')
  public async leave(
    @Param('conversationId') conversationId: string,
    @Body() body: ConversationSignedOperationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    return this.change(request, response, {
      action: ConversationOperationAction.MEMBER_LEFT,
      conversationId,
      operation: body.operation,
    });
  }

  @Delete('/:conversationId/members/:identityId')
  public async removeMember(
    @Param('conversationId') conversationId: string,
    @Param('identityId') identityId: string,
    @Body() body: ConversationSignedOperationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    return this.change(request, response, {
      action: ConversationOperationAction.MEMBER_REMOVED,
      conversationId,
      operation: body.operation,
      targetIdentityId: identityId,
    });
  }
}
