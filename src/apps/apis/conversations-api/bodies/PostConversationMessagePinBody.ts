import { IsInt, IsObject, Min } from 'class-validator';

export class PostConversationMessagePinBody {
  @IsInt()
  @Min(0)
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
