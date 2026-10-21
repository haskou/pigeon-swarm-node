/**
 * Tells a "not found" answer apart from every other retrieval failure
 * (timeout, abort, network, I/O). Only the former may ever read as absence;
 * the latter leaves the lookup unverified.
 *
 * A local datastore not-found is definitive. A DHT not-found is not verified
 * absence: kad-dht throws it whenever its query finishes without a value, so
 * it only means every router's query ended empty. A connected node treats it
 * as absence, which peers able to eclipse the DHT can force.
 *
 * Matches by error name because the libp2p, interface-store and Helia
 * packages each ship their own `NotFoundError` class.
 */
export default class IPFSVerifiedAbsence {
  private static readonly NOT_FOUND_NAME = 'NotFoundError';

  public static isVerified(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error instanceof AggregateError) {
      // Every router must have answered not found; an empty list proves nothing.
      return (
        error.errors.length > 0 &&
        error.errors.every((inner) => IPFSVerifiedAbsence.isVerified(inner))
      );
    }

    return error.name === IPFSVerifiedAbsence.NOT_FOUND_NAME;
  }
}
