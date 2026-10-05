import { IsObject } from 'class-validator';

export class DeleteCommunityChannelMessageBody {
  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
