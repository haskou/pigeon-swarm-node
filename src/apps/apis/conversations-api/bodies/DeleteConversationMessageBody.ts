import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class DeleteConversationMessageBody {
  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
