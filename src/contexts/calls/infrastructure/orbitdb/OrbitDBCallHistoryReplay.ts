import { OrbitDBCallDocument } from './documents/OrbitDBCallDocument';

export default class OrbitDBCallHistoryReplay {
  public readonly documents = new Map<string, OrbitDBCallDocument>();
  public readonly incoming = new Map<string, OrbitDBCallDocument>();
}
