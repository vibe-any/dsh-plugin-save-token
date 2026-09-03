/*!
 * dsh-plugin-save-token v2.4.1 — pure compression/format helpers (host half)
 *
 * Extracted from src/index.js so the whole compression brain is unit-testable
 * with `node --test test/` (no host imports, no I/O, no state). Every function
 * is deterministic: same inputs -> same outputs. The orchestration half
 * (src/index.js) owns all mutable state (counters, caches, spill) and calls
 * into this module.
 *
 * Design red lines kept verbatim from v2.1.x:
 * - lossless-first: uniform JSON arrays are re-encoded TOON-style with zero
 *   information loss; lossy elision only when lossless routes do not apply.
 * - never-worse: candidates must pass byte (keepRatioMax + absolute saving)
 *   AND token gates; otherwise the original text goes out untouched.
 */

// ---------- estimators ----------
var enc = new TextEncoder()

export function utf8Bytes(s) { return enc.encode(s).length }

export function estTokens(s) {
  if (!s) return 0
  var cjk = 0, other = 0
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i)
    if (c >= 0x2e80 && c <= 0x9fff) cjk++
    else if (c >= 0xd800 && c <= 0xdfff) { cjk++; i++ }
    else other++
  }
  return Math.ceil(other / 3.8 + cjk * 0.75)
}

export function fnv1a(s) {
  var h = 0x811c9dc5
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0 }
  return ('0000000' + h.toString(16)).slice(-8)
}

export function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }

// ---------- fingerprinting (cross-turn dedupe) ----------
export function argsToString(args) {
  try { return typeof args === 'string' ? args : JSON.stringify(args) } catch (e) { return String(args) }
}

/**
 * Dedupe key for a tool result. Fixes two v2.1.x defects:
 * - the key carries the owning session id, so two sessions/agents sharing one
 *   process never get each other's "remains in context above" stubs (that
 *   claim would be false across sessions);
 * - fingerprints hash the FULL string. The old 4096-char (args) / 64KB
 *   (content) truncation could declare two different outputs byte-identical
 *   when they merely shared a long prefix, violating the reversibility red
 *   line. FNV-1a is O(n); hashing megabyte strings costs well under a
 *   millisecond, so the cap bought nothing.
 */
export function dedupeFingerprint(sessionId, toolName, argsString, content) {
  return (sessionId === undefined ? '(none)' : String(sessionId)) + '|' + toolName + '|' + fnv1a(argsString || '') + '|' + fnv1a(content)
}

