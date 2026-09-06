import CallRelayRecordRegistry from '@app/apps/apis/calls-api/CallRelayRecordRegistry';
import { CallRelayRecordPrimitives } from '@app/apps/apis/calls-api/CallRelayRecordPrimitives';

describe('CallRelayRecordRegistry', () => {
  const now = 1770000000000;

  let registry: CallRelayRecordRegistry;

  function relayRecord(
    peerId: string,
    urls: string[],
    expiresAt: number = now + 60_000,
  ): CallRelayRecordPrimitives {
    return {
      expiresAt,
      issuedAt: now,
      peerId,
      poolSignature: 'pool-signature',
      publicKey: 'public-key',
      role: 'call-relay',
      signature: 'signature',
      urls,
      version: 1,
    };
  }

  beforeEach(() => {
    registry = new CallRelayRecordRegistry();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should return TURN urls only for the requested relay peers', () => {
    registry.save(
      relayRecord('12D3KooWConnectedRelay', [
        'turn:connected.example.test:4199?transport=udp',
      ]),
    );
    registry.save(
      relayRecord('12D3KooWUnrelatedRelay', [
        'turn:unrelated.example.test:4199?transport=udp',
      ]),
    );

    expect(
      registry.urlsForPeers(['12D3KooWConnectedRelay'], now),
    ).toEqual(['turn:connected.example.test:4199?transport=udp']);
  });

  it('should ignore expired records for connected relay peers', () => {
    registry.save(
      relayRecord(
        '12D3KooWConnectedRelay',
        ['turn:expired.example.test:4199?transport=udp'],
        now - 1,
      ),
    );

    expect(
      registry.urlsForPeers(['12D3KooWConnectedRelay'], now),
    ).toEqual([]);
  });

  it('should replace older URLs when a newer record has a shorter lifetime', () => {
    registry.save(relayRecord('relay', ['turn:old.example.test'], now + 600_000));
    registry.save({
      ...relayRecord('relay', ['turn:new.example.test'], now + 60_000),
      issuedAt: now + 1_000,
    });

    expect(registry.urlsForPeers(['relay'], now + 1_000)).toEqual([
      'turn:new.example.test',
    ]);
  });

  it('should not restore old URLs when an older record expires later', () => {
    registry.save({
      ...relayRecord('relay', ['turn:new.example.test'], now + 60_000),
      issuedAt: now + 1_000,
    });
    registry.save(relayRecord('relay', ['turn:old.example.test'], now + 600_000));

    expect(registry.urlsForPeers(['relay'], now + 1_000)).toEqual([
      'turn:new.example.test',
    ]);
  });
});
