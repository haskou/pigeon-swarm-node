/**
 * Tells a definitive "this store answered: not found" apart from every other
 * retrieval failure (timeout, abort, network, I/O). Only the former may ever
 * read as absence; the latter leaves the lookup unverified.
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
