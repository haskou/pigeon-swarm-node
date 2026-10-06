import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class PatchNotificationBody {
  @IsString()
  @IsNotEmpty()
  @IsIn(['accepted', 'declined'])
  public readonly state: 'accepted' | 'declined';

  @IsObject()
  public readonly mutation: Record<string, unknown>;
}
