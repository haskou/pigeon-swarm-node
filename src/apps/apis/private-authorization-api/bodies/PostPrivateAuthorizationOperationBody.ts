import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PrivateAuthorizationBodyFieldLimits } from './PrivateAuthorizationBodyFieldLimits';
import { PrivateControlFrameBody } from './PrivateControlFrameBody';

export class PostPrivateAuthorizationOperationBody {
  @IsOptional()
  @ValidateNested()
  @Type(() => PrivateControlFrameBody)
  public readonly controlFrame?: PrivateControlFrameBody;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.signedJson)
  public readonly signedFreshnessProofJson: string;

  @IsString()
  @MaxLength(PrivateAuthorizationBodyFieldLimits.signedJson)
  public readonly signedOperationJson: string;
}
