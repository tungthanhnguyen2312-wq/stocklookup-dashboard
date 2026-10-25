const test = require("node:test");
const assert = require("node:assert/strict");
const wrm = require("../assets/js/workspace-read-model.js");

test("shardKeyForTicker mirrors the Producer's first-letter bucketing, byte for byte", () => {
  assert.equal(wrm.shardKeyForTicker("HPG"), "H");
  assert.equal(wrm.shardKeyForTicker("a32"), "A");
  assert.equal(wrm.shardKeyForTicker("32A"), "_");
  assert.equal(wrm.shardKeyForTicker(""), "_");
  assert.equal(wrm.shardKeyForTicker(null), "_");
});

test("validateIndexContract accepts only the real workspace_index/v1 shape", () => {
  assert.equal(wrm.validateIndexContract({ contract_version: "workspace_index/v1", cards: { HPG: {} } }), true);
  assert.equal(wrm.validateIndexContract({ contract_version: "workspace_index/v1", cards: {} }), false);
  assert.equal(wrm.validateIndexContract({ contract_version: "investment_decision_workspace_projection/v1", cards: { HPG: {} } }), false);
  assert.equal(wrm.validateIndexContract(null), false);
});

function withMockFetch(handler, run) {
  const savedFetch = global.fetch;
  global.fetch = async (...args) => {
    const response = await handler(...args);
    return response.ok && response.json && !response.blob
      ? new Response(JSON.stringify(await response.json()), { headers: { "Content-Type": "application/json" } }) : response;
  };
  return Promise.resolve().then(run).finally(() => { global.fetch = savedFetch; wrm.clearShardCache(); });
}

test("loadIndex resolves the validated document on a real contract shape", async () => {
  const doc = { contract_version: "workspace_index/v1", as_of_session: "2026-09-18", cards: { HPG: { ticker: "HPG" } } };
  await withMockFetch(
    (url) => {
      assert.equal(url, "data/workspace_index.json");
      return Promise.resolve({ ok: true, json: () => Promise.resolve(doc) });
    },
    async () => {
      const loaded = await wrm.loadIndex();
      assert.deepEqual(loaded, doc);
    },
  );
});

test("loadIndex rejects on a non-ok HTTP response", async () => {
  await withMockFetch(
    () => Promise.resolve({ ok: false, status: 404 }),
    async () => { await assert.rejects(wrm.loadIndex()); },
  );
});

test("getTickerDetail fetches the ticker's shard and returns its full card", async () => {
  wrm.clearShardCache();
  const indexDoc = {
    as_of_session: "2026-09-18", source_artifact_identity: "abc123",
    cards: { HPG: { detail_shard: "H" } },
  };
  const shard = {
    contract_version: "workspace_detail_shard/v1", as_of_session: "2026-09-18",
    source_artifact_identity: "abc123", tickers: { HPG: { ticker: "HPG", why: { deep: true } } },
  };
  await withMockFetch(
    (url) => {
      assert.equal(url, "data/workspace_detail/H.json");
      return Promise.resolve({ ok: true, json: () => Promise.resolve(shard) });
    },
    async () => {
      const result = await wrm.getTickerDetail("HPG", indexDoc);
      assert.equal(result.status, "ok");
      assert.deepEqual(result.card, { ticker: "HPG", why: { deep: true } });
    },
  );
});

test("getTickerDetail caches the shard across repeated calls for tickers in the same bucket", async () => {
  wrm.clearShardCache();
  let fetchCount = 0;
  const indexDoc = {
    as_of_session: "2026-09-18", source_artifact_identity: "abc123",
    cards: { HPG: { detail_shard: "H" }, HSG: { detail_shard: "H" } },
  };
  const shard = {
    contract_version: "workspace_detail_shard/v1", as_of_session: "2026-09-18",
    source_artifact_identity: "abc123", tickers: { HPG: { ticker: "HPG" }, HSG: { ticker: "HSG" } },
  };
  await withMockFetch(
    () => { fetchCount += 1; return Promise.resolve({ ok: true, json: () => Promise.resolve(shard) }); },
    async () => {
      await wrm.getTickerDetail("HPG", indexDoc);
      await wrm.getTickerDetail("HSG", indexDoc);
      assert.equal(fetchCount, 1, "second ticker in the same shard must not trigger a second fetch");
    },
  );
});

