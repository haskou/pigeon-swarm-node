import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { PushSubscriptionKeysBody } from './PushSubscriptionKeysBody';

export class PushSubscriptionBody {
  @IsString()
  @IsNotEmpty()
  public endpoint!: string;

  @IsOptional()
  @IsInt()
  public expirationTime?: number | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysBody)
  public keys!: PushSubscriptionKeysBody;
}
