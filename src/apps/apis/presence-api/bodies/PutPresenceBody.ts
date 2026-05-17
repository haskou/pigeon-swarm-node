import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const selectableStatuses = ['available', 'away', 'busy', 'custom', 'invisible'];

export class PutPresenceBody {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public customMessage?: string;

  @IsOptional()
  @IsIn(selectableStatuses)
  public status?: string;
}