test("getTickerDetail resolves to an explicit unavailable state on network failure, never throws", async () => {
  wrm.clearShardCache();
  const indexDoc = { as_of_session: "2026-09-18", source_artifact_identity: "abc123", cards: { HPG: { detail_shard: "H" } } };
  await withMockFetch(
    () => Promise.reject(new Error("network down")),
    async () => {
      const result = await wrm.getTickerDetail("HPG", indexDoc);
      assert.equal(result.status, "unavailable");
      assert.equal(result.reason, "SHARD_FETCH_FAILED");
    },
  );
});

test("getTickerDetail flags a session mismatch between the index and a stale-cached shard", async () => {
  wrm.clearShardCache();
  const indexDoc = { as_of_session: "2026-09-19", source_artifact_identity: "newer", cards: { HPG: { detail_shard: "H" } } };
  const staleShard = {
    contract_version: "workspace_detail_shard/v1", as_of_session: "2026-09-18",
    source_artifact_identity: "older", tickers: { HPG: { ticker: "HPG" } },
  };
  await withMockFetch(
    () => Promise.resolve({ ok: true, json: () => Promise.resolve(staleShard) }),
    async () => {
      const result = await wrm.getTickerDetail("HPG", indexDoc);
      assert.equal(result.status, "unavailable");
      assert.equal(result.reason, "SHARD_SESSION_MISMATCH");
    },
  );
});

test("getTickerDetail returns not_found for a ticker absent from its own shard", async () => {
  wrm.clearShardCache();
  const indexDoc = { as_of_session: "2026-09-18", source_artifact_identity: "abc123", cards: { ZZZ: { detail_shard: "Z" } } };
  const shard = {
    contract_version: "workspace_detail_shard/v1", as_of_session: "2026-09-18",
    source_artifact_identity: "abc123", tickers: {},
  };
  await withMockFetch(
    () => Promise.resolve({ ok: true, json: () => Promise.resolve(shard) }),
    async () => {
      const result = await wrm.getTickerDetail("ZZZ", indexDoc);
      assert.equal(result.status, "not_found");
    },
  );
});

test("concurrent requests beyond the bounded card cache all receive exact originals, and evicted cards reparse locally", async () => {
  const tickers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`H${i}`, { ticker: `H${i}`, value: i / 13, note: 'Nguồn gốc — không đổi', nested: { missing: null, reasons: ['UNKNOWN'] } }]));
  const doc = { as_of_session: '2026-10-23', source_artifact_identity: 'source', cards: Object.fromEntries(Object.keys(tickers).map(t => [t, { detail_shard: 'H' }])) };
  let downloads = 0;
  await withMockFetch(() => { downloads++; return new Response(JSON.stringify({ contract_version: wrm.SHARD_CONTRACT_VERSION, as_of_session: doc.as_of_session, source_artifact_identity: 'source', tickers })); }, async () => {
    const values = await Promise.all(Object.keys(tickers).map(t => wrm.getTickerDetail(t, doc)));
    values.forEach((value, i) => assert.deepEqual(value.card, tickers[`H${i}`]));
    await new Promise(resolve => setTimeout(resolve, 250)); // Native idle compression, then eviction recovery.
    assert.deepEqual((await wrm.getTickerDetail('H0', doc)).card, tickers.H0);
    const cached = await wrm.getTickerDetail('H0', doc);
    assert.strictEqual((await wrm.getTickerDetail('H0', doc)).card, cached.card);
    assert.equal(downloads, 1);
  });
});

