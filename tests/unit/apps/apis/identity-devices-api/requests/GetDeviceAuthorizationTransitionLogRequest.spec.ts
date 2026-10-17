import { InvalidDeviceAuthorizationTransitionLogRequestError } from '@app/apps/apis/identity-devices-api/errors/InvalidDeviceAuthorizationTransitionLogRequestError';
import { GetDeviceAuthorizationTransitionLogRequest } from '@app/apps/apis/identity-devices-api/requests/GetDeviceAuthorizationTransitionLogRequest';

describe(GetDeviceAuthorizationTransitionLogRequest.name, () => {
  it('reads the whole log when no revision is given', () => {
    expect(
      new GetDeviceAuthorizationTransitionLogRequest(undefined)
        .getAfter()
        .valueOf(),
    ).toBe(0);
  });

  it.each([
    ['0', 0],
    ['7', 7],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('reads after revision %s', (after, revision) => {
    expect(
      new GetDeviceAuthorizationTransitionLogRequest(after)
        .getAfter()
        .valueOf(),
    ).toBe(revision);
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
  ])('refuses after revision %j', (after) => {
    expect(() =>
      new GetDeviceAuthorizationTransitionLogRequest(after).getAfter(),
    ).toThrow(InvalidDeviceAuthorizationTransitionLogRequestError);
  });
});
