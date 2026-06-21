import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import IdentityRoutingRepublisher from '@app/contexts/identities/application/routing/IdentityRoutingRepublisher';
import KeychainRoutingRepublisher from '@app/contexts/keychains/application/routing/KeychainRoutingRepublisher';
import Kernel from '@app/Kernel';
import Log from '@app/shared/infrastructure/logs/Log';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalRoutingRecordRepublisherScheduler', () => {
  let identityRepublisher: MockProxy<IdentityRoutingRepublisher>;
  let keychainRepublisher: MockProxy<KeychainRoutingRepublisher>;
  let logger: MockProxy<Log>;

  beforeEach(() => {
    identityRepublisher = mock<IdentityRoutingRepublisher>();
    keychainRepublisher = mock<KeychainRoutingRepublisher>();
    logger = mock<Log>();
    (Kernel as unknown as { _logs: Log })._logs = logger;
  });

  it('republishes identity and keychain routing records', async () => {
    identityRepublisher.republish.mockResolvedValue(2);
    keychainRepublisher.republish.mockResolvedValue(3);

    await new LocalRoutingRecordRepublisherScheduler(
      identityRepublisher,
      keychainRepublisher,
    ).execute();

    expect(identityRepublisher.republish).toHaveBeenCalledTimes(1);
    expect(keychainRepublisher.republish).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'Republished local routing records: identities=2, keychains=3, messages=0',
    );
  });
});
