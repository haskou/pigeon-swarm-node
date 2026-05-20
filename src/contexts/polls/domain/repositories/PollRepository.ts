import { Poll } from '../Poll';
import { PollId } from '../value-objects/PollId';

export interface PollRepository {
  findById(id: PollId): Promise<Poll | undefined>;
  save(poll: Poll): Promise<void>;
}
