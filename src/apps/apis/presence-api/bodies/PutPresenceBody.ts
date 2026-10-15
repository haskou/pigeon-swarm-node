import { IsIn, IsOptional } from 'class-validator';

const selectableStatuses = ['available', 'away', 'busy', 'custom', 'invisible'];

export class PutPresenceBody {
  @IsOptional()
  @IsIn(selectableStatuses)
  public status?: string;
}
