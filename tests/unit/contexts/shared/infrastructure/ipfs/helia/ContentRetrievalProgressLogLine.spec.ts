import { DiagnosticIdentifierRedactor } from '@app/shared/infrastructure/logs/DiagnosticIdentifierRedactor';
import { ContentRetrievalProgressLogLine } from '@app/contexts/shared/infrastructure/ipfs/helia/ContentRetrievalProgressLogLine';
import { ContentRetrievalProgressEvent } from '@app/contexts/shared/infrastructure/ipfs/helia/types/ContentRetrievalProgressEvent';

const cid = 'bafybeigdyrexamplecidvalue';
const providerId = '12D3KooWProviderPeerIdValue';
const senderId = '12D3KooWSenderPeerIdValue';

function providerEvent(): ContentRetrievalProgressEvent {
  return {
    type: 'bitswap:found-provider',
    detail: {
      provider: {
        id: { toString: () => providerId },
        routing: 'delegated',
      },
      sender: { toString: () => senderId },
    },
  } as unknown as ContentRetrievalProgressEvent;
}

describe('ContentRetrievalProgressLogLine', () => {
  it('returns undefined for events outside the retrieval debug set', () => {
    const line = new ContentRetrievalProgressLogLine(
      new DiagnosticIdentifierRedactor(),
    );

    const formatted = line.format(cid, {
      type: 'bitswap:wantlist-sent',
      detail: {},
    } as unknown as ContentRetrievalProgressEvent);

    expect(formatted).toBeUndefined();
  });

  it('logs no raw CID, provider or sender identifier', () => {
    const line = new ContentRetrievalProgressLogLine(
      new DiagnosticIdentifierRedactor(),
    );

    const formatted = line.format(cid, providerEvent());

    expect(formatted).toBeDefined();
    expect(formatted).not.toContain(cid);
    expect(formatted).not.toContain(providerId);
    expect(formatted).not.toContain(senderId);
  });

  it('keeps the event type and routing, and uses stable digests for identifiers', () => {
    const redactor = new DiagnosticIdentifierRedactor();
    const line = new ContentRetrievalProgressLogLine(redactor);

    const formatted = line.format(cid, providerEvent());

    expect(formatted).toContain('bitswap:found-provider');
    expect(formatted).toContain('routing="delegated"');
    expect(formatted).toContain(`cid="${redactor.redact(cid)}"`);
    expect(formatted).toContain(`provider="${redactor.redact(providerId)}"`);
    expect(formatted).toContain(`sender="${redactor.redact(senderId)}"`);
  });

  it('leaves provider and sender empty when the event does not carry them', () => {
    const line = new ContentRetrievalProgressLogLine(
      new DiagnosticIdentifierRedactor(),
    );

    const formatted = line.format(cid, {
      type: 'bitswap:block',
      detail: {},
    } as unknown as ContentRetrievalProgressEvent);

    expect(formatted).toContain('provider=""');
    expect(formatted).toContain('sender=""');
  });
});
