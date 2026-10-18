import { InvalidPresenceIdentityIdsError } from '@app/apps/apis/presence-api/errors/InvalidPresenceIdentityIdsError';
import { IdentityPresenceFindMessage } from '@app/contexts/presence/application/find/messages/IdentityPresenceFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert } from '@haskou/value-objects';

export class GetPresenceListRequest {
  private static readonly MAX_IDENTITY_IDS = 100;

  /** The one canonical encoding of a usable key, written exactly so. */
  private static isCanonicalIdentityId(identityId: string): boolean {
    try {
      const canonical = new IdentityId(identityId);

      return canonical.valueOf() === identityId && canonical.isCanonicalKey();
    } catch {
      return false;
    }
  }

  constructor(
    private readonly viewerIdentityId: string,
    private readonly query: Record<string, unknown> = {},
  ) {}

  /**
   * Absent means no ids. Otherwise the distinct ids asked for, in request
   * order: 1 to 100 canonical ids, comma-separated or repeated. An object-form
   * parameter (`identityIds[x]=`, however the query parser reads it), a
   * non-string value, a blank item, a non-canonical id or a count over the cap
   * is refused, not dropped.
   */
  private getIdentityIds(): string[] {
    assert(
      !Object.keys(this.query).some((key) => key.startsWith('identityIds[')),
      new InvalidPresenceIdentityIdsError(),
    );

    const value = this.query.identityIds;

    if (value === undefined) {
      return [];
    }

    const values: unknown[] = Array.isArray(value) ? value : [value];
    const strings = values.filter(
      (item): item is string => typeof item === 'string',
    );

    assert(
      strings.length === values.length,
      new InvalidPresenceIdentityIdsError(),
    );

    const identityIds = [
      ...new Set(
        strings
          .flatMap((item) => item.split(','))
          .map((identityId) => identityId.trim()),
      ),
    ];

    assert(
      identityIds.length > 0 &&
        identityIds.length <= GetPresenceListRequest.MAX_IDENTITY_IDS &&
        identityIds.every((identityId) =>
          GetPresenceListRequest.isCanonicalIdentityId(identityId),
        ),
      new InvalidPresenceIdentityIdsError(),
    );

    return identityIds;
  }

  public getMessage(): IdentityPresenceFindMessage {
    return new IdentityPresenceFindMessage(
      this.viewerIdentityId,
      this.getIdentityIds(),
    );
  }
}