// ---------- TOON-style lossless tabular encoding ----------
export function csvCell(v) {
  var s = String(v)
  if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

function safeHeaderTok(k) { return typeof k === 'string' && k !== '' && !/["',{}\[\]:\n\r\t]/.test(k) }

/**
 * Legacy flat check kept for compatibility: arrays of >=8 objects whose keys
 * are identical across rows and whose values are all flat primitives (null
 * allowed). Returns the key list or null.
 */
export function uniformKeys(arr) {
  if (!Array.isArray(arr) || arr.length < 8) return null
  for (var i = 0; i < arr.length; i++) {
    var o = arr[i]
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  }
  var keys = Object.keys(arr[0])
  if (keys.length === 0 || keys.length > 24) return null
  for (var j = 0; j < arr.length; j++) {
    var e = arr[j]
    if (Object.keys(e).length !== keys.length) return null
    for (var k = 0; k < keys.length; k++) {
      if (!Object.prototype.hasOwnProperty.call(e, keys[k])) return null
      var val = e[keys[k]]
      if (val !== null && typeof val === 'object') return null
    }
  }
  return keys
}

/**
 * Nested-aware tabular planner (lossless, TOON "nested field group" style).
 * An array of objects is tabulable when every row has the SAME key set and
 * each column is uniformly: flat primitives/null, OR plain objects sharing
 * one nested key set (one nesting level; deeper structure falls back). Arrays
 * anywhere in a column reject the whole plan — variable-length cells cannot
 * tabularize without loss.
 *
 * Returns { groups: [{ header, get(row) -> scalar[] }], width } or null.
 * Deterministic: group order follows Object.keys of the first row; nested
 * cells follow the nested key order of the first row.
 */
export function uniformTabular(arr) {
  if (!Array.isArray(arr) || arr.length < 8) return null
  for (var i = 0; i < arr.length; i++) {
    if (!isPlainObject(arr[i])) return null
  }
  var keys = Object.keys(arr[0])
  if (keys.length === 0 || keys.length > 24) return null
  // every row must carry EXACTLY this key set — a missing key would render as
  // the text "undefined" (information loss) and an extra key would shift cells
  for (var r0 = 0; r0 < arr.length; r0++) {
    var ek = Object.keys(arr[r0])
    if (ek.length !== keys.length) return null
    for (var q = 0; q < keys.length; q++) {
      if (!Object.prototype.hasOwnProperty.call(arr[r0], keys[q])) return null
    }
  }
  var groups = []
  var width = 0
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki]
    var first = arr[0][k]
    if (Array.isArray(first)) return null
    if (first === null || typeof first !== 'object') {
      for (var r1 = 1; r1 < arr.length; r1++) {
        var v1 = arr[r1][k]
        if (v1 !== null && typeof v1 === 'object') return null
      }
      groups.push({ header: k, get: (function (key) { return function (row) { return [row[key]] } })(k) })
      width++
      continue
    }
    // nested object group: all rows must be plain objects with one shared
    // nested key set of flat primitives/null
    var sub = Object.keys(first)
    if (sub.length === 0) return null
    for (var r2 = 0; r2 < arr.length; r2++) {
      var v2 = arr[r2][k]
      if (!isPlainObject(v2)) return null
      if (Object.keys(v2).length !== sub.length) return null
      for (var sj = 0; sj < sub.length; sj++) {
        if (!Object.prototype.hasOwnProperty.call(v2, sub[sj])) return null
        var sv = v2[sub[sj]]
        if (sv !== null && typeof sv === 'object') return null
      }
    }
    var headerOk = safeHeaderTok(k)
    for (var sj2 = 0; sj2 < sub.length; sj2++) { if (!safeHeaderTok(sub[sj2])) headerOk = false }
    if (!headerOk) return null
    groups.push({
      header: k + '{' + sub.join(',') + '}',
      get: (function (key, subs) { return function (row) { return subs.map(function (s) { return row[key][s] }) } })(k, sub)
    })
    width += sub.length
  }
  if (width > 64) return null
  return { groups: groups, width: width }
}

/**
 * Render rows in TOON tabular form:
 *   name[N]{col1,col2{a,b},...}:
 *   cell,cell,...
 * Cells are csvCell-escaped; the format stays zero-information-loss and
 * deterministic. `tab` comes from uniformTabular.
 */
export function toonEncodeCols(arr, tab, nameArg) {
  var out = []
  out.push(nameArg + '[' + arr.length + ']{' + tab.groups.map(function (g) { return g.header }).join(',') + '}:')
  for (var i = 0; i < arr.length; i++) {
    var cells = []
    for (var k = 0; k < tab.groups.length; k++) {
      var vals = tab.groups[k].get(arr[i])
      for (var v = 0; v < vals.length; v++) cells.push(csvCell(vals[v]))
    }
    out.push(cells.join(','))
  }
  return out.join('\n')
}

/** Legacy flat encoder kept verbatim (uniform flat arrays only). */
export function toonEncode(arr, keys, nameArg) {
  var out = []
  out.push(nameArg + '[' + arr.length + ']{' + keys.join(',') + '}:')
  for (var i = 0; i < arr.length; i++) {
    var row = []
    for (var k = 0; k < keys.length; k++) row.push(csvCell(arr[i][keys[k]]))
    out.push(row.join(','))
  }
  return out.join('\n')
}

/**
 * Depth-limited search for the dominant array: the largest array (length >=
 * minLen) reachable as the root itself, a direct property of the root object,
 * or a property of a direct-child object (v2.1.x only saw the first two —
 * the very common `{data:{items:[...]}}` API shape was missed). The parent
 * must be the root object or a plain child object so the remainder can still
 * be emitted as compact JSON. First-found wins ties (document order).
 * Returns { arr, name, parent, key, isRoot } or null.
 */
export function findDominantUniformArray(parsed, minLen) {
  minLen = minLen || 8
  if (Array.isArray(parsed)) return { arr: parsed, name: 'items', parent: null, key: null, isRoot: true }
  if (!isPlainObject(parsed)) return null
  var best = null
  function consider(arr, name, parent, key) {
    if (arr.length >= minLen && (best === null || arr.length > best.arr.length)) {
      best = { arr: arr, name: name, parent: parent, key: key, isRoot: false }
    }
  }
  for (var k in parsed) {
    var v = parsed[k]
    if (Array.isArray(v)) consider(v, k, parsed, k)
  }
  if (best === null) {
    for (var k2 in parsed) {
      var v2 = parsed[k2]
      if (isPlainObject(v2)) {
        for (var k3 in v2) {
          var v3 = v2[k3]
          if (Array.isArray(v3)) consider(v3, k3, v2, k3)
        }
      }
    }
  }
  return best
}

/**
 * Keyed-tabular planner for root maps whose VALUES are uniform objects
 * (config maps, feature flags, records by id): `{k1:{a:1},k2:{a:2},...}` is
 * re-encoded as an array of rows with an added leading `key` column — same
 * zero-loss guarantee, one encoding. Returns rows or null (needs >=8 entries
 * and no `key` collision inside the value objects).
 */
export function keyedMapRows(parsed) {
  if (!isPlainObject(parsed)) return null
  var ks = Object.keys(parsed)
  if (ks.length < 8) return null
  var rows = []
  for (var i = 0; i < ks.length; i++) {
    var v = parsed[ks[i]]
    if (!isPlainObject(v)) return null
    if (Object.prototype.hasOwnProperty.call(v, 'key')) return null
    var row = { key: ks[i] }
    for (var vk in v) row[vk] = v[vk]
    rows.push(row)
  }
  return rows
}

// ---------- rtk-style line compressor (+ structure-aware table mode) ----------
export var ERROR_LINE_RE = /(fatal|panic|traceback|exception|\berror\b|err:|fail(?:ed|ure|ing)?\b|denied|rejected|timeout|timed out|abort|cannot|unable to|syntax error|assertion|segfault)/i

export function collapseBlanks(lines) {
  var out = [], blanks = 0
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') { blanks++; if (blanks >= 2) continue } else blanks = 0
    out.push(lines[i])
  }
  return out
}

