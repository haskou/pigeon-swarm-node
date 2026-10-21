import { InvalidDeviceAuthorizationTransitionLogRequestError } from '@app/apps/apis/identity-devices-api/errors/InvalidDeviceAuthorizationTransitionLogRequestError';
import { GetDeviceAuthorizationTransitionLogRequest } from '@app/apps/apis/identity-devices-api/requests/GetDeviceAuthorizationTransitionLogRequest';

describe(GetDeviceAuthorizationTransitionLogRequest.name, () => {
  it('reads the first page of the default size when nothing is given', () => {
    const request = new GetDeviceAuthorizationTransitionLogRequest(
      undefined,
      undefined,
    );

    expect(request.getCursor().valueOf()).toBe(0);
    expect(request.getLimit()).toBe(50);
  });

  it.each([
    ['0', 0],
    ['7', 7],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('reads after cursor %s', (cursor, revision) => {
    expect(
      new GetDeviceAuthorizationTransitionLogRequest(cursor, undefined)
        .getCursor()
        .valueOf(),
    ).toBe(revision);
  });

  it.each([
    ['1', 1],
    ['50', 50],
    ['100', 100],
  ])('accepts limit %s', (limit, expected) => {
    expect(
      new GetDeviceAuthorizationTransitionLogRequest(undefined, limit).getLimit(),
    ).toBe(expected);
  });

  it.each([
    [''],
    ['01'],
    ['-1'],
    ['1.0'],
    ['1e3'],
    [' 1'],
    ['0x1'],
    ['9007199254740992'],
    [['1']],
    [{ revision: '1' }],
  ])('refuses cursor %j', (cursor) => {
    expect(() =>
      new GetDeviceAuthorizationTransitionLogRequest(cursor, undefined).getCursor(),
    ).toThrow(InvalidDeviceAuthorizationTransitionLogRequestError);
  });

  it.each([[''], ['0'], ['101'], ['01'], ['-1'], ['1.5'], ['abc'], [['1']]])(
    'refuses limit %j',
    (limit) => {
      expect(() =>
        new GetDeviceAuthorizationTransitionLogRequest(undefined, limit).getLimit(),
      ).toThrow(InvalidDeviceAuthorizationTransitionLogRequestError);
    },
  );
});
