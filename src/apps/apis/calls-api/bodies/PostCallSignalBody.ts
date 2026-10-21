import { CallSignal } from '@app/contexts/calls/domain/CallSignal';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsEnum,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PostCallSealedEntryBody } from './PostCallSealedEntryBody';

enum PostCallSignalType {
  ANSWER = 'answer',
  ICE_CANDIDATE = 'ice_candidate',
  OFFER = 'offer',
}

export class PostCallSignalBody {
  @IsString()
  public readonly callId: string;

  @IsInt()
  public readonly createdAt: number;

  @IsInt()
  public readonly expiresAt: number;

  @IsString()
  public readonly networkId: string;

  @IsString()
  public readonly recipientIdentityId: string;

  @IsIn(['conversation', 'community_channel'])
  public readonly scopeType: string;

  @ArrayMinSize(1)
  @ArrayMaxSize(CallSignal.MAX_SEALED_ENTRIES)
  @ArrayUnique(
    (entry: PostCallSealedEntryBody) => entry.recipientDeviceCredential,
  )
  @ValidateNested({ each: true })
  @Type(() => PostCallSealedEntryBody)
  public readonly sealedEntries: PostCallSealedEntryBody[];

  @IsString()
  @MaxLength(CallSignal.MAX_CREDENTIAL_LENGTH)
  public readonly senderDeviceCredential: string;

  @IsString()
  public readonly senderIdentityId: string;

  @IsString()
  public readonly signalId: string;

  @IsEnum(PostCallSignalType)
  public readonly signalType: PostCallSignalType;

  @IsString()
  @MaxLength(CallSignal.MAX_SIGNATURE_LENGTH)
  public readonly signature: string;
}