export function collapseRepeats(lines) {
  var out = [], i = 0
  while (i < lines.length) {
    var j = i
    while (j < lines.length && lines[j] === lines[i]) j++
    var run = j - i
    if (run > 4 && lines[i].trim() !== '') {
      out.push(lines[i])
      out.push('[x' + run + ' identical lines]')
    } else { for (var k = i; k < j; k++) out.push(lines[k]) }
    i = j
  }
  return out
}

export function trimLongLines(lines, longLineChars) {
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i]
    if (l.length > longLineChars) {
      var head = 260, tail = 100
      l = l.slice(0, head) + ' ...[+' + (l.length - head - tail) + ' chars]... ' + l.slice(l.length - tail)
    }
    out.push(l)
  }
  return out
}

export function delimiterProfile(l) {
  var pipes = 0, tabs = 0
  for (var i = 0; i < l.length; i++) {
    var ch = l.charAt(i)
    if (ch === '|') pipes++
    else if (ch === '\t') tabs++
  }
  return pipes > 0 ? 'p' + pipes : (tabs > 0 ? 't' + tabs : 'x')
}

export function looksTabular(lines, cfg) {
  var dense = []
  for (var i = 0; i < lines.length; i++) { if (lines[i].trim() !== '') dense.push(lines[i]) }
  if (dense.length < cfg.tabularHeadRows + cfg.tabularTailRows) return false
  var profiles = new Map()
  for (var j = 0; j < dense.length; j++) {
    var p = delimiterProfile(dense[j])
    profiles.set(p, (profiles.get(p) || 0) + 1)
  }
  var best = 0
  var bestKey = 'x0'
  profiles.forEach(function (v, k) { if (v > best) { best = v; bestKey = k } })
  // The dominant profile must be a REAL delimiter profile (p*/t*). v2.1.x
  // also accepted dominance of profile 'x' (no pipe, no tab), which silently
  // rerouted plain prose to the "data rows" strided sampler; prose belongs to
  // the head/tail window with error-line protection.
  return bestKey.charAt(0) !== 'x' && best >= dense.length * 0.7 && best >= 12
}

