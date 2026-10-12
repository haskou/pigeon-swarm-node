import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

import { DeviceSealedSecretEntryBody } from './DeviceSealedSecretEntryBody';

export class PutDeviceSealedSecretBundleBody {
  @IsInt()
  @Min(0)
  public readonly authorizationRevision: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => DeviceSealedSecretEntryBody)
  public readonly entries: DeviceSealedSecretEntryBody[];

  @IsInt()
  @Min(1)
  public readonly generation: number;
}
