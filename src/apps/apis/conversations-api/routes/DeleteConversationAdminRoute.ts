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
export class DeleteConversationAdminRoute extends ConversationMemberRouteSupport {
  @Delete('/:conversationId/admins/:identityId')
  public async demoteAdmin(
    @Param('conversationId') conversationId: string,
    @Param('identityId') identityId: string,
    @Body() body: ConversationSignedOperationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    return this.change(request, response, {
      action: ConversationOperationAction.ADMIN_DEMOTED,
      conversationId,
      operation: body.operation,
      targetIdentityId: identityId,
    });
  }
}
