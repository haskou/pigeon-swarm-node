import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class PatchNotificationBody {
  @IsString()
  @IsNotEmpty()
  @IsIn(['accepted', 'declined'])
  public readonly state: 'accepted' | 'declined';
}
