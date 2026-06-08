import Kernel from '@app/Kernel';

import { NetworkDiagnosticsMode } from './types/NetworkDiagnosticsMode';
import { RuntimeConfig } from './types/RuntimeConfig';
import { RuntimeNode } from './types/RuntimeNode';

export default class NetworkDiagnosticsLogger {
  private static readonly attachedNodes = new WeakSet<object>();

  private static enabled(): boolean {
    return process.env.DEBUG_NETWORK === 'true';
  }

  private static stringifyList(values: unknown[] | undefined): string[] {
    return (values || []).map((value) => String(value));
  }

  private static connectionAddresses(connection: unknown): string[] {
    if (!connection || typeof connection !== 'object') {
      return [];
    }

    const record = connection as {
      remoteAddr?: { toString(): string };
      remotePeer?: { toString(): string };
    };
    const values = [record.remotePeer, record.remoteAddr].filter(Boolean);

    return values.map((value) => value?.toString() || '');
  }

  private static transportNames(config?: RuntimeConfig): string[] {
    return (config?.transports || []).map(
      (transport) => transport.name || 'unknown',
    );
  }

  private static discoveryNames(config?: RuntimeConfig): string[] {
    return (config?.peerDiscovery || []).map((discovery) => {
      if (typeof discovery === 'function') {
        return discovery.name || 'unknown';
      }

      return discovery?.constructor?.name || 'unknown';
    });
  }

  public static logStartup(
    node: RuntimeNode,
    params: {
      config?: RuntimeConfig;
      mode: NetworkDiagnosticsMode;
      name: string;
      pskEnabled: boolean;
    },
  ): void {
    if (!NetworkDiagnosticsLogger.enabled()) {
      return;
    }

    Kernel.logger.debug(
      JSON.stringify({
        addresses: {
          announced: params.config?.addresses?.announce || [],
          current: NetworkDiagnosticsLogger.stringifyList(
            node.getMultiaddrs?.(),
          ),
          listen: params.config?.addresses?.listen || [],
        },
        connectedPeers: NetworkDiagnosticsLogger.stringifyList(
          node.getPeers?.(),
        ).length,
        discovery: NetworkDiagnosticsLogger.discoveryNames(params.config),
        mode: params.mode,
        name: params.name,
        peerId: node.peerId?.toString(),
        pskEnabled: params.pskEnabled,
        services: Object.keys(node.services || params.config?.services || {}),
        transports: NetworkDiagnosticsLogger.transportNames(params.config),
        type: 'network.startup',
      }),
    );
  }

  public static attachConnectionEvents(
    node: RuntimeNode,
    params: {
      mode: NetworkDiagnosticsMode;
      name: string;
    },
  ): void {
    if (
      !NetworkDiagnosticsLogger.enabled() ||
      typeof node.addEventListener !== 'function' ||
      typeof node !== 'object' ||
      NetworkDiagnosticsLogger.attachedNodes.has(node)
    ) {
      return;
    }

    NetworkDiagnosticsLogger.attachedNodes.add(node);

    for (const eventName of ['peer:connect', 'peer:disconnect']) {
      node.addEventListener(eventName, (event) => {
        Kernel.logger.debug(
          JSON.stringify({
            activeConnections: node.getConnections?.().length,
            connectedPeers: NetworkDiagnosticsLogger.stringifyList(
              node.getPeers?.(),
            ),
            eventName,
            mode: params.mode,
            name: params.name,
            peerId: node.peerId?.toString(),
            type: 'network.peer-event',
            usedAddresses: NetworkDiagnosticsLogger.connectionAddresses(
              (event as { detail?: unknown })?.detail,
            ),
          }),
        );
      });
    }
  }

  public static logPubSub(
    action: 'publish' | 'publish-failed' | 'received' | 'subscribe',
    node: RuntimeNode,
    params: {
      error?: unknown;
      mode: NetworkDiagnosticsMode;
      name: string;
      payloadBytes?: number;
      topic: string;
    },
  ): void {
    if (!NetworkDiagnosticsLogger.enabled()) {
      return;
    }

    Kernel.logger.debug(
      JSON.stringify({
        action,
        activeConnections: node.getConnections?.().length,
        connectedPeers: NetworkDiagnosticsLogger.stringifyList(
          node.getPeers?.(),
        ),
        error: params.error ? String(params.error) : undefined,
        mode: params.mode,
        name: params.name,
        payloadBytes: params.payloadBytes,
        peerId: node.peerId?.toString(),
        topic: params.topic,
        type: 'network.pubsub',
      }),
    );
  }
}
