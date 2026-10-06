import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { ConversationSignedOperationBody } from '../bodies/ConversationSignedOperationBody';
import { ConversationMemberRouteSupport } from './ConversationMemberRouteSupport';

@JsonController('/conversations')
export class PutConversationAdminRoute extends ConversationMemberRouteSupport {
  @Put('/:conversationId/admins/:identityId')
  public async promoteAdmin(
    @Param('conversationId') conversationId: string,
    @Param('identityId') identityId: string,
    @Body() body: ConversationSignedOperationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    return this.change(request, response, {
      action: ConversationOperationAction.ADMIN_PROMOTED,
      conversationId,
      operation: body.operation,
      targetIdentityId: identityId,
    });
  }
}
