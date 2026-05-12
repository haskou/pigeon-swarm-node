import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class DeleteCommunityChannelMessageBody {
  @IsInt()
  public readonly createdAt: number;

  @IsString()
  @IsNotEmpty()
  public readonly id: string;

  @IsString()
  @IsNotEmpty()
  public readonly signature: string;
}
