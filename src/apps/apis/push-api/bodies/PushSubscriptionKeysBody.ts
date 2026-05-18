import { IsNotEmpty, IsString } from 'class-validator';

export class PushSubscriptionKeysBody {
  @IsString()
  @IsNotEmpty()
  public auth!: string;

  @IsString()
  @IsNotEmpty()
  public p256dh!: string;
}
