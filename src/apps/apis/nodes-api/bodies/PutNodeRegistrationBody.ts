import { IsIn } from 'class-validator';

export class PutNodeRegistrationBody {
  @IsIn(['open', 'codes', 'closed'])
  public readonly mode!: string;
}
