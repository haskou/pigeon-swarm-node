import { DiagnosticsEntry } from '../../../domain/value-objects/DiagnosticsEntry';

export class DiagnosticsEntryRecordMessage {
  constructor(public readonly entry: string) {}

  public getEntry(): DiagnosticsEntry {
    return new DiagnosticsEntry(this.entry);
  }
}
