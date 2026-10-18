import { CallResource } from './CallResource';

export interface CallsResource {
  calls: CallResource[];
  nextCursor: string | null;
}
