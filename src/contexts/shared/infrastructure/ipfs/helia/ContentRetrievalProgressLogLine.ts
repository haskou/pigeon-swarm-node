import { DiagnosticIdentifierRedactor } from '@app/shared/infrastructure/logs/DiagnosticIdentifierRedactor';

import { ContentRetrievalProgressDetail } from './types/ContentRetrievalProgressDetail';
import { ContentRetrievalProgressEvent } from './types/ContentRetrievalProgressEvent';

export class ContentRetrievalProgressLogLine {
  private static readonly DEBUG_EVENTS: Readonly<Record<string, true>> = {
    'bitswap:block': true,
    'bitswap:found-provider': true,
  };

  constructor(private readonly redactor: DiagnosticIdentifierRedactor) {}

  private redactOrEmpty(identifier: string | undefined): string {
    return identifier === undefined ? '' : this.redactor.redact(identifier);
  }

  public format(
    cid: string,
    event: ContentRetrievalProgressEvent,
  ): string | undefined {
    if (ContentRetrievalProgressLogLine.DEBUG_EVENTS[event.type] !== true) {
      return undefined;
    }

    const detail = event.detail as ContentRetrievalProgressDetail;
    const provider = detail.provider;

    return `IPFS content retrieval progress: cid="${this.redactOrEmpty(cid)}" event="${event.type}" provider="${this.redactOrEmpty(provider?.id?.toString())}" routing="${provider?.routing ?? ''}" sender="${this.redactOrEmpty(detail.sender?.toString())}"`;
  }
}
