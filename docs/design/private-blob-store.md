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
| Completed retention | `PRIVATE_BLOB_RETENTION_MS`          | 7 days  |
| Upload window       | `PRIVATE_BLOB_UPLOAD_WINDOW_MS`      | 1 hour  |

Reservations are serialized so concurrent calls cannot overshoot a quota. Bytes are written to `<id>.part` and renamed to `<id>.blob` only when the exact reserved size arrived; a mismatch deletes the part file. A scheduler (every 5 minutes) deletes expired bytes and records, so abandoned reservations and aged blobs are reclaimed. Each sweep also deletes stored or partial files that no record owns (after a partial restore, or when an upload finished after its record was expired). Only files named `<id>.blob` or `<id>.part` are considered; other files in the folder are never touched. Files are mode 0600 in a 0700 directory.

## What this does not do

- **Size correlation is not removed.** The node keeps exact sizes: it serves `Content-Length` and checks the uploaded size. Clients should pad plaintext to size buckets before encryption. That reduces correlation but does not eliminate it. The bucket format is not specified, and the node does not enforce it yet.
- **Availability is one node.** A blob exists only on the node that received it and only until retention ends. Multi-node fetch or replication is out of scope.
- **Backups.** A complete backup needs both halves captured at the same moment: the bytes under `PRIVATE_BLOB_STORAGE_PATH` and the local database at `PIGEON_LOCAL_DB_PATH` (default `./local_storage`), which holds the `private_blobs` records and the `owner-key-salt` in `private_blob_meta`. Stop the node, or copy both from one filesystem snapshot. A bytes-only backup restores no records, so the next sweep deletes its files. A restored record keeps its original `expiresAt`, so a restore never extends retention. Capabilities are stored only as SHA-256 hashes, so a backup cannot download a blob on its own. Treat backups as sensitive: they contain the owner-key salt.
- **Migration.** Attachments already published as IPFS CIDs stay distributed; this store cannot delete them. No automatic migration exists.
- **Client.** The UI does not use this API yet.
- Metadata visible to the node operator: blob size, upload time, and request timing/IP at the HTTP layer.
