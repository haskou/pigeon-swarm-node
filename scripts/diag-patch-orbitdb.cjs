/* TEMPORARY diagnostics: instruments node_modules/@orbitdb/core in CI. Not for merge. */
const fs = require('fs');
const path = require('path');

const root = process.env.ODB_ROOT || path.resolve(__dirname, '../node_modules/@orbitdb/core/src');

const HELPER =
  "const dg = (m) => process.stdout.write(`DIAG-ODB ${new Date().toISOString().slice(14, 23)} ${m}\\n`);\n";

const patch = (file, edits, prependHelper = true) => {
  const target = path.join(root, file);
  let source = fs.readFileSync(target, 'utf8');

  for (const [from, to] of edits) {
    const first = source.indexOf(from);

    if (first === -1) throw new Error(`pattern not found in ${file}: ${from.slice(0, 60)}`);
    if (source.indexOf(from, first + 1) !== -1) throw new Error(`pattern ambiguous in ${file}: ${from.slice(0, 60)}`);
    source = source.replace(from, () => to);
  }

  fs.writeFileSync(target, (prependHelper ? HELPER : '') + source);
};

patch('database.js', [
  [
    `  const addOperation = async (op) => {
    const task = async () => {
      const entry = await log.append(op, { referencesCount })
      await sync.add(entry)
      if (onUpdate) {
        await onUpdate(log, entry)
      }
      events.emit('update', entry)
      return entry.hash
    }
    const hash = await queue.add(task)
    return hash
  }`,
    `  const dbl = String(name || address).slice(-14)
  const addOperation = async (op) => {
    const enq = Date.now()
    dg(\`db=\${dbl} add enqueue q.size=\${queue.size} q.pending=\${queue.pending}\`)
    const task = async () => {
      const t0 = Date.now()
      dg(\`db=\${dbl} add start waited=\${t0 - enq}ms\`)
      const entry = await log.append(op, { referencesCount })
      const t1 = Date.now()
      await sync.add(entry)
      const t2 = Date.now()
      if (onUpdate) {
        await onUpdate(log, entry)
      }
      const t3 = Date.now()
      events.emit('update', entry)
      dg(\`db=\${dbl} add done append=\${t1 - t0}ms syncAdd=\${t2 - t1}ms onUpdate=\${t3 - t2}ms\`)
      return entry.hash
    }
    const hash = await queue.add(task)
    return hash
  }`,
  ],
  [
    `  const applyOperation = async (entry) => {
    const task = async () => {
      try {
        if (entry) {
          const updated = await log.joinEntry(entry)`,
    `  const applyOperation = async (entry) => {
    const enq = Date.now()
    dg(\`db=\${dbl} apply enqueue hash=\${entry && String(entry.hash).slice(-8)} q.size=\${queue.size} q.pending=\${queue.pending}\`)
    const task = async () => {
      const t0 = Date.now()
      dg(\`db=\${dbl} apply start hash=\${entry && String(entry.hash).slice(-8)} waited=\${t0 - enq}ms\`)
      try {
        if (entry) {
          const updated = await log.joinEntry(entry)
          dg(\`db=\${dbl} apply joined updated=\${updated} took=\${Date.now() - t0}ms\`)`,
  ],
  [
    `      } catch (e) {
        console.error(e)
      }
    }
    await queue.add(task)`,
    `      } catch (e) {
        dg(\`db=\${dbl} apply ERROR \${e && e.message} took=\${Date.now() - t0}ms\`)
        console.error(e)
      }
    }
    await queue.add(task)`,
  ],
]);

