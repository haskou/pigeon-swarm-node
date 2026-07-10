import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';

import { CallParticipantMediaConnectionBody } from './CallParticipantMediaConnectionBody';

export class PostCallParticipantHeartbeatBody {
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => CallParticipantMediaConnectionBody)
  public readonly mediaConnections: CallParticipantMediaConnectionBody[];
}