export function windowLines(lines, cfg) {
  if (lines.length <= cfg.maxLines) return { lines: lines }
  var head = lines.slice(0, cfg.headLines)
  var tail = lines.slice(lines.length - cfg.tailLines)
  var omittedCount = lines.length - cfg.headLines - cfg.tailLines
  var middle = lines.slice(cfg.headLines, lines.length - cfg.tailLines)
  // keep up to 25 error ANCHORS, each widened by ±1 context line (a failing
  // assertion rarely explains itself on one bare line — the test name / stack
  // header next to it is what saves a re-run), merged when adjacent
  var anchors = []
  for (var i = 0; i < middle.length && anchors.length < 25; i++) {
    if (ERROR_LINE_RE.test(middle[i])) anchors.push(i)
  }
  var ranges = []
  for (var a = 0; a < anchors.length; a++) {
    var lo = Math.max(0, anchors[a] - 1), hi = Math.min(middle.length - 1, anchors[a] + 1)
    var prev = ranges[ranges.length - 1]
    if (prev && lo <= prev.hi + 1) { if (hi > prev.hi) prev.hi = hi }
    else ranges.push({ lo: lo, hi: hi })
  }
  var out = head.slice()
  out.push('[... +' + omittedCount + ' lines omitted ...]')
  if (ranges.length > 0) {
    var rows = 0
    for (var r = 0; r < ranges.length; r++) rows += ranges[r].hi - ranges[r].lo + 1
    out.push('[save-token kept ' + rows + ' error-related lines (with +-1 context lines) from the omitted region:]')
    for (var rg = 0; rg < ranges.length; rg++) {
      for (var m = ranges[rg].lo; m <= ranges[rg].hi; m++) {
        out.push('L' + (cfg.headLines + m + 1) + ': ' + middle[m])
      }
    }
  }
  out = out.concat(tail)
  return { lines: out }
}

export function windowLinesStrided(lines, cfg) {
  if (lines.length <= cfg.maxLines) return { lines: lines }
  var headN = cfg.tabularHeadRows, tailN = cfg.tabularTailRows
  var middle = lines.slice(headN, lines.length - tailN)
  var stride = Math.max(1, Math.ceil(middle.length / cfg.tabularStrideSamples))
  var out = lines.slice(0, headN)
  out.push('[... +' + middle.length + ' data rows omitted; every ' + stride + '. row sampled below WITH original line numbers so any range can be retrieved precisely ...]')
  for (var i = 0; i < middle.length; i += stride) {
    out.push('L' + (headN + i + 1) + ': ' + middle[i])
  }
  out = out.concat(lines.slice(lines.length - tailN))
  return { lines: out, strided: true }
}

export function compressLinesText(text, cfg) {
  var lines = collapseBlanks(text.split('\n'))
  lines = collapseRepeats(lines)
  lines = trimLongLines(lines, cfg.longLineChars)
  if (looksTabular(lines, cfg)) {
    var t = windowLinesStrided(lines, cfg)
    return { text: t.lines.join('\n'), strided: t.strided === true }
  }
  var w = windowLines(lines, cfg)
  return { text: w.lines.join('\n'), strided: false }
}

// ---------- headroom-style structural JSON compressor (lossy, with stats) ----------
export function isProtectedKey(k) { return /error|message|stack|fail|fatal|exception|warn/i.test(String(k)) }

export function newElisionStats() { return { omittedItems: 0, omittedKeys: 0, trimmedStrings: 0 } }

export function transformValue(v, depth, stats) {
  if (depth > 6) return '[deep]'
  if (Array.isArray(v)) {
    if (v.length > 10) {
      if (stats) stats.omittedItems += v.length - 5
      var kept = []
      for (var i = 0; i < 3; i++) kept.push(transformValue(v[i], depth + 1, stats))
      kept.push({ __omitted__: '+' + (v.length - 5) + ' more items' })
      kept.push(transformValue(v[v.length - 2], depth + 1, stats))
      kept.push(transformValue(v[v.length - 1], depth + 1, stats))
      return kept
    }
    return v.map(function (x) { return transformValue(x, depth + 1, stats) })
  }
  if (v && typeof v === 'object') {
    var out = {}, keys = Object.keys(v), n = 0
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki]
      n++
      if (n > 30) {
        if (stats) stats.omittedKeys += keys.length - 30
        out.__omitted_keys__ = '+' + (keys.length - 30) + ' more keys'
        break
      }
      var val = v[k]
      if (typeof val === 'string' && val.length > 400 && !isProtectedKey(k)) {
        if (stats) stats.trimmedStrings++
        val = val.slice(0, 220) + ' ...[+' + (val.length - 300) + ' chars]... ' + val.slice(val.length - 80)
      } else if (typeof val === 'string' && isProtectedKey(k) && val.length > 2000) {
        if (stats) stats.trimmedStrings++
        // fix v2.1.x off-by-100: 1800 chars are kept, so the message must
        // report length - 1800 (it used to under-report by exactly 100)
        val = val.slice(0, 1800) + ' ...[+' + (val.length - 1800) + ' chars truncated error detail]... '
      } else if (val && typeof val === 'object') {
        val = transformValue(val, depth + 1, stats)
      }
      out[k] = val
    }
    return out
  }
  return v
}

