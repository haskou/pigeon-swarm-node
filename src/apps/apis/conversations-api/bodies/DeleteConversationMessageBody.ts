import { IsInt, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class DeleteConversationMessageBody {
  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsInt()
  public readonly createdAt: number;

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
