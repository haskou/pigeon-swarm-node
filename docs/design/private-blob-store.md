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
- **Availability is one node.** A blob exists only on the node that received it and only until retention ends. Nodes never replicate to each other. Client-chosen replicas are designed in "Availability across nodes" below and are not implemented.
- **Signer identity.** The signed reservation carries the signer's identity public key in clear, because the identity id is the PEM key the signature is checked against. The owner HMAC protects storage, not the request. Every node that receives a reservation learns the signer's identity and the blob size.
- **Backups.** A complete backup needs both halves captured at the same moment: the bytes under `PRIVATE_BLOB_STORAGE_PATH` and the local database at `PIGEON_LOCAL_DB_PATH` (default `./local_storage`), which holds the `private_blobs` records and the `owner-key-salt` in `private_blob_meta`. Stop the node, or copy both from one filesystem snapshot. A bytes-only backup restores no records, so the next sweep deletes its files. A restored record keeps its original `expiresAt`; the sweep only raises it to the current retention floor. Capabilities are stored only as SHA-256 hashes, so a backup cannot download a blob on its own. Treat backups as sensitive: they contain the owner-key salt.
- **Migration.** Attachments already published as IPFS CIDs stay distributed;
  this store cannot delete them. No automatic migration exists. A node stops
  providing legacy `ipfs_private_upload` registrations: it never admits them to
  replication, and it stops re-announcing the provider records it published for
  them. Its local bytes are kept and nothing on this node is deleted. Copies held
  by other nodes, and provider records already published to the DHT, are not
  withdrawn by this node. Those records age out on the DHT's own expiry.
- **Client.** The UI uses this API for private attachments. Attachments uploaded before size padding existed are stored and served the same way.
- Metadata visible to the node operator: blob size, upload time, and request timing/IP at the HTTP layer.

## Availability across nodes (design, not implemented)

Status: design only. It adds no endpoint, flag or node-to-node protocol, and needs no node code change. The work is in the client. Envelope availability (`opaque-mailboxes.md`, "Availability replication") is a separate prerequisite: its node side is in place, the client side is not implemented.

### Model

- The sender stores each blob part on a **replica set**: its home node plus other nodes it chooses. Default: home plus one other node. Maximum: home plus two.
- The sender uploads identical ciphertext to each replica with its own reservation. Each node keeps its copy as if it were the only one. Nodes never contact each other, never learn the set, and no request marks a replica as one.
- The replica list lives in the `PrivateBlobReference`, inside the end-to-end encrypted message. Only the recipient learns where the bytes are.
- Quota and retention are per node. A replica costs the owner the same padded bytes on that node, and its retention starts when that node stores it.
- The sender chooses replicas, not the recipient (see D1).

### Node facts this relies on

- Signature checks need no lookup: `X-Identity-Id` is the identity's PEM public key. The signed payload is method, path, timestamp and body, with no host.
- A failed `PUT` leaves the reservation open. The same upload token can retry until the upload window ends. A stored blob is immutable: a second successful `PUT` returns `409`.
- Cross-origin calls are allowed. `PigeonApplication` enables routing-controllers `cors: true`, which permits the methods and the `Authorization` and `Range` headers used here. This is read from the configuration; no browser test exists yet.

### Client contract (pigeon-swarm-ui)

Today every part is read from the reader's session node (`PigeonPrivateBlobClient` uses the session client), and references carry no origin, so a blob stored on another node cannot be read. This contract fixes that.

```
PrivateBlobReference = {
  blobId: string;        // primary replica, as today
  downloadToken: string; // primary replica, as today
  expiresAt: number;     // upload deadline only, not a retention bound
  index: number;
  size: number;          // ciphertext bytes of this part
  origin?: string;       // new: canonical base URL of the primary's node
  alternates?: { origin: string; blobId: string; downloadToken: string }[];
  //                      new: at most 2, in preference order
}
```

References without `origin` are legacy. They read from the session node, as today.

**Origin rule** (every `origin`, primary and alternates): the canonical string `MailboxHomeBase` accepts. That means `https` (or loopback `http` for development), no credentials, query or fragment, no `//` or trailing slash in the path, at most 255 characters, and no private or link-local host. An entry that fails the rule is dropped and never fetched.

**Write**

