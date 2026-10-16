import { Duration } from '@haskou/value-objects';

/** Operator-configured bounds for fetching adopted block lists, bound by composition. */
export class NodeBlockSourceFetchLimits {
  constructor(
    /** How long a source's last fetch stays fresh before it is fetched again. */
    public readonly interval: Duration,
    /** A downloaded document is abandoned as soon as it passes this size. */
    public readonly maxBytes: number,
    /** Total time for one download, from resolving to the last byte. */
    public readonly timeout: Duration,
  ) {}
}