patch('sync.js', [
  [
    `        const entry = await Entry.decode(headBytes, log.encryption.replication?.decrypt, log.encryption.data?.decrypt)
        await onSynced(entry)`,
    `        const entry = await Entry.decode(headBytes, log.encryption.replication?.decrypt, log.encryption.data?.decrypt)
        const rt0 = Date.now()
        dg(\`sync=\${String(address).slice(-14)} receiveHeads peer=\${String(peerId).slice(-6)} hash=\${String(entry.hash).slice(-8)}\`)
        await onSynced(entry)
        dg(\`sync=\${String(address).slice(-14)} receiveHeads synced hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - rt0}ms\`)`,
  ],
  [
    `    const peerId = String(connection.remotePeer)
    try {
      peers.add(peerId)`,
    `    const peerId = String(connection.remotePeer)
    dg(\`sync=\${String(address).slice(-14)} handleReceiveHeads incoming peer=\${peerId.slice(-6)}\`)
    try {
      peers.add(peerId)`,
  ],
  [
    `    } catch (e) {
      peers.delete(peerId)
      events.emit('error', e)
    }
  }

  const handlePeerSubscribed`,
    `    } catch (e) {
      dg(\`sync=\${String(address).slice(-14)} handleReceiveHeads ERROR peer=\${peerId.slice(-6)} \${e && e.name}: \${e && e.message}\`)
      peers.delete(peerId)
      events.emit('error', e)
    }
  }

  const handlePeerSubscribed`,
  ],
  [
    `        try {
          peers.add(peerId)
          const existingConnection`,
    `        const ps0 = Date.now()
        dg(\`sync=\${String(address).slice(-14)} peerSubscribed dial peer=\${peerId.slice(-6)} q.size=\${queue.size} q.pending=\${queue.pending}\`)
        try {
          peers.add(peerId)
          const existingConnection`,
  ],
  [
    `        } catch (e) {
          peers.delete(peerId)
          if (e.name === 'UnsupportedProtocolError') {`,
    `        } catch (e) {
          dg(\`sync=\${String(address).slice(-14)} peerSubscribed ERROR peer=\${peerId.slice(-6)} \${e && e.name}: \${e && e.message} took=\${Date.now() - ps0}ms\`)
          peers.delete(peerId)
          if (e.name === 'UnsupportedProtocolError') {`,
  ],
  [
    `          const entry = await Entry.decode(data, log.encryption.replication?.decrypt, log.encryption.data?.decrypt)
          await onSynced(entry)`,
    `          const entry = await Entry.decode(data, log.encryption.replication?.decrypt, log.encryption.data?.decrypt)
          const mt0 = Date.now()
          dg(\`sync=\${String(address).slice(-14)} pubsub message hash=\${String(entry.hash).slice(-8)}\`)
          await onSynced(entry)
          dg(\`sync=\${String(address).slice(-14)} pubsub synced hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - mt0}ms\`)`,
  ],
  [
    `      const bytes = await log.storage.get(entry.hash)
      await pubsub.publish(address, bytes)`,
    `      const bytes = await log.storage.get(entry.hash)
      const pt0 = Date.now()
      await pubsub.publish(address, bytes)
      dg(\`sync=\${String(address).slice(-14)} publish took=\${Date.now() - pt0}ms\`)`,
  ],
]);

