import { NodeBlockSourceFetch } from './NodeBlockSourceFetch';
import { NodeBlockSourceFetchPrimitives } from './NodeBlockSourceFetchPrimitives';

/** Null Object for a source never fetched yet: it is always due. */
export class NoNodeBlockSourceFetch extends NodeBlockSourceFetch {
  public wasBefore(): boolean {
    return true;
  }

  public toPrimitives(): NodeBlockSourceFetchPrimitives | null {
    return null;
  }
}
