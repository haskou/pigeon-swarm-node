import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PutConversationDraftBody {
  /**
   * A sealed 4 000-character draft stays under 33 000 characters even when
   * every character escapes in JSON; the limit doubles that so the eviction
   * cap also bounds the bytes an identity stores.
   */
  public static readonly ENCRYPTED_PAYLOAD_MAX_LENGTH = 65_536;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PutConversationDraftBody.ENCRYPTED_PAYLOAD_MAX_LENGTH)
  public readonly encryptedPayload: string;

  @IsOptional()
  @IsInt()
  public readonly updatedAt?: number;
}
