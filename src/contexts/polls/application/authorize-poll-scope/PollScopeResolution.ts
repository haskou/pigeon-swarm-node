import { PollAudience } from '../../domain/PollAudience';
import { PollScope } from '../../domain/PollScope';

export class PollScopeResolution {
  constructor(
    public readonly audience: PollAudience,
    public readonly scope: PollScope,
  ) {}
}
