import { InvalidCommunityOperationsQueryError } from '@app/apps/apis/communities-api/errors/InvalidCommunityOperationsQueryError';
import { GetCommunityOperationsRequest } from '@app/apps/apis/communities-api/requests/GetCommunityOperationsRequest';
import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';

import {
  alice,
  communityId,
  genesis,
} from '../../../../contexts/communities/domain/operations/CommunityOperationFixtures';

describe(GetCommunityOperationsRequest.name, () => {
  const scope = `communities/${communityId.valueOf()}/operations`;

  const messageOf = (cursor: string | undefined, limit: unknown) =>
    new GetCommunityOperationsRequest(
      communityId.valueOf(),
      alice.valueOf(),
      cursor,
      limit,
    ).getMessage();

  it('reads the first page of 50 operations when no query is given', () => {
    const message = messageOf(undefined, undefined);

    expect(message.communityId.valueOf()).toBe(communityId.valueOf());
    expect(message.actorIdentityId.valueOf()).toBe(alice.valueOf());
    expect(message.after).toBeUndefined();
    expect(message.limit).toBe(50);
  });

  it.each([
    ['1', 1],
    ['42', 42],
    ['100', 100],
  ])('reads a limit of %s', (limit, expected) => {
    expect(messageOf(undefined, limit).limit).toBe(expected);
  });

  it('reads after the operation digest a cursor carries', () => {
    const digest = genesis().getHash();
    const cursor = PageCursor.encode({ position: digest, resource: scope });

    expect(messageOf(cursor, '1').after).toBe(digest);
  });

  it.each([
    ['101'],
    ['501'],
    ['1000'],
    [''],
    ['0'],
    ['01'],
    ['-1'],
    ['1.5'],
    ['abc'],
    [['1', '2']],
  ])('rejects the limit %p', (limit) => {
    expect(() => messageOf(undefined, limit)).toThrow(
      InvalidCommunityOperationsQueryError,
    );
  });

  it('refuses a cursor issued for another list', () => {
    const cursor = PageCursor.encode({
      position: genesis().getHash(),
      resource: `communities/${communityId.valueOf()}/moderation-logs`,
    });

    expect(() => messageOf(cursor, undefined)).toThrow(InvalidPageCursorError);
  });

  it('refuses a cursor whose position is not an operation digest', () => {
    const cursor = PageCursor.encode({
      position: 'not-a-digest',
      resource: scope,
    });

    expect(() => messageOf(cursor, undefined)).toThrow(InvalidPageCursorError);
  });

  it.each([['not-a-cursor'], ['']])(
    'refuses the malformed cursor %p',
    (cursor) => {
      expect(() => messageOf(cursor, undefined)).toThrow(
        InvalidPageCursorError,
      );
    },
  );

  it('answers an invalid query with a 400 coded 400060', () => {
    const error = new InvalidCommunityOperationsQueryError();

    expect(error.httpCode).toBe(400);
    expect(error.code).toBe(400060);
  });
});
