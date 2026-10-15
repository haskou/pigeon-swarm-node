import { Timestamp } from '@haskou/value-objects';

import { NodeBlockSourceFetchPrimitives } from './NodeBlockSourceFetchPrimitives';

/** The last fetch of an adopted source; `NoNodeBlockSourceFetch` before the first one. */
export abstract class NodeBlockSourceFetch {
  public abstract wasBefore(threshold: Timestamp): boolean;
  public abstract toPrimitives(): NodeBlockSourceFetchPrimitives | null;
}
