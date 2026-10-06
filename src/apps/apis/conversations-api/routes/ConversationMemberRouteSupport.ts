import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationMemberChanger from '@app/contexts/conversations/application/change-members/ConversationMemberChanger';
import { ConversationMemberChangeMessage } from '@app/contexts/conversations/application/change-members/messages/ConversationMemberChangeMessage';
import { ConversationOperationAction } from '@app/contexts/conversations/domain/value-objects/ConversationOperationAction';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';

import { ConversationOperationBody } from '../bodies/ConversationOperationBody';
import { ConversationViewModel } from '../view-model/ConversationViewModel';

/** Shared flow of the endpoints that carry one signed group change. */
export abstract class ConversationMemberRouteSupport extends Route {
  private readonly changer = this.get<ConversationMemberChanger>(
    ConversationMemberChanger,
  );

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  protected async change(
    request: Request,
    response: Response,
    change: {
      action: ConversationOperationAction;
      conversationId: string;
      operation: ConversationOperationBody;
      targetIdentityId?: string;
    },
  ): Promise<Response> {
    const actorIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const conversation = await this.changer.change(
      new ConversationMemberChangeMessage(
        change.conversationId,
        actorIdentityId.valueOf(),
        change.action,
        change.operation,
        change.targetIdentityId,
      ),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new ConversationViewModel(conversation).toResource());
  }
}