function elisionText(parsed) {
  var stats = newElisionStats()
  try {
    var reb = JSON.stringify(transformValue(parsed, 0, stats))
    if (typeof reb !== 'string' || reb.length < 20) return null
    return { text: reb, stats: stats }
  } catch (e) { return null }
}

/**
 * Whole-document JSON routes, in preference order:
 *   1. lossless TOON tabular (root array / direct or nested dominant array /
 *      keyed map) — zero information loss;
 *   2. lossy structural elision (arrays >10, objects >30 keys, long strings
 *      trimmed) — with shape stats for the notice.
 *
 * Both candidates are GENERATED and handed to the caller so the never-worse
 * gates can be applied to each in order (lossless first, lossy as the
 * gate-checked fallback before the line compressor). The lossy candidate is
 * priced on the pristine document — the TOON construction below deletes the
 * tabularized array from `parsed` (a throwaway parse we own), and pricing
 * after that mutation would make elision look artificially tiny.
 *
 * Returns an ordered list (possibly empty) of
 * { text, lossless, strategy, stats? } with strategy in
 * 'toon-array' | 'toon-keyed' | 'elision'.
 */
export function jsonRoutes(text, cfg) {
  var t = text.trim()
  if (t.length > cfg.jsonMaxParseBytes) return []
  if (t.charAt(0) !== '{' && t.charAt(0) !== '[') return []
  var parsed
  try { parsed = JSON.parse(t) } catch (e) { return [] }

  // price the lossy candidate BEFORE the TOON route mutates `parsed`
  var elision = elisionText(parsed)
  var routes = []

  var toon = null
  var dom = findDominantUniformArray(parsed, 8)
  if (dom !== null) {
    var tab = uniformTabular(dom.arr)
    if (tab !== null) {
      var parts = []
      if (dom.isRoot) {
        parts.push(toonEncodeCols(dom.arr, tab, dom.name))
      } else {
        // rest of the document minus the tabularized array; deleting the key
        // leaves an empty wrapper that marks the array's position — nothing
        // is lost, the array is right below as a table
        delete dom.parent[dom.key]
        var restJson = Object.keys(parsed).length > 0 ? JSON.stringify(parsed) : ''
        parts.push(restJson)
        parts.push(toonEncodeCols(dom.arr, tab, dom.name))
      }
      var enc2 = parts.filter(function (s) { return s.length > 0 }).join('\n')
      if (enc2.length >= 20) toon = { text: enc2, strategy: 'toon-array' }
    }
  }
  if (toon === null && isPlainObject(parsed)) {
    var rows = keyedMapRows(parsed)
    if (rows !== null) {
      var ktab = uniformTabular(rows)
      if (ktab !== null) {
        var kenc = toonEncodeCols(rows, ktab, 'items')
        if (kenc.length >= 20) toon = { text: kenc, strategy: 'toon-keyed' }
      }
    }
  }
  if (toon !== null) routes.push({ text: toon.text, lossless: true, strategy: toon.strategy })
  if (elision !== null) routes.push({ text: elision.text, lossless: false, strategy: 'elision', stats: elision.stats })
  return routes
}

/** Preferred (head-of-list) JSON route — kept for callers/tests. */
export function compressJsonText(text, cfg) {
  var routes = jsonRoutes(text, cfg)
  return routes.length > 0 ? routes[0] : null
}

/**
 * JSONL/NDJSON lossless route: every line parses as a JSON object with a
 * uniform (nested-aware tabular) shape -> one TOON table. Streaming API logs,
 * `jq -c` dumps and batch exports hit this; v2.1.x sent them all down the
 * lossy line-window path. Returns null when any line fails to parse, any
 * row is not a plain object, or the shape is not uniform.
 */
export function compressJsonlText(text, cfg) {
  var t = text.trim()
  if (!t || t.length > cfg.jsonMaxParseBytes) return null
  if (t.charAt(0) !== '{') return null
  var lines = t.split('\n')
  var rows = []
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim()
    if (ln === '') continue
    var p
    try { p = JSON.parse(ln) } catch (e) { return null }
    if (!isPlainObject(p)) return null
    rows.push(p)
  }
  if (rows.length < (cfg.jsonlMinLines || 8)) return null
  var tab = uniformTabular(rows)
  if (tab === null) return null
  var out = toonEncodeCols(rows, tab, 'items')
  if (out.length < 20) return null
  return { text: out, lossless: true, strategy: 'jsonl' }
}

