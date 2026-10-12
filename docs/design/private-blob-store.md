# Private blob store (#290)

## Decision

Private attachment bytes live in a node-local store, not in IPFS. Nothing is announced to the DHT, pinned, or listed in any public index. The node never sees plaintext, filenames, content types, keys or thumbnails: the client encrypts first.

IPFS publishing is explicitly **not** done for private blobs. IPFS content ids are global, discoverable by any peer that learns the CID, and content-addressed (equal plaintext under equal keys leaks equality). A capability-guarded local store removes those properties at the price of availability (below).

## Access model

- `POST /private-blobs` is a signed request. The identity owns the quota. The node stores an HMAC of the identity id with a per-node secret salt, not the identity id.
- Reservation returns two random 256-bit capabilities. Only their SHA-256 is stored. Comparison is constant time.
- `PUT` (upload) and `DELETE` need the upload capability; `GET` needs the download capability. Both travel in `Authorization: Bearer`, never in a URL, so they stay out of access logs and referrers.
- Every capability failure, unknown id, expiry and not-yet-uploaded state returns the same `404`.
- Streaming upload cannot use the body-hash signature scheme, which is why the signed call is the small JSON reservation.

## Limits, retention, abandoned data

| Control             | Variable                             | Default |
| ------------------- | ------------------------------------ | ------- |
| Single blob         | `PRIVATE_BLOB_MAX_BYTES`             | 50 MiB  |
| Per owner           | `PRIVATE_BLOB_QUOTA_BYTES_PER_OWNER` | 500 MiB |
| Whole node          | `PRIVATE_BLOB_QUOTA_BYTES_TOTAL`     | 10 GiB  |
| Completed retention | `PRIVATE_BLOB_RETENTION_MS`          | 14 days |
| Upload window       | `PRIVATE_BLOB_UPLOAD_WINDOW_MS`      | 1 hour  |

Reservations are serialized so concurrent calls cannot overshoot a quota. Bytes are written to `<id>.part` and renamed to `<id>.blob` only when the exact reserved size arrived; a mismatch deletes the part file. A scheduler (every 5 minutes) deletes expired bytes and records, so abandoned reservations and aged blobs are reclaimed. Each sweep also deletes stored or partial files that no record owns (after a partial restore, or when an upload finished after its record was expired). Only files named `<id>.blob` or `<id>.part` are considered; other files in the folder are never touched. Files are mode 0600 in a 0700 directory.

Completed blobs live `max(PRIVATE_BLOB_RETENTION_MS, MAILBOX_RETENTION_MS)`, so a blob never expires before the mailbox envelopes that may reference it. The node cannot see those references. A sender that appends its envelope long after the blob completed can still lose the blob; raise `PRIVATE_BLOB_RETENTION_MS` above `MAILBOX_RETENTION_MS` by the largest sender delay you accept. Each sweep also raises stored blobs recorded under a shorter retention (older records, or a lowered setting) to the current floor. Until the first sweep after an upgrade, a legacy blob can answer `404` at read time because the reader checks the old deadline.

## Size buckets (advisory)

The UI pads each attachment frame to the smallest bucket that holds it, then encrypts it. The frame is the 8-byte magic `PGPAD001`, an 8-byte big-endian payload length, the payload, and zero bytes. The node never parses the frame and does not enforce buckets.

| Frame bucket | Frame bytes |
| ------------ | ----------- |
| 1 KiB        | 1,024       |
| 4 KiB        | 4,096       |
| 16 KiB       | 16,384      |
| 64 KiB       | 65,536      |
| 256 KiB      | 262,144     |
| 1 MiB        | 1,048,576   |
| 4 MiB        | 4,194,304   |
| 16 MiB       | 16,777,216  |
| 50 MiB - 112 | 52,428,688  |

The stored blob is the ciphertext: the frame plus a 16-byte GCM tag per 8 MiB chunk. The top bucket therefore stores exactly 50 MiB (52,428,800 bytes), the default `PRIVATE_BLOB_MAX_BYTES`. Frames above the top bucket keep their exact size. A lower `PRIVATE_BLOB_MAX_BYTES` rejects padded uploads whose bucket exceeds it, even when the file itself fits. Quotas count the padded ciphertext.

## What this does not do

- **Size correlation is reduced, not removed.** The node keeps exact sizes: it serves `Content-Length` and checks the uploaded size. The UI pads each attachment to the advisory size buckets below before encryption, so the stored size reveals a bucket rather than the file size. The node does not enforce buckets; it accepts any size up to `PRIVATE_BLOB_MAX_BYTES`.
- **Availability is one node.** A blob exists only on the node that received it and only until retention ends. Multi-node fetch or replication is out of scope.
- **Backups.** A complete backup needs both halves captured at the same moment: the bytes under `PRIVATE_BLOB_STORAGE_PATH` and the local database at `PIGEON_LOCAL_DB_PATH` (default `./local_storage`), which holds the `private_blobs` records and the `owner-key-salt` in `private_blob_meta`. Stop the node, or copy both from one filesystem snapshot. A bytes-only backup restores no records, so the next sweep deletes its files. A restored record keeps its original `expiresAt`; the sweep only raises it to the current retention floor. Capabilities are stored only as SHA-256 hashes, so a backup cannot download a blob on its own. Treat backups as sensitive: they contain the owner-key salt.
- **Migration.** Attachments already published as IPFS CIDs stay distributed; this store cannot delete them. No automatic migration exists.
- **Client.** The UI uses this API for private attachments. Attachments uploaded before size padding existed are stored and served the same way.
- Metadata visible to the node operator: blob size, upload time, and request timing/IP at the HTTP layer.
