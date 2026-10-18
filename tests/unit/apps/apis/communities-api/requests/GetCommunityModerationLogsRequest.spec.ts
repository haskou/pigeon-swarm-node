import { GetCommunityModerationLogsRequest } from '@app/apps/apis/communities-api/requests/GetCommunityModerationLogsRequest';
import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { ShortId } from '@haskou/value-objects';

import {
  alice,
  communityId,
} from '../../../../contexts/communities/domain/operations/CommunityOperationFixtures';

describe(GetCommunityModerationLogsRequest.name, () => {
  const scope = `communities/${communityId.valueOf()}/moderation-logs`;

  const messageOf = (cursor: string | undefined, limit: number | undefined) =>
    new GetCommunityModerationLogsRequest(
      communityId.valueOf(),
      alice.valueOf(),
      cursor,
      limit,
    ).getMessage();

  it('reads the newest 50 entries when no query is given', () => {
    const message = messageOf(undefined, undefined);

    expect(message.communityId.valueOf()).toBe(communityId.valueOf());
    expect(message.beforeLogId).toBeUndefined();
    expect(message.limit).toBe(50);
  });

  it('reads older than the log id a cursor carries', () => {
    const logId = ShortId.generate().valueOf();
    const cursor = PageCursor.encode({ position: logId, resource: scope });

    expect(messageOf(cursor, 10).beforeLogId?.valueOf()).toBe(logId);
  });

  it('refuses a cursor issued for another list', () => {
    const cursor = PageCursor.encode({
      position: ShortId.generate().valueOf(),
      resource: `communities/${communityId.valueOf()}/operations`,
    });

    expect(() => messageOf(cursor, undefined)).toThrow(InvalidPageCursorError);
  });

  it('refuses a cursor whose position is not a log id', () => {
    const cursor = PageCursor.encode({
      position: 'forged-log-id-that-does-not-exist',
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
});