1. Choose origins once per attachment: the home node first, then up to two sender-chosen nodes. Drop duplicates and origins that fail the rule.
2. Encrypt as today, then cut the ciphertext at cipher-chunk boundaries (see "Part alignment").
3. For each part and each origin: signed reservation, then `PUT` with its upload token. Keep `{ origin, blobId, uploadToken }` in the sender's encrypted local store. Only deletion needs it.
4. Retry failed reservations and `PUT`s within the upload window. A part counts as stored once one replica holds it.
5. Send only when every part is stored. Each reference lists its stored replicas in preference order: the first is the primary, the rest are `alternates`.
6. If a send is abandoned, delete the stored replicas with their upload tokens. Retention reclaims whatever the deletes miss.

**Read**

1. For each part in `index` order, candidates are the primary, then the alternates. A legacy part has only the session node.
2. Try candidates in order: `GET {origin}/private-blobs/{blobId}` with `Authorization: Bearer {downloadToken}` and `redirect: 'error'`. Accept only `200` whose body is exactly `size` bytes. A `404`, any other status, a network error, a timeout or a short body moves to the next candidate.
3. Aligned parts are checked one at a time with their own GCM tag, so a bad replica is replaced for that part only. Legacy parts decrypt as one assembled buffer. If that fails, fetch every part again with the candidate order rotated by one, at most once per replica, then report the attachment unavailable.
4. Cache decrypted content by `blobId`, never by origin.

**Part alignment**

Upload cuts the ciphertext every 8 MiB of stored bytes. Each stored chunk is up to 8 MiB of ciphertext followed by a 16-byte GCM tag, and `encryption.chunks[i].size` includes that tag. The cuts drift 16 bytes per chunk, so for any attachment within the 50 MiB blob limit no cut lands on a chunk boundary, and no part can be verified alone. Recommended: cut new uploads at the `encryption.chunks[i].size` boundaries, so each part is one stored chunk with its own `iv`. Existing unaligned attachments keep reading through the whole-buffer path.

### Decisions

- **D1 Who picks replicas.** Default: the sender, its home plus up to two. A recipient-picked node would receive the sender's signed reservation, so it would learn that this sender stores data for one of its users. Revisit after anonymous reservation.
- **D2 Ciphertext per replica.** Default: identical bytes. Re-encrypting per replica costs K times the cipher work and extra keys in the reference. It buys nothing while reservations are signed, because colluding replicas already link copies by identity key and size.
- **D3 Minimum to send.** Default: one stored replica per part. Requiring all replicas blocks sends whenever one node is down.
- **D4 Part alignment.** Default: align new uploads to cipher chunks. This gives exact per-part verification and fallback. Unaligned parts can only be retried whole.
- **D5 Read order.** Default: the sender's order, primary first. A reader has no local replica unless the sender chose its node, so there is no local preference.
- **D6 Reader exposure.** Default: accepted residual. Each replica operator sees the reader's IP address and download times for the parts it holds. Recipient-side replicas, after anonymous reservation, would move that exposure to the reader's own node.
- **D7 Retention across nodes.** Default: each node keeps its own floor, and operators set it generously. A replica node cannot see the recipient's mailbox retention, so set `PRIVATE_BLOB_RETENTION_MS` to cover `MAILBOX_RETENTION_MS` plus the longest sender delay you accept. Optional node change: return the retention deadline in the reservation response, so the sender can check it.
- **D8 Deletion.** Default: best effort, with upload tokens kept in the sender's encrypted store. Otherwise retention reclaims the bytes.
- **D9 Origin validation.** Default: the origin rule above, and invalid entries are dropped. This stops fetches to private hosts and non-canonical strings.

### What #290 still needs

- Client fan-out, origin-bearing references and replica fallback, as above (UI).
- Part alignment for new uploads (D4).
- Mailbox availability replication on the client (`opaque-mailboxes.md`). A blob is useful only with the envelope that carries its descriptor. If the recipient's mailbox node is lost, the message is lost even when its blobs survive. The node side needs no change and is covered by a two-node test.
- Optional node work: anonymous reservation, using creation proof-of-work as mailboxes do. It removes identity disclosure to replica nodes and is the prerequisite for recipient-side replicas.
- Unchanged by this design: IPFS CID migration, and server-side size bucketing (advisory only).
