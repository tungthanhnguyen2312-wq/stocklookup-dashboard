(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VSWorkspaceReadModel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // DASHBOARD_PAYLOAD_COMPACTION_AND_INVESTOR_FIRST_IA_V1: the public Workspace payload is a
  // two-layer read model -- a small index (list/filter/search fields for every ticker) plus
  // deterministic per-shard detail files (the full per-ticker card, fetched lazily, one shard
  // per ticker's first letter -- see stock-core-private/workspace_public_read_model.py, which
  // this module's shard-key derivation must stay byte-for-byte in sync with).
  const INDEX_URL = "data/workspace_index.json";
  const DETAIL_DIR = "data/workspace_detail";
  const INDEX_CONTRACT_VERSION = "workspace_index/v1";
  const SHARD_CONTRACT_VERSION = "workspace_detail_shard/v1";

  function shardKeyForTicker(ticker) {
    const first = String(ticker || "").slice(0, 1).toUpperCase();
    return first >= "A" && first <= "Z" ? first : "_";
  }

  function validateIndexContract(doc) {
    return Boolean(
      doc && doc.contract_version === INDEX_CONTRACT_VERSION &&
      doc.cards && typeof doc.cards === "object" && !Array.isArray(doc.cards) &&
      Object.keys(doc.cards).length
    );
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return res.json();
    });
  }

  // Keep lossless source bytes, not the parsed universe, for the life of this release.
  // Only requested original cards survive parsing (LRU 32). Native compression is
  // off the critical path; older browsers retain the Blob without compression.
  // A cold ticker in an already fetched shard may need a local reparse, never a
  // second download. Concurrent requests share that parse, including >32 callers.
  const shardCache = new Map();
  const cardCache = new Map();
  const CARD_CACHE_LIMIT = 32;
  let activeRelease = null;
  let compressionTimer = null;
  function compressWhenIdle() {
    clearTimeout(compressionTimer);
    if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") return;
    compressionTimer = setTimeout(async () => {
      // Let the requesting view paint first; compress one body at a time.
      for (const entry of shardCache.values()) {
        if (Array.from(shardCache.values()).some((e) => e.parsing)) return;
        if (!entry.bytes || entry.compressed || entry.compressing) continue;
        entry.compressing = true;
        try {
          const compressed = await new Response(entry.bytes.stream().pipeThrough(new CompressionStream("gzip"))).blob();
          entry.bytes = compressed; entry.compressed = true;
        } catch (_) { /* Original Blob remains accessible in older/restricted browsers. */ }
        finally { entry.compressing = false; }
      }
    }, 100);
  }

  function loadShard(shardKey, ticker) {
    if (!shardCache.has(shardKey)) {
      const entry = { bytes: null, compressed: false, wanted: new Set(), parsing: null, loading: null };
      shardCache.set(shardKey, entry);
      entry.loading = fetch(`${DETAIL_DIR}/${shardKey}.json`, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        return res.blob();
      }).then((blob) => {
        entry.bytes = blob;
        return blob;
      });
    }
    const entry = shardCache.get(shardKey);
    entry.wanted.add(ticker);
    if (!entry.parsing) {
      const bytes = entry.bytes
        ? Promise.resolve(entry.compressed ? new Response(entry.bytes.stream().pipeThrough(new DecompressionStream("gzip"))).blob() : entry.bytes)
        : entry.loading;
      entry.parsing = bytes.then((blob) => blob.text()).then((text) => JSON.parse(text)).then((shard) => {
        const metadata = shard && { contract_version: shard.contract_version, as_of_session: shard.as_of_session,
          source_artifact_identity: shard.source_artifact_identity };
        const requested = new Map();
        entry.wanted.forEach((t) => {
          const card = shard && shard.tickers && shard.tickers[t];
          requested.set(t, card);
          if (card && shardCache.get(shardKey) === entry) {
            cardCache.delete(t);
            cardCache.set(t, { metadata, card });
            while (cardCache.size > CARD_CACHE_LIMIT) cardCache.delete(cardCache.keys().next().value);
          }
        });
        entry.wanted.clear();
        return { metadata, requested };
      }).catch((err) => {
        if (shardCache.get(shardKey) === entry) shardCache.delete(shardKey);
        throw err; // Failed transfers/JSON are retryable, never permanently cached rejections.
      }).finally(() => { entry.parsing = null; entry.loading = null; compressWhenIdle(); });
    }
    return entry.parsing;
  }

  function loadIndex() {
    return fetchJson(INDEX_URL).then((doc) => {
      if (!validateIndexContract(doc)) throw new Error("WORKSPACE_INDEX_CONTRACT_INVALID");
      return doc;
    });
  }

  // Never throws -- every failure mode (network error, unknown ticker, session/identity drift
  // between the index already on screen and a shard fetched later) resolves to an explicit
  // { status: "unavailable", reason } the caller renders as "Tạm chưa có dữ liệu chi tiết"
  // (PHASE 5/10), never a raw HTTP/path error.
  function getTickerDetail(ticker, indexDoc) {
    const normalizedTicker = String(ticker || "").trim().toUpperCase();
    const thin = (indexDoc && indexDoc.cards) ? indexDoc.cards[normalizedTicker] : null;
    const shardKey = (thin && thin.detail_shard) || shardKeyForTicker(normalizedTicker);
    if (indexDoc && !thin) return Promise.resolve({ status: "not_found" });
    if (!/^[A-Z_]$/.test(shardKey)) return Promise.resolve({ status: "unavailable", reason: "SHARD_CONTRACT_INVALID" });
    const release = JSON.stringify([indexDoc && indexDoc.as_of_session, indexDoc && indexDoc.source_artifact_identity]);
    if (release !== activeRelease) { clearShardCache(); activeRelease = release; }
    function result(shard, card) {
      if (release !== activeRelease) return { status: "unavailable", reason: "SHARD_IDENTITY_MISMATCH" };
      if (!shard || shard.contract_version !== SHARD_CONTRACT_VERSION) {
        return { status: "unavailable", reason: "SHARD_CONTRACT_INVALID" };
      }
      if (indexDoc) {
        if (shard.as_of_session !== indexDoc.as_of_session) {
          return { status: "unavailable", reason: "SHARD_SESSION_MISMATCH" };
        }
        if (shard.source_artifact_identity !== indexDoc.source_artifact_identity) {
          return { status: "unavailable", reason: "SHARD_IDENTITY_MISMATCH" };
        }
      }
      if (!card) return { status: "not_found" };
      if ((card.ticker && card.ticker !== normalizedTicker) || (card.as_of_session && card.as_of_session !== shard.as_of_session)) {
        return { status: "unavailable", reason: "SHARD_CARD_IDENTITY_MISMATCH" };
      }
      return { status: "ok", card };
    }
    if (cardCache.has(normalizedTicker)) {
      const cached = cardCache.get(normalizedTicker);
      cardCache.delete(normalizedTicker); cardCache.set(normalizedTicker, cached);
      return Promise.resolve(result(cached.metadata, cached.card));
    }
    return loadShard(shardKey, normalizedTicker).then(({ metadata, requested }) => {
      const resolved = result(metadata, requested.get(normalizedTicker));
      if (resolved.status === "unavailable" && release === activeRelease) {
        shardCache.delete(shardKey); cardCache.delete(normalizedTicker);
      }
      return resolved;
    })
      .catch(() => ({ status: "unavailable", reason: "SHARD_FETCH_FAILED" }));
  }

  function clearShardCache() {
    shardCache.clear();
    cardCache.clear();
    activeRelease = null;
    clearTimeout(compressionTimer);
  }

  return {
    INDEX_URL, DETAIL_DIR, INDEX_CONTRACT_VERSION, SHARD_CONTRACT_VERSION,
    shardKeyForTicker, validateIndexContract, loadIndex, getTickerDetail, clearShardCache,
  };
});
