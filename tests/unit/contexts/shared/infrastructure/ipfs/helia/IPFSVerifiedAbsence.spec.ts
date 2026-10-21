import IPFSVerifiedAbsence from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSVerifiedAbsence';

describe('IPFSVerifiedAbsence', () => {
  const namedError = (name: string): Error =>
    Object.assign(new Error('PRIVATE-DETAIL'), { name });

  it('treats a NotFoundError as verified absence', () => {
    expect(IPFSVerifiedAbsence.isVerified(namedError('NotFoundError'))).toBe(
      true,
    );
  });

  it('does not treat an empty aggregate as verified absence', () => {
    expect(IPFSVerifiedAbsence.isVerified(new AggregateError([]))).toBe(false);
  });

  it('treats a nested aggregate of NotFoundErrors as verified absence', () => {
    const error = new AggregateError([
      namedError('NotFoundError'),
      new AggregateError([
        namedError('NotFoundError'),
        namedError('NotFoundError'),
      ]),
    ]);

    expect(IPFSVerifiedAbsence.isVerified(error)).toBe(true);
  });

  it('does not treat a nested aggregate holding one timeout as verified absence', () => {
    const error = new AggregateError([
      namedError('NotFoundError'),
      new AggregateError([
        namedError('NotFoundError'),
        namedError('TimeoutError'),
      ]),
    ]);

    expect(IPFSVerifiedAbsence.isVerified(error)).toBe(false);
  });

  it('does not treat a value that is not an Error as verified absence', () => {
    expect(IPFSVerifiedAbsence.isVerified('NotFoundError')).toBe(false);
    expect(IPFSVerifiedAbsence.isVerified({ name: 'NotFoundError' })).toBe(
      false,
    );
  });

  it('does not treat another error name as verified absence', () => {
    expect(IPFSVerifiedAbsence.isVerified(namedError('AbortError'))).toBe(
      false,
    );
    expect(IPFSVerifiedAbsence.isVerified(new Error('NotFoundError'))).toBe(
      false,
    );
  });
});