patch('oplog/log.js', [
  [
    `      const isAlreadyInTheLog = await has(entry.hash)
      if (isAlreadyInTheLog) {
        return false
      }`,
    `      const jt0 = Date.now()
      const isAlreadyInTheLog = await has(entry.hash)
      dg(\`log=\${String(id).slice(-14)} joinEntry start hash=\${String(entry.hash).slice(-8)} known=\${isAlreadyInTheLog} next=\${entry.next.length} refs=\${entry.refs.length}\`)
      if (isAlreadyInTheLog) {
        return false
      }`,
  ],
  [
    `        const getEntries = Array.from(hashesToGet.values()).filter(has).map(hash => get(hash, signal))`,
    `        const getEntries = Array.from(hashesToGet.values()).filter(has).map(async (hash) => {
          const gt0 = Date.now()
          dg(\`log=\${String(id).slice(-14)} joinEntry fetch start hash=\${String(hash).slice(-8)}\`)
          try {
            const fetched = await get(hash, signal)
            dg(\`log=\${String(id).slice(-14)} joinEntry fetch done hash=\${String(hash).slice(-8)} took=\${Date.now() - gt0}ms\`)
            return fetched
          } catch (e) {
            dg(\`log=\${String(id).slice(-14)} joinEntry fetch ERROR hash=\${String(hash).slice(-8)} \${e && e.name}: \${e && e.message} took=\${Date.now() - gt0}ms\`)
            throw e
          }
        })`,
  ],
  [
    `      await traverseAndVerify()
      signal.throwIfAborted()`,
    `      await traverseAndVerify()
      dg(\`log=\${String(id).slice(-14)} joinEntry traversed hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - jt0}ms\`)
      signal.throwIfAborted()`,
  ],
  [
    `        const canAppend = await access.canAppend(entry)
        if (!canAppend) {`,
    `        const vt0 = Date.now()
        dg(\`log=\${String(id).slice(-14)} verifyEntry canAppend start hash=\${String(entry.hash).slice(-8)} writer=\${String(entry.identity).slice(-8)}\`)
        const canAppend = await access.canAppend(entry)
        dg(\`log=\${String(id).slice(-14)} verifyEntry canAppend done=\${canAppend} hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - vt0}ms\`)
        if (!canAppend) {`,
  ],
  [
    `        const isValid = await Entry.verify(identity, entry)`,
    `        const sv0 = Date.now()
        const isValid = await Entry.verify(identity, entry)
        dg(\`log=\${String(id).slice(-14)} verifyEntry sig done=\${isValid} hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - sv0}ms\`)`,
  ],
  [
    `      const headsHashes = (await heads(signal)).map(e => e.hash)`,
    `      dg(\`log=\${String(id).slice(-14)} joinEntry verified hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - jt0}ms\`)
      const headsHashes = (await heads(signal)).map(e => e.hash)
      dg(\`log=\${String(id).slice(-14)} joinEntry heads done hash=\${String(entry.hash).slice(-8)} took=\${Date.now() - jt0}ms\`)`,
  ],
]);

patch('storage/ipfs-block.js', [
  [
    `    const providers = (ipfs.libp2p?.getPeers?.() || []).map(peer => peer.toCID())

    try {
      const chunks = []`,
    `    const providers = (ipfs.libp2p?.getPeers?.() || []).map(peer => peer.toCID())
    const bt0 = Date.now()
    dg(\`blockstore get start \${String(hash).slice(-8)} providers=\${providers.length}\`)

    try {
      const chunks = []`,
  ],
  [
    `      if (chunks.length > 0) {
        return uint8ArrayConcat(chunks)
      }
    } finally {
      combinedSignal.clear()
    }
  }

  const persist`,
    `      const bt = Date.now() - bt0
      if (bt > 250) dg(\`blockstore get \${String(hash).slice(-8)} took=\${bt}ms providers=\${providers.length}\`)
      if (chunks.length > 0) {
        return uint8ArrayConcat(chunks)
      }
    } catch (e) {
      dg(\`blockstore get ERROR \${String(hash).slice(-8)} \${e && e.name}: \${e && e.message} took=\${Date.now() - bt0}ms providers=\${providers.length}\`)
      throw e
    } finally {
      combinedSignal.clear()
    }
  }

  const persist`,
  ],
]);

patch('storage/composed.js', [
  [
    `    let value = await storage1.get(hash, signal)
    if (!value) {
      value = await storage2.get(hash, signal)`,
    `    let value = await storage1.get(hash, signal)
    if (!value) {
      const ct0 = Date.now()
      dg(\`composed miss \${String(hash).slice(-8)} -> second storage\`)
      value = await storage2.get(hash, signal)
      dg(\`composed second storage \${String(hash).slice(-8)} found=\${!!value} took=\${Date.now() - ct0}ms\`)`,
  ],
]);

process.stdout.write(`patched @orbitdb/core at ${root}\n`);
