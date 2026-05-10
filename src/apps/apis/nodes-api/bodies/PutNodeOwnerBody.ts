import { IsOptional, IsString } from 'class-validator';

export class PutNodeOwnerBody {
  @IsOptional()
  @IsString()
  public readonly identityId?: string;
}
