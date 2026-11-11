import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATS_VERSION, MARKS_LIMIT, SESSIONS_LIMIT, SESSIONS_MEMORY_LIMIT,
  blankSession, normalizeSession, sessionList, markRows, toolRows, ensureSessionCapacity,
  serializeStats, parseStats, quarantineName, saveBackoffMs
} from '../src/stats.js'

test('blankSession starts every counter at zero and keeps firstAt', () => {
  assert.deepEqual(blankSession(1234), {
    requests: 0, aux: 0, avoided: 0, comp: 0, lossless: 0,
    input: 0, cached: 0, output: 0, firstAt: 1234, lastAt: 0
  })
})

test('normalizeSession drops unknown fields and non-finite numbers, keeps tail', () => {
  const row = normalizeSession({
    id: 'session-0123456789abcdef', requests: 3, aux: 'nope', avoided: NaN,
    comp: 2, lossless: 0, input: 10, cached: 20, output: 5,
    firstAt: 100, lastAt: 200, extra: 'dropped'
  }, 42)
  assert.equal(row.tail, '89abcdef')
  assert.equal(row.requests, 3)
  assert.equal(row.aux, 0)
  assert.equal(row.avoided, 0)
  assert.equal(row.extra, undefined)
  assert.equal(row.firstAt, 100)
  assert.equal(row.lastAt, 200)
})

test('normalizeSession rejects rows without a usable id', () => {
  assert.equal(normalizeSession({ requests: 1 }), undefined)
  assert.equal(normalizeSession({ id: '' }), undefined)
  assert.equal(normalizeSession(null), undefined)
})

test('sessionList sorts newest-first and honours the limit', () => {
  const sessions = new Map()
  sessions.set('session-aaaa1111', blankSession(1))
  sessions.get('session-aaaa1111').lastAt = 10
  sessions.set('session-bbbb2222', blankSession(1))
  sessions.get('session-bbbb2222').lastAt = 99
  sessions.set('session-cccc3333', blankSession(1))
  sessions.get('session-cccc3333').lastAt = 50
  const rows = sessionList(sessions, 2)
  assert.deepEqual(rows.map((r) => r.tail), ['bbbb2222', 'cccc3333'])
})

test('markRows caps the persisted marker index', () => {
  const index = new Map()
  for (let i = 0; i < MARKS_LIMIT + 25; i++) index.set('m' + i, { o: 100, k: 10, ts: i })
  const rows = markRows(index)
  assert.equal(rows.length, MARKS_LIMIT)
  assert.equal(rows[rows.length - 1][0], 'm' + (MARKS_LIMIT + 24))
})

test('serialize + parse round-trip through the on-disk shape', () => {
  const sessions = new Map()
  const bucket = blankSession(500)
  bucket.requests = 7
  bucket.avoided = 900
  bucket.lastAt = 700
  sessions.set('session-0123456789abcdef', bucket)
  const body = serializeStats({
    since: 400, now: 1000,
    totals: { requests: 7, avoidedTokens: 900 },
    compression: { count: 2, losslessEncodes: 1 },
    sessions,
    marks: [['c1ab', 3000, 700, 900]],
    tools: [['bash', 3, 1200]]
  })
  assert.equal(body.version, STATS_VERSION)
  assert.equal(body.since, 400)
  assert.equal(body.updatedAt, 1000)
  assert.deepEqual(body.marks, [['c1ab', 3000, 700, 900]])
  const parsed = parseStats(JSON.stringify(body), {
    totals: ['requests', 'avoidedTokens'], compression: ['count', 'losslessEncodes']
  })
  assert.equal(parsed.since, 400)
  assert.deepEqual(parsed.totals, { requests: 7, avoidedTokens: 900 })
  assert.deepEqual(parsed.compression, { count: 2, losslessEncodes: 1 })
  assert.equal(parsed.sessions.length, 1)
  assert.equal(parsed.sessions[0].tail, '89abcdef')
  assert.deepEqual(parsed.marks[0], ['c1ab', 3000, 700, 900])
  assert.deepEqual(parsed.tools[0], ['bash', 3, 1200])
})

test('parseStats only restores counters the caller owns', () => {
  const body = serializeStats({ since: 1, now: 2, totals: { requests: 1, injected: 99 }, compression: {} })
  const parsed = parseStats(JSON.stringify(body), { totals: ['requests'], compression: [] })
  assert.deepEqual(parsed.totals, { requests: 1 })
  assert.deepEqual(parsed.compression, {})
})

test('parseStats rejects malformed JSON and unknown versions', () => {
  assert.throws(() => parseStats('{broken'), /malformed JSON/)
  assert.throws(() => parseStats(JSON.stringify({ version: 99 })), /unexpected version/)
  assert.throws(() => parseStats('[]'), /not an object/)
})

test('parseStats tolerates missing sections', () => {
  const parsed = parseStats(JSON.stringify({ version: STATS_VERSION }))
  assert.equal(parsed.since, 0)
  assert.deepEqual(parsed.sessions, [])
  assert.deepEqual(parsed.marks, [])
  assert.deepEqual(parsed.tools, [])
})

test('quarantineName parks a corrupt ledger next to it', () => {
  assert.equal(quarantineName('/tmp/stats.json', 1234), '/tmp/stats.json.corrupt-1234')
})

test('saveBackoffMs doubles up to the two-minute ceiling', () => {
  assert.equal(saveBackoffMs(1), 4000)
  assert.equal(saveBackoffMs(2), 8000)
  assert.equal(saveBackoffMs(3), 16000)
  assert.equal(saveBackoffMs(6), 120000)
  assert.equal(saveBackoffMs(99), 120000)
  // 0 consecutive failures cannot reach a retry; treat it as the first one
  assert.equal(saveBackoffMs(0), 4000)
})

test('sessions are capped on disk but ids stay unique', () => {
  const sessions = new Map()
  for (let i = 0; i < SESSIONS_LIMIT + 10; i++) {
    const bucket = blankSession(1)
    bucket.lastAt = i
    sessions.set('session-' + String(i).padStart(12, '0'), bucket)
  }
  const body = serializeStats({ since: 1, now: 2, totals: {}, compression: {}, sessions })
  assert.equal(body.sessions.length, SESSIONS_LIMIT)
  assert.equal(body.sessions[0].lastAt, SESSIONS_LIMIT + 9)
})

test('ensureSessionCapacity makes room before insert and keeps the newcomer', () => {
  const sessions = new Map()
  const limit = 3
  for (let i = 0; i < limit; i++) {
    const bucket = blankSession(1)
    bucket.lastAt = i + 1
    sessions.set('session-' + i, bucket)
  }
  ensureSessionCapacity(sessions, limit)
  const fresh = blankSession(9)
  fresh.lastAt = fresh.firstAt
  sessions.set('session-new', fresh)
  assert.equal(sessions.size, limit)
  assert.ok(sessions.has('session-new'), 'new bucket must survive')
  assert.ok(!sessions.has('session-0'), 'oldest bucket is the one evicted')
})

test('SESSIONS_MEMORY_LIMIT is above the disk limit', () => {
  assert.ok(SESSIONS_MEMORY_LIMIT > SESSIONS_LIMIT)
})
