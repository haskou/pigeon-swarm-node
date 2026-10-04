import { IsObject } from 'class-validator';

export class DeleteConversationMessagePinBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
