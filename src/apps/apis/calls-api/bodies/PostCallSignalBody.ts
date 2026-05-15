import { IsEnum, IsObject, IsString } from 'class-validator';

enum PostCallSignalType {
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice_candidate',
  OFFER = 'offer',
}

export class PostCallSignalBody {
  @IsString()
  public readonly recipientIdentityId: string;

  @IsEnum(PostCallSignalType)
  public readonly signalType: PostCallSignalType;

  @IsObject()
  public readonly payload: Record<string, unknown>;
}
