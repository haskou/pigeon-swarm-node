import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PrivateControlFrameBody } from './PrivateControlFrameBody';

export class PostPrivateAuthorizationChallengeBody {
  @IsOptional()
  @ValidateNested()
  @Type(() => PrivateControlFrameBody)
  public readonly controlFrame?: PrivateControlFrameBody;

  @IsString()
  @MaxLength(262_144)
  public readonly signedOperationJson: string;
}
