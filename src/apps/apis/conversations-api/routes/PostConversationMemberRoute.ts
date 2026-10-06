import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostConversationMemberBody } from '../bodies/PostConversationMemberBody';
import { ConversationMemberRouteSupport } from './ConversationMemberRouteSupport';

@JsonController('/conversations')
export class PostConversationMemberRoute extends ConversationMemberRouteSupport {
  @Post('/:conversationId/members')
  public async addMember(
    @Param('conversationId') conversationId: string,
    @Body() body: PostConversationMemberBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    return this.change(request, response, {
      action: ConversationOperationAction.MEMBER_ADDED,
      conversationId,
      operation: body.operation,
      targetIdentityId: body.identityId,
    });
  }
}
