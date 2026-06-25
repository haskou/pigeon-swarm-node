import LocalRoutingRecordRepublisherScheduler from '@app/apps/schedulers/LocalRoutingRecordRepublisherScheduler';
import IpfsIdentityRouting from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import IpfsKeychainRouting from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import Kernel from '@haskou/ddd-kernel';
import Log from '@app/shared/infrastructure/logs/Log';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LocalRoutingRecordRepublisherScheduler', () => {
  let identityRouting: MockProxy<IpfsIdentityRouting>;
  let keychainRouting: MockProxy<IpfsKeychainRouting>;
  let logger: MockProxy<Log>;

  beforeEach(() => {
    identityRouting = mock<IpfsIdentityRouting>();
    keychainRouting = mock<IpfsKeychainRouting>();
    logger = mock<Log>();
    new Kernel({ logger });
  });

  it('republishes identity and keychain routing records', async () => {
    identityRouting.republish.mockResolvedValue(2);
    keychainRouting.republish.mockResolvedValue(3);

    await new LocalRoutingRecordRepublisherScheduler(
      identityRouting,
      keychainRouting,
    ).execute();

    expect(identityRouting.republish).toHaveBeenCalledTimes(1);
    expect(keychainRouting.republish).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      'Republished local routing records: identities=2, keychains=3, messages=0',
    );
  });
});
