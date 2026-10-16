import { assert, StringValueObject } from '@haskou/value-objects';

import { InvalidNodeBlockSourceOriginError } from '../errors/InvalidNodeBlockSourceOriginError';

/**
 * Where an adopted source publishes its list: a bare https origin such as
 * `https://node.example`. The published path is fixed, so nothing else of a
 * URL is accepted, and the value is stored in normalised origin form.
 */
export class NodeBlockSourceOrigin extends StringValueObject {
  private static parse(value: string): URL | undefined {
    try {
      return new URL(value);
    } catch {
      return undefined;
    }
  }

  /** The serialised URL keeps credentials, path, an empty `?` or `#`, so it must equal the bare origin. */
  private static isBareHttpsOrigin(value: string): boolean {
    const url = NodeBlockSourceOrigin.parse(value);

    return (
      url !== undefined &&
      url.protocol === 'https:' &&
      url.href === `${url.origin}/`
    );
  }

  constructor(value: string | StringValueObject) {
    const raw = value.valueOf().trim();

    assert(
      NodeBlockSourceOrigin.isBareHttpsOrigin(raw),
      new InvalidNodeBlockSourceOriginError(),
    );

    super((NodeBlockSourceOrigin.parse(raw) as URL).origin);
  }

  /** The URL a source serves its published list at. */
  public publishedListUrl(): URL {
    return new URL('/node/blocks/published', this.valueOf());
  }
}
