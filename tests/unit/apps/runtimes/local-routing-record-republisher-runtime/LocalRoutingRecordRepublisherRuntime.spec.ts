import LocalRoutingRecordRepublisherRuntime from '@app/apps/runtimes/local-routing-record-republisher-runtime/LocalRoutingRecordRepublisherRuntime';
import IpfsIdentityRouting from '@app/contexts/identities/infrastructure/ipfs/IpfsIdentityRouting';
import IpfsKeychainRouting from '@app/contexts/keychains/infrastructure/ipfs/IpfsKeychainRouting';
import { IPFSNetwork } from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetwork';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import Log from '@app/shared/infrastructure/logs/Log';
import Kernel from '@haskou/ddd-kernel';
import { mock, MockProxy } from 'jest-mock-extended';

type NetworkRegisteredListener = (network: IPFSNetwork) => Promise<void> | void;
type NetworkRemovedListener = (networkId: string) => Promise<void> | void;
type PeerConnectedListener = (peerId: string) => Promise<void> | void;

describe('LocalRoutingRecordRepublisherRuntime', () => {
  let identityRouting: MockProxy<IpfsIdentityRouting>;
  let keychainRouting: MockProxy<IpfsKeychainRouting>;
  let logger: MockProxy<Log>;
  let network: MockProxy<IPFSNetwork>;
  let networkRegistry: MockProxy<IPFSNetworkRegistry>;
  let peerConnectedListener: PeerConnectedListener;
  let registeredListener: NetworkRegisteredListener;
  let removedListener: NetworkRemovedListener;

  beforeEach(() => {
    identityRouting = mock<IpfsIdentityRouting>();
    keychainRouting = mock<IpfsKeychainRouting>();
    logger = mock<Log>();
    network = mock<IPFSNetwork>();
    networkRegistry = mock<IPFSNetworkRegistry>();
    new Kernel({ logger });

    network.getId.mockReturnValue('network-1');
    network.isPrivate.mockReturnValue(true);
    network.getPeers.mockReturnValue(['peer-1']);
    network.onPeerConnected.mockImplementation((listener) => {
      peerConnectedListener = listener;
    });
    networkRegistry.getAll.mockReturnValue([network]);
    networkRegistry.onNetworkRegistered.mockImplementation((listener) => {
      registeredListener = listener;
    });
    networkRegistry.onNetworkRemoved.mockImplementation((listener) => {
      removedListener = listener;
    });
    identityRouting.republish.mockResolvedValue(2);
    keychainRouting.republish.mockResolvedValue(3);
  });

  it('republishes local routing records when the first peer connects', async () => {
    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    peerConnectedListener('peer-1');
    await flushBackgroundTasks();

    expect(identityRouting.republish).toHaveBeenCalledWith('network-1');
    expect(keychainRouting.republish).toHaveBeenCalledWith('network-1');
    expect(logger.debug).toHaveBeenCalledWith(
      'Republished local routing records after peer connection:' +
        ' networkId=network-1' +
        ' peerId=peer-1' +
        ' identities=2' +
        ' keychains=3' +
        ' messages=0',
    );
  });

  it('does not republish when the network already has several peers', async () => {
    network.getPeers.mockReturnValue(['peer-1', 'peer-2']);
    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    peerConnectedListener('peer-2');
    await flushBackgroundTasks();

    expect(identityRouting.republish).not.toHaveBeenCalled();
    expect(keychainRouting.republish).not.toHaveBeenCalled();
  });

  it('does not run concurrent republish passes for the same network', async () => {
    const deferredIdentityRepublish = deferred<number>();

    identityRouting.republish.mockReturnValue(deferredIdentityRepublish.promise);
    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    peerConnectedListener('peer-1');
    peerConnectedListener('peer-1');
    await flushBackgroundTasks();

    expect(identityRouting.republish).toHaveBeenCalledTimes(1);
    expect(keychainRouting.republish).toHaveBeenCalledTimes(1);

    deferredIdentityRepublish.resolve(2);
    await flushBackgroundTasks();
  });

  it('registers networks added after startup', async () => {
    networkRegistry.getAll.mockReturnValue([]);
    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    registeredListener(network);
    peerConnectedListener('peer-1');
    await flushBackgroundTasks();

    expect(network.onPeerConnected).toHaveBeenCalledTimes(1);
    expect(identityRouting.republish).toHaveBeenCalledTimes(1);
    expect(keychainRouting.republish).toHaveBeenCalledTimes(1);
  });

  it('does not listen for public network peer connections', async () => {
    network.isPrivate.mockReturnValue(false);

    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    expect(network.onPeerConnected).not.toHaveBeenCalled();
    expect(identityRouting.republish).not.toHaveBeenCalled();
    expect(keychainRouting.republish).not.toHaveBeenCalled();
  });

  it('forgets removed networks', async () => {
    await new LocalRoutingRecordRepublisherRuntime(
      networkRegistry,
      identityRouting,
      keychainRouting,
    ).run();

    removedListener('network-1');
    registeredListener(network);

    expect(network.onPeerConnected).toHaveBeenCalledTimes(2);
  });
});

async function flushBackgroundTasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
