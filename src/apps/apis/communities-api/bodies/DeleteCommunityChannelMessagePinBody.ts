import { IsObject } from 'class-validator';

export class DeleteCommunityChannelMessagePinBody {
  @IsObject()
  public mutation!: Record<string, unknown>;
}
