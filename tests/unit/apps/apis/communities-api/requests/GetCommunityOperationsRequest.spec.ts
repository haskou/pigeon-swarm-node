import { InvalidCommunityOperationsQueryError } from '@app/apps/apis/communities-api/errors/InvalidCommunityOperationsQueryError';
import { GetCommunityOperationsRequest } from '@app/apps/apis/communities-api/requests/GetCommunityOperationsRequest';

import {
  alice,
  communityId,
  genesis,
} from '../../../../contexts/communities/domain/operations/CommunityOperationFixtures';

describe(GetCommunityOperationsRequest.name, () => {
  const messageOf = (after: unknown, limit: unknown) =>
    new GetCommunityOperationsRequest(
      communityId.valueOf(),
      alice.valueOf(),
      after,
      limit,
    ).getMessage();

  it('reads the first page of 500 operations when no query is given', () => {
    const message = messageOf(undefined, undefined);

    expect(message.communityId.valueOf()).toBe(communityId.valueOf());
    expect(message.actorIdentityId.valueOf()).toBe(alice.valueOf());
    expect(message.after).toBeUndefined();
    expect(message.limit).toBe(500);
  });

  it.each([
    ['1', 1],
    ['42', 42],
    ['500', 500],
  ])('reads a limit of %s', (limit, expected) => {
    expect(messageOf(undefined, limit).limit).toBe(expected);
  });

  it('reads after an operation digest', () => {
    const digest = genesis().getHash();

    expect(messageOf(digest, '1').after).toBe(digest);
  });

  it.each([
    [''],
    ['0'],
    ['01'],
    ['501'],
    ['1000'],
    ['-1'],
    ['1.5'],
    ['abc'],
    [['1', '2']],
  ])('rejects the limit %p', (limit) => {
    expect(() => messageOf(undefined, limit)).toThrow(
      InvalidCommunityOperationsQueryError,
    );
  });

  it.each([
    [''],
    ['A'.repeat(42)],
    ['A'.repeat(44)],
    [`${'A'.repeat(42)}=`],
    [`${'A'.repeat(42)}+`],
    [['A'.repeat(43)]],
  ])('rejects the after digest %p', (after) => {
    expect(() => messageOf(after, undefined)).toThrow(
      InvalidCommunityOperationsQueryError,
    );
  });

  it('answers an invalid query with a 400 coded 400060', () => {
    const error = new InvalidCommunityOperationsQueryError();

    expect(error.httpCode).toBe(400);
    expect(error.code).toBe(400060);
  });
});
