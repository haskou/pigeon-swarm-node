# Obsolete Relay Plan

This document is intentionally kept as a redirect to avoid ambiguity.

The previous relay plan assumed a node-scoped public relay could serve private
PSK networks. The spike proved that is wrong for private IPFS traffic: a relay
without the private network PSK cannot carry private PSK connections.

Use these documents instead:

- Current implementation plan:
  [private-ipfs-sync-clean-branch-plan.md](./private-ipfs-sync-clean-branch-plan.md)
- PSK relay spike findings:
  [private-ipfs-relay-spike.md](./private-ipfs-relay-spike.md)
