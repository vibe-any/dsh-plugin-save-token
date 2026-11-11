/*!
 * dsh-plugin-save-token — lifetime stats ledger (pure helpers)
 *
 * Every function here is pure: no I/O, no clock, no host imports. That keeps the
 * whole data path — file format, caps, versioning, quarantine naming, retry
 * backoff — unit-testable with `node --test` and no running dsh. The host half
 * (src/index.js) owns the actual file reads/writes and the in-memory maps.
 *
 * Why the file exists at all: totals used to live only in the host process, so
 * every restart reset "已节省 / 压缩次数 / 请求数" to zero and an operator could
 * not tell a quiet session from a broken plugin. The ledger is the smallest
 * durable shape that answers "what has this install saved so far", plus one
 * bucket per session so a single conversation can be read on its own.
 */

export const STATS_VERSION = 1

/** Newest N compressed-marker rows kept on disk (id -> orig/kept tokens). */
export const MARKS_LIMIT = 1500

/** Newest N session buckets kept on disk. */
export const SESSIONS_LIMIT = 60

/** In-memory session map cap (the disk file only keeps SESSIONS_LIMIT rows). */
export const SESSIONS_MEMORY_LIMIT = 80

const SESSION_NUMBER_FIELDS = ['requests', 'aux', 'avoided', 'comp', 'lossless', 'input', 'cached', 'output', 'firstAt', 'lastAt']

/** A zeroed session bucket. `firstAt` is passed in so callers keep one clock. */
export function blankSession(firstAt) {
  return {
    requests: 0, aux: 0, avoided: 0, comp: 0, lossless: 0,
    input: 0, cached: 0, output: 0,
    firstAt: firstAt || 0, lastAt: 0
  }
}

function finite(value) {
  return typeof value === 'number' && isFinite(value)
}

/**
 * Normalize one bucket read from disk: unknown fields dropped, non-finite
 * numbers replaced by zero, derived display fields (`id`/`tail`) reattached.
 * Returns undefined for rows without a usable id.
 */
export function normalizeSession(raw, fallbackFirstAt) {
  if (!raw || typeof raw.id !== 'string' || raw.id === '') return undefined
  const row = blankSession(finite(raw.firstAt) ? raw.firstAt : (fallbackFirstAt || 0))
  for (const field of SESSION_NUMBER_FIELDS) {
    if (finite(raw[field])) row[field] = raw[field]
  }
  row.id = raw.id
  row.tail = raw.id.length > 8 ? raw.id.slice(-8) : raw.id
  return row
}

/**
 * Make room for one more bucket. Must run BEFORE the new bucket is inserted: a
 * fresh bucket starts with `lastAt: 0`, so inserting first makes it the oldest
 * entry and the eviction loop would drop the session it was called for.
 */
export function ensureSessionCapacity(sessions, limit) {
  const cap = limit || SESSIONS_MEMORY_LIMIT
  while (sessions.size >= cap) {
    let dropKey = ''
    let dropAt = Infinity
    sessions.forEach(function (entry, key) {
      const at = (entry && entry.lastAt) || 0
      if (at < dropAt) { dropAt = at; dropKey = key }
    })
    if (dropKey === '') break
    sessions.delete(dropKey)
  }
}

/**
 * Newest-first display rows. `limit` caps the list; the dashboard asks for 20,
 * the file keeps up to SESSIONS_LIMIT.
 */
export function sessionList(sessions, limit) {
  const rows = []
  sessions.forEach(function (value, id) {
    const row = normalizeSession({ id, ...value })
    if (row !== undefined) rows.push(row)
  })
  rows.sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0) })
  return rows.slice(0, limit || 20)
}

/** Newest N marker rows as `[id, origTokens, keptTokens, ts]`. */
export function markRows(index, limit) {
  const rows = []
  index.forEach(function (entry, id) {
    if (entry && finite(entry.o) && finite(entry.k)) rows.push([id, entry.o, entry.k, finite(entry.ts) ? entry.ts : 0])
  })
  const cap = limit || MARKS_LIMIT
  return rows.length > cap ? rows.slice(rows.length - cap) : rows
}

/** `[toolName, count, savedBytes]` rows for the top-tools card. */
export function toolRows(byTool) {
  const rows = []
  byTool.forEach(function (entry, name) {
    rows.push([name, finite(entry.count) ? entry.count : 0, finite(entry.savedBytes) ? entry.savedBytes : 0])
  })
  return rows
}

/** The exact object written to disk. `sessions` may be a Map or a row array. */
export function serializeStats(input) {
  const sessions = input.sessions instanceof Map ? sessionList(input.sessions, SESSIONS_LIMIT) : (input.sessions || [])
  return {
    version: STATS_VERSION,
    since: finite(input.since) ? input.since : 0,
    updatedAt: finite(input.now) ? input.now : 0,
    totals: input.totals || {},
    compression: input.compression || {},
    sessions,
    marks: input.marks || [],
    byTool: input.tools || []
  }
}

/**
 * Parse a ledger file. Throws on malformed JSON or an unknown version: the
 * caller quarantines instead of overwriting, because silently zeroing a
 * corrupt ledger destroys the only record of past savings.
 *
 * `keys` narrows restored counters to the ones this build actually owns, so a
 * newer file cannot inject unknown fields into the host state.
 */
export function parseStats(text, keys) {
  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error('malformed JSON: ' + String((err && err.message) || err))
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not an object')
  if (data.version !== STATS_VERSION) throw new Error('unexpected version: ' + String(data.version))

  const totals = {}
  const compression = {}
  const totalKeys = (keys && keys.totals) || Object.keys(data.totals || {})
  const compressionKeys = (keys && keys.compression) || Object.keys(data.compression || {})
  for (const key of totalKeys) if (finite(data.totals && data.totals[key])) totals[key] = data.totals[key]
  for (const key of compressionKeys) if (finite(data.compression && data.compression[key])) compression[key] = data.compression[key]

  const sessions = []
  for (const raw of Array.isArray(data.sessions) ? data.sessions : []) {
    const row = normalizeSession(raw, data.since)
    if (row !== undefined) sessions.push(row)
  }
  const marks = []
  for (const raw of Array.isArray(data.marks) ? data.marks : []) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string') continue
    marks.push([raw[0], finite(raw[1]) ? raw[1] : 1, finite(raw[2]) ? raw[2] : 0, finite(raw[3]) ? raw[3] : 0])
  }
  const tools = []
  for (const raw of Array.isArray(data.byTool) ? data.byTool : []) {
    if (!Array.isArray(raw) || typeof raw[0] !== 'string') continue
    tools.push([raw[0], finite(raw[1]) ? raw[1] : 0, finite(raw[2]) ? raw[2] : 0])
  }
  return {
    since: finite(data.since) ? data.since : 0,
    totals, compression, sessions, marks, tools
  }
}

/** Sidecar path used to park an unreadable ledger instead of overwriting it. */
export function quarantineName(file, now) {
  return file + '.corrupt-' + String(now || 0)
}

/** Retry delay after consecutive write failures: 2s, 4s, 8s … capped at 2min. */
export function saveBackoffMs(failures) {
  const n = Math.max(0, Math.min(Number(failures) || 1, 6))
  return Math.min(120000, 2000 * Math.pow(2, n))
}