test("failed transfer and malformed JSON can be retried; successful retry is shared", async () => {
  const doc = { as_of_session: '2026-10-23', source_artifact_identity: 'source', cards: { HPG: { detail_shard: 'H' } } };
  let requests = 0;
  await withMockFetch(() => {
    requests++;
    if (requests === 1) throw new Error('offline');
    if (requests === 2) return new Response('{malformed');
    return new Response(JSON.stringify({ contract_version: wrm.SHARD_CONTRACT_VERSION, as_of_session: doc.as_of_session, source_artifact_identity: 'source', tickers: { HPG: { ticker: 'HPG', state: 'UNKNOWN' } } }));
  }, async () => {
    for (let i = 0; i < 2; i++) assert.equal((await wrm.getTickerDetail('HPG', doc)).reason, 'SHARD_FETCH_FAILED');
    const [a, b] = await Promise.all([wrm.getTickerDetail('HPG', doc), wrm.getTickerDetail('HPG', doc)]);
    assert.equal(a.status, 'ok'); assert.deepEqual(a, b); assert.equal(requests, 3);
  });
});

test("a new release cannot receive an old in-flight card or let it poison the new cache", async () => {
  const index = session => ({ as_of_session: session, source_artifact_identity: session, cards: { HPG: { detail_shard: 'H' } } });
  const response = session => new Response(JSON.stringify({ contract_version: wrm.SHARD_CONTRACT_VERSION, as_of_session: session, source_artifact_identity: session, tickers: { HPG: { ticker: 'HPG', as_of_session: session } } }));
  const pending = [];
  await withMockFetch(() => new Promise(resolve => pending.push(resolve)), async () => {
    const old = wrm.getTickerDetail('HPG', index('2026-10-22'));
    const current = wrm.getTickerDetail('HPG', index('2026-10-23'));
    pending[1](response('2026-10-23'));
    assert.equal((await current).card.as_of_session, '2026-10-23');
    pending[0](response('2026-10-22'));
    assert.equal((await old).status, 'unavailable');
    assert.equal((await wrm.getTickerDetail('HPG', index('2026-10-23'))).card.as_of_session, '2026-10-23');
    assert.equal(pending.length, 2);
  });
});

test("native compression is optional, shard/card identities and unknown ticker states remain fail-closed", async () => {
  const original = global.CompressionStream;
  global.CompressionStream = undefined;
  const doc = { as_of_session: '2026-10-23', source_artifact_identity: 'source', cards: { HPG: { detail_shard: 'H' } } };
  try {
    await withMockFetch(() => new Response(JSON.stringify({ contract_version: wrm.SHARD_CONTRACT_VERSION, as_of_session: doc.as_of_session, source_artifact_identity: 'source', tickers: { HPG: { ticker: 'HSG' } } })), async () => {
      assert.equal((await wrm.getTickerDetail('ZZZZ', doc)).status, 'not_found');
      assert.equal((await wrm.getTickerDetail('HPG', doc)).reason, 'SHARD_CARD_IDENTITY_MISMATCH');
    });
  } finally { global.CompressionStream = original; }
});

test("all 1,683 published ticker details survive the byte cache exactly, without duplicate shard downloads", async () => {
  const fs = require('node:fs'), path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const index = JSON.parse(fs.readFileSync(path.join(root, wrm.INDEX_URL), 'utf8'));
  assert.equal(Object.keys(index.cards).length, 1683);
  const counts = new Map();
  await withMockFetch(url => {
    counts.set(url, (counts.get(url) || 0) + 1);
    return new Response(fs.readFileSync(path.join(root, url)));
  }, async () => {
    for (const key of new Set(Object.values(index.cards).map(c => c.detail_shard))) {
      const original = JSON.parse(fs.readFileSync(path.join(root, wrm.DETAIL_DIR, key + '.json'), 'utf8'));
      const names = Object.keys(index.cards).filter(t => index.cards[t].detail_shard === key);
      const results = await Promise.all(names.map(t => wrm.getTickerDetail(t, index)));
      results.forEach((r, i) => { assert.equal(r.status, 'ok', names[i]); assert.deepEqual(r.card, original.tickers[names[i]], names[i]); });
    }
    assert.equal(counts.size, 25);
    assert.ok(Array.from(counts.values()).every(n => n === 1));
  });
});