/**
 * Effective trigger floor: an output can never pass the never-worse gates
 * (save >= minSavingBytes AND keep <= keepRatioMax) unless it is at least
 * minSavingBytes / (1 - keepRatioMax) bytes — below that, building a
 * candidate is wasted work. Returns the size threshold in bytes.
 */
export function effectiveMinBytes(minBytes, minSavingBytes, keepRatioMax) {
  if (keepRatioMax < 1) return Math.max(minBytes, Math.ceil(minSavingBytes / (1 - keepRatioMax)))
  return minBytes
}

/**
 * Apply the never-worse double gate (byte + token) to one route candidate.
 * Returns the gated candidate or null (route rejected).
 */
function gate(route, text, cfg) {
  if (!route) return null
  var candidate = route.text
  if (!candidate || candidate.length < 20) return null
  var before = utf8Bytes(text), after = utf8Bytes(candidate)
  if (after > before * cfg.keepRatioMax) return null
  if (before - after < cfg.minSavingBytes) return null
  if (estTokens(candidate) >= estTokens(text)) return null
  return { text: candidate, before: before, after: after, lossless: route.lossless === true, strategy: route.strategy, stats: route.stats }
}

/**
 * Candidate builder with the never-worse double gate (byte + token).
 * Route order: lossless TOON (array/keyed) -> lossy elision -> JSONL table ->
 * line compressor. Each route must pass the gates; the first that does wins.
 * This is article finding #3 done right: both JSON encodings are generated
 * and priced, but "better" is judged by the project's own value system —
 * zero-information-loss when it passes never-worse, lossier routes strictly
 * as fallback.
 * Returns null (original should go out) or
 * { text, before, after, lossless, strategy, stats? }.
 */
export function buildCandidate(text, cfg) {
  var routes = jsonRoutes(text, cfg)
  var viaJsonl = compressJsonlText(text, cfg)
  if (viaJsonl !== null) routes.push(viaJsonl)
  for (var i = 0; i < routes.length; i++) {
    var g = gate(routes[i], text, cfg)
    if (g !== null) return g
  }
  var lines = compressLinesText(text, cfg)
  return gate({ text: lines.text, lossless: false, strategy: lines.strided ? 'lines-strided' : 'lines' }, text, cfg)
}

/**
 * Reversibility trailer. Verbose form (first `noticeFullTrailerCount` adopted
 * compressions per process) carries the full self-explanatory text; later
 * events use a compact form with the same id and locator so every trailer
 * keeps both recovery channels while costing fewer replayed tokens. Both
 * forms match the replay scanner pattern "[save-token #<id> ".
 */
export function buildNotice(opts) {
  var head = opts.lossless ? ' losslessly re-encoded' : ' compressed'
  var id = opts.id
  if (!opts.verbose) {
    return opts.body + '\n\n[save-token #' + id + head + ': ' + fmtInt(opts.before) + ' -> ' + fmtInt(opts.after) + ' bytes. expand: save_token_expand id="' + id + '" | full: ' + opts.locator + ']'
  }
  var pct = Math.round((1 - opts.after / opts.before) * 100)
  var shape = ''
  if (!opts.lossless && opts.stats) {
    var bits = []
    if (opts.stats.omittedItems > 0) bits.push('+' + fmtInt(opts.stats.omittedItems) + ' array items')
    if (opts.stats.omittedKeys > 0) bits.push('+' + fmtInt(opts.stats.omittedKeys) + ' object keys')
    if (opts.stats.trimmedStrings > 0) bits.push(fmtInt(opts.stats.trimmedStrings) + ' long strings trimmed')
    if (bits.length > 0) shape = ' Omitted: ' + bits.join(', ') + '.'
  }
  return opts.body + '\n\n[save-token #' + id + head + ': ' + fmtInt(opts.before) + ' -> ' + fmtInt(opts.after) + ' bytes (~' + pct + '% smaller)' + (opts.lossless ? ', zero information loss' : '') + '.' + shape + ' Need any omitted detail? Call the save_token_expand tool with id "' + id + '", or read the FULL ORIGINAL at: ' + opts.locator + '. ' + (opts.retrievalHint || '') + ']'
}
