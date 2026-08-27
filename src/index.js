/*!
 * dsh-plugin-save-token v2.1.0 — Host half (node)
 *
 * Standard Cordis plugin loaded from the bundle layer declared in
 * cordis.patch.yml (`dsh plugin --profile web add <pkg>`). Contract:
 *
 * - `inject = ['tools', 'webServer']` — the dsh-tools registry for the
 *   `save_token_expand` dynamic tool, and the web server surface for the
 *   package-private JSON API consumed by the client dashboard.
 * - `spillStore` and `compaction` are read lazily with ctx.get() and both are
 *   optional at runtime: missing spillStore keeps compression permanently off
 *   (reversibility first), missing compaction only disables the pressure
 *   assist.
 * - Waterfalls: `tools/post-execute` (prepend), `llm/stream`, and
 *   `agent/pre-step`.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'save-token'

export const inject = ['tools', 'webServer']

export function apply(ctx, config) {
  // ---------- owned state ----------
  var enc = new TextEncoder()
  var cfg = {
    compressEnabled: true,
    dedupeEnabled: true,
    minBytes: 1400,
    errorMinBytes: 6000,
    minSavingBytes: 500,
    keepRatioMax: 0.72,
    maxLines: 240,
    headLines: 140,
    tailLines: 80,
    tabularHeadRows: 60,
    tabularTailRows: 40,
    tabularStrideSamples: 50,
    longLineChars: 420,
    jsonMaxParseBytes: 524288,
    dedupeTtlMs: 90000,
    compactBudgetTokens: 120000,
    compactCooldownMs: 600000
  }
  if (config && typeof config === 'object') {
    for (var ck in cfg) {
      if (Object.prototype.hasOwnProperty.call(config, ck) && config[ck] !== undefined) cfg[ck] = config[ck]
    }
  }
  var startedAt = Date.now()
  var totals = { requests: 0, auxRequests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, avoidedTokens: 0, estPromptTokens: 0 }
  var comp = { count: 0, bytesBefore: 0, bytesAfter: 0, dedupeHits: 0, dedupeSavedBytes: 0, replays: 0, losslessEncodes: 0, tabularWindows: 0 }
  var compactStats = { attempts: 0, done: 0, skipped: 0 }
  var records = []
  var recent = []
  var byTool = new Map()
  var compressedIndex = new Map()
  var dedupeCache = new Map()
  var originals = new Map()
  var lastEstBySession = new Map()
  var lastCompactAt = new Map()
  var seq = 0
  var spillAvailable = null
  var lastSkip = ''
  var lastLossless = false

  function noteRecent(kind, label, detail, savedTokens) {
    recent.unshift({ ts: Date.now(), kind: kind, label: String(label || ''), detail: String(detail || ''), saved: savedTokens || 0 })
    if (recent.length > 60) recent.length = 60
  }

  // ---------- estimators ----------
  function utf8Bytes(s) { return enc.encode(s).length }
  function estTokens(s) {
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
  function fnv1a(s) {
    var h = 0x811c9dc5
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0 }
    return ('0000000' + h.toString(16)).slice(-8)
  }
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
  function shortId(prefix) { seq = (seq + 1) % 1679616; return prefix + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36) }

  // ---------- TOON-style lossless tabular encoding for uniform JSON arrays ----------
  function csvCell(v) {
    var s = String(v)
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  function uniformKeys(arr) {
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
  function toonEncode(arr, keys, nameArg) {
    var out = []
    out.push(nameArg + '[' + arr.length + ']{' + keys.join(',') + '}:')
    for (var i = 0; i < arr.length; i++) {
      var row = []
      for (var k = 0; k < keys.length; k++) row.push(csvCell(arr[i][keys[k]]))
      out.push(row.join(','))
    }
    return out.join('\n')
  }
  function findDominantUniformArray(parsed) {
    if (Array.isArray(parsed)) return { arr: parsed, name: 'items' }
    if (parsed && typeof parsed === 'object') {
      var best = null
      for (var k in parsed) {
        var v = parsed[k]
        if (Array.isArray(v) && v.length >= 8 && (best === null || v.length > best.arr.length)) best = { arr: v, name: k }
      }
      return best
    }
    return null
  }

  // ---------- rtk-style line compressor (+ structure-aware table mode) ----------
  var ERROR_LINE_RE = /(fatal|panic|traceback|exception|\berror\b|err:|fail(?:ed|ure|ing)?\b|denied|rejected|timeout|timed out|abort|cannot|unable to|syntax error|assertion|segfault)/i

  function collapseBlanks(lines) {
    var out = [], blanks = 0
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') { blanks++; if (blanks >= 2) continue } else blanks = 0
      out.push(lines[i])
    }
    return out
  }
  function collapseRepeats(lines) {
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
  function trimLongLines(lines) {
    var out = []
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i]
      if (l.length > cfg.longLineChars) {
        var head = 260, tail = 100
        l = l.slice(0, head) + ' ...[+' + (l.length - head - tail) + ' chars]... ' + l.slice(l.length - tail)
      }
      out.push(l)
    }
    return out
  }
  function delimiterProfile(l) {
    var pipes = 0, tabs = 0
    for (var i = 0; i < l.length; i++) {
      var ch = l.charAt(i)
      if (ch === '|') pipes++
      else if (ch === '\t') tabs++
    }
    return pipes > 0 ? 'p' + pipes : (tabs > 0 ? 't' + tabs : 'x')
  }
  function looksTabular(lines) {
    var dense = []
    for (var i = 0; i < lines.length; i++) { if (lines[i].trim() !== '') dense.push(lines[i]) }
    if (dense.length < cfg.tabularHeadRows + cfg.tabularTailRows) return false
    var profiles = new Map()
    for (var j = 0; j < dense.length; j++) {
      var p = delimiterProfile(dense[j])
      profiles.set(p, (profiles.get(p) || 0) + 1)
    }
    var best = 0
    profiles.forEach(function (v) { if (v > best) best = v })
    return best >= dense.length * 0.7 && best >= 12
  }
  function windowLines(lines) {
    if (lines.length <= cfg.maxLines) return { lines: lines }
    var head = lines.slice(0, cfg.headLines)
    var tail = lines.slice(lines.length - cfg.tailLines)
    var omittedCount = lines.length - cfg.headLines - cfg.tailLines
    var middle = lines.slice(cfg.headLines, lines.length - cfg.tailLines)
    var protectedLines = []
    for (var i = 0; i < middle.length && protectedLines.length < 25; i++) {
      if (ERROR_LINE_RE.test(middle[i])) protectedLines.push('L' + (cfg.headLines + i + 1) + ': ' + middle[i])
    }
    var out = head.slice()
    out.push('[... +' + omittedCount + ' lines omitted ...]')
    if (protectedLines.length > 0) {
      out.push('[save-token kept ' + protectedLines.length + ' error-like lines from the omitted region:]')
      for (var p = 0; p < protectedLines.length; p++) out.push(protectedLines[p])
    }
    out = out.concat(tail)
    return { lines: out }
  }
  function windowLinesStrided(lines) {
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
  function compressLines(text) {
    var lines = collapseBlanks(text.split('\n'))
    lines = collapseRepeats(lines)
    lines = trimLongLines(lines)
    if (looksTabular(lines)) {
      var t = windowLinesStrided(lines)
      if (t.strided) comp.tabularWindows++
      return t.lines.join('\n')
    }
    var w = windowLines(lines)
    return w.lines.join('\n')
  }

  // ---------- headroom-style structural JSON compressor ----------
  function isProtectedKey(k) { return /error|message|stack|fail|fatal|exception|warn/i.test(String(k)) }
  function transformValue(v, depth) {
    if (depth > 6) return '[deep]'
    if (Array.isArray(v)) {
      if (v.length > 10) {
        var kept = []
        for (var i = 0; i < 3; i++) kept.push(transformValue(v[i], depth + 1))
        kept.push({ __omitted__: '+' + (v.length - 5) + ' more items' })
        kept.push(transformValue(v[v.length - 2], depth + 1))
        kept.push(transformValue(v[v.length - 1], depth + 1))
        return kept
      }
      return v.map(function (x) { return transformValue(x, depth + 1) })
    }
    if (v && typeof v === 'object') {
      var out = {}, keys = Object.keys(v), n = 0
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki]
        n++
        if (n > 30) { out.__omitted_keys__ = '+' + (keys.length - 30) + ' more keys'; break }
        var val = v[k]
        if (typeof val === 'string' && val.length > 400 && !isProtectedKey(k)) {
          val = val.slice(0, 220) + ' ...[+' + (val.length - 300) + ' chars]... ' + val.slice(val.length - 80)
        } else if (typeof val === 'string' && isProtectedKey(k) && val.length > 2000) {
          val = val.slice(0, 1800) + ' ...[+' + (val.length - 1900) + ' chars truncated error detail]... '
        } else if (val && typeof val === 'object') {
          val = transformValue(val, depth + 1)
        }
        out[k] = val
      }
      return out
    }
    return v
  }
  function compressJson(text) {
    lastLossless = false
    var t = text.trim()
    if (t.length > cfg.jsonMaxParseBytes) return null
    if (t.charAt(0) !== '{' && t.charAt(0) !== '[') return null
    var parsed
    try { parsed = JSON.parse(t) } catch (e) { return null }
    // pass 1: TOON-style lossless tabular re-encode of a dominant uniform array
    var dom = findDominantUniformArray(parsed)
    if (dom !== null) {
      var ukeys = uniformKeys(dom.arr)
      if (ukeys !== null) {
        var parts = []
        if (Array.isArray(parsed)) {
          parts.push(toonEncode(dom.arr, ukeys, dom.name))
        } else {
          var rest = {}
          for (var rk in parsed) { if (parsed[rk] !== dom.arr) rest[rk] = parsed[rk] }
          var restJson = Object.keys(rest).length > 0 ? JSON.stringify(rest) : ''
          parts.push(restJson)
          parts.push(toonEncode(dom.arr, ukeys, dom.name))
        }
        var enc2 = parts.filter(function (s) { return s.length > 0 }).join('\n')
        if (enc2.length >= 20) { comp.losslessEncodes++; lastLossless = true; return enc2 }
      }
    }
    // pass 2: structural elision transform
    var rebuilt
    try { rebuilt = JSON.stringify(transformValue(parsed, 0)) } catch (e) { return null }
    if (typeof rebuilt !== 'string' || rebuilt.length < 20) return null
    return rebuilt
  }

  // ---------- orchestration with never-worse guard (byte + token gates) ----------
  function buildCandidate(text) {
    var viaJson = compressJson(text)
    var candidate = viaJson !== null ? viaJson : compressLines(text)
    if (!candidate || candidate.length < 20) return null
    var before = utf8Bytes(text), after = utf8Bytes(candidate)
    if (after > before * cfg.keepRatioMax) return null
    if (before - after < cfg.minSavingBytes) return null
    if (estTokens(candidate) >= estTokens(text)) return null
    return { text: candidate, before: before, after: after, lossless: lastLossless === true }
  }

  function flattenPlainText(content) {
    var text = ''
    if (!Array.isArray(content)) return undefined
    for (var i = 0; i < content.length; i++) {
      var b = content[i]
      if (!b || b.type !== 'text' || typeof b.text !== 'string') return undefined
      text += b.text
    }
    return text
  }

  function ownerSessionId(exec) {
    try { return exec.agent && exec.agent.session && exec.agent.session.header ? exec.agent.session.header.id : undefined } catch (e) { return undefined }
  }
  function argsFingerprint(args) {
    var s
    try { s = typeof args === 'string' ? args : JSON.stringify(args) } catch (e) { s = String(args) }
    if (!s) s = ''
    return fnv1a(s.length > 4096 ? s.slice(0, 4096) : s)
  }

  function rememberOriginal(id, text, locator) {
    var truncated = text.length > 262144
    originals.set(id, { text: truncated ? text.slice(0, 262144) : text, locator: locator, truncated: truncated, ts: Date.now() })
    if (originals.size > 160) {
      var it = originals.keys()
      while (originals.size > 120) { var nx = it.next(); if (nx.done) break; originals.delete(nx.value) }
    }
  }
  function rememberCompressed(id, origText, replacedText, toolName) {
    var origTok = estTokens(origText), keptTok = estTokens(replacedText)
    compressedIndex.set(id, { o: Math.max(origTok, 1), k: keptTok, ts: Date.now() })
    if (compressedIndex.size > 4000) {
      var drop = compressedIndex.keys()
      while (compressedIndex.size > 3200) {
        var nx = drop.next()
        if (nx.done) break
        compressedIndex.delete(nx.value)
      }
    }
    var e = byTool.get(toolName) || { count: 0, savedBytes: 0 }
    e.count++; e.savedBytes += utf8Bytes(origText) - utf8Bytes(replacedText)
    byTool.set(toolName, e)
  }

  async function spillOriginal(text, sessionId, toolName, callId) {
    var store = ctx.get('spillStore')
    spillAvailable = store !== undefined
    if (store === undefined) { lastSkip = 'no spillStore backend: reversibility guaranteed, so compression stays off'; return undefined }
    if (sessionId === undefined) { lastSkip = 'no owning session'; return undefined }
    try {
      var ref = await store.saveText({
        owner: { sessionId: sessionId },
        source: { toolName: toolName, callId: callId, label: 'result' },
        suggestedName: toolName + '.txt',
        content: text
      })
      if (!ref || typeof ref.locator !== 'string') { lastSkip = 'spill ref had no locator'; return undefined }
      return ref
    } catch (e) { lastSkip = 'spill save failed: ' + String(e); return undefined }
  }

  // ---------- arm 1: compress/dedupe oversized tool results ----------
  ctx.on('tools/post-execute', async function (exec, result, next) {
    var decision = await next()
    if (!decision || decision.kind !== 'accept') return decision
    if (Object.prototype.hasOwnProperty.call(decision, 'value')) return decision
    if (exec.parent !== undefined) return decision
    if (exec.name === 'read') return decision
    var content = decision.content !== undefined ? decision.content : result.content
    var text = flattenPlainText(content)
    if (text === undefined) return decision
    var isError = result.isError === true
    var sessionId = ownerSessionId(exec)

    // dedupe arm (headroom cross-turn dedup, tight TTL)
    if (cfg.dedupeEnabled && !isError) {
      var fp = exec.name + '|' + argsFingerprint(exec.arguments) + '|' + fnv1a(text.length > 65536 ? text.slice(0, 65536) : text)
      var prev = dedupeCache.get(fp)
      var now = Date.now()
      if (prev && now - prev.ts <= cfg.dedupeTtlMs) {
        var ref2 = await spillOriginal(text, sessionId, exec.name, exec.callId)
        if (ref2 !== undefined) {
          var did = shortId('d')
          var agoSec = Math.round((now - prev.ts) / 1000)
          var stub = '[save-token #' + did + ' deduped: this ' + exec.name + ' call returned BYTE-IDENTICAL output to a call ' + agoSec + 's ago, which remains in context above. Do not answer from this stub alone; retrieve the earlier message, or re-run if freshness matters. Full copy of THIS call stored at: ' + ref2.locator + '. ' + (ref2.retrievalHint || '') + ']'
          var savedB = utf8Bytes(text) - utf8Bytes(stub)
          if (savedB > cfg.minSavingBytes) {
            rememberOriginal(did, text, ref2.locator)
            comp.dedupeHits++; comp.dedupeSavedBytes += savedB
            rememberCompressed(did, text, stub, exec.name)
            noteRecent('dedupe', exec.name, 'identical output within ' + agoSec + 's -> stubbed', estTokens(text) - estTokens(stub))
            return { kind: 'accept', content: [{ type: 'text', text: stub }] }
          }
        }
      }
      dedupeCache.set(fp, { ts: now, callId: exec.callId })
      if (dedupeCache.size > 800) {
        var dk = dedupeCache.keys()
        while (dedupeCache.size > 500) { var dn = dk.next(); if (dn.done) break; dedupeCache.delete(dn.value) }
      }
    }

    // compress arm
    if (!cfg.compressEnabled) return decision
    var threshold = isError ? cfg.errorMinBytes : cfg.minBytes
    if (utf8Bytes(text) <= threshold) return decision
    var cand = buildCandidate(text)
    if (cand === null) return decision
    var ref = await spillOriginal(text, sessionId, exec.name, exec.callId)
    if (ref === undefined) { noteRecent('skip', exec.name, lastSkip, 0); return decision }
    var id = shortId('c')
    var pct = Math.round((1 - cand.after / cand.before) * 100)
    var finalText = cand.text + '\n\n[save-token #' + id + (cand.lossless ? ' losslessly re-encoded' : ' compressed') + ': ' + fmtInt(cand.before) + ' -> ' + fmtInt(cand.after) + ' bytes (~' + pct + '% smaller)' + (cand.lossless ? ', zero information loss' : '') + '. Need any omitted detail? Call the save_token_expand tool with id "' + id + '", or read the FULL ORIGINAL at: ' + ref.locator + '. ' + (ref.retrievalHint || '') + ']'
    rememberOriginal(id, text, ref.locator)
    rememberCompressed(id, text, finalText, exec.name)
    comp.count++; comp.bytesBefore += cand.before; comp.bytesAfter += cand.after
    noteRecent(cand.lossless ? 'lossless' : 'compress', exec.name, fmtInt(cand.before) + 'B -> ' + fmtInt(cand.after) + 'B (-' + pct + '%)', estTokens(text) - estTokens(finalText))
    return { kind: 'accept', content: [{ type: 'text', text: finalText }] }
  }, { prepend: true })

  // ---------- arm 2: measure every model request (llm/stream waterfall) ----------
  var MARKER_RE = /\[save-token #([a-z0-9]+) /g
  function collectTexts(blocks, out, depth) {
    if (!Array.isArray(blocks)) return
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i]
      if (!b || typeof b !== 'object') continue
      if (typeof b.text === 'string') out.push(b.text)
      else if (typeof b.arguments === 'string') out.push(b.arguments)
      else if (Array.isArray(b.content) && depth < 3) collectTexts(b.content, out, depth + 1)
    }
  }
  function computeAvoided(messages) {
    var texts = []
    collectTexts(messages, texts, 0)
    var avoided = 0, hits = 0
    for (var i = 0; i < texts.length; i++) {
      MARKER_RE.lastIndex = 0
      var m
      while ((m = MARKER_RE.exec(texts[i])) !== null) {
        var ent = compressedIndex.get(m[1])
        if (ent) { avoided += Math.max(0, ent.o - ent.k); hits++ }
      }
    }
    return { avoided: avoided, hits: hits }
  }

  ctx.on('llm/stream', function (options, next) {
    var rec = {
      ts: Date.now(), kind: options.purpose ? 'aux' : 'request',
      session: options.sessionId ? String(options.sessionId).slice(-8) : '(direct)',
      provider: String(options.provider || ''), model: String(options.model || ''),
      estPrompt: 0, input: 0, cached: 0, output: 0, reasoning: 0,
      avoided: 0, replayHits: 0, closed: false, finish: ''
    }
    var fullSid = options.sessionId ? String(options.sessionId) : undefined
    try {
      var texts = []
      if (typeof options.system === 'string') texts.push(options.system)
      collectTexts(options.messages, texts, 0)
      for (var i = 0; i < texts.length; i++) rec.estPrompt += estTokens(texts[i])
      if (Array.isArray(options.tools) && options.tools.length > 0) {
        try { rec.estPrompt += estTokens(JSON.stringify(options.tools).slice(0, 200000)) } catch (e) {}
      }
      var av = computeAvoided(options.messages)
      rec.avoided = av.avoided; rec.replayHits = av.hits
    } catch (e) { console.error('save-token: measure failed', e) }

    function observe(chunk) {
      if (chunk && chunk.type === 'usage' && chunk.usage) {
        rec.input += chunk.usage.inputTokens || 0
        rec.cached += (chunk.usage.cacheReadTokens || 0) + (chunk.usage.cacheWriteTokens || 0)
        rec.output += chunk.usage.outputTokens || 0
        rec.reasoning += chunk.usage.reasoningTokens || 0
      } else if (chunk && chunk.type === 'finish' && chunk.reason) {
        rec.finish = String(chunk.reason.kind || '')
      }
    }
    function closeRecord() {
      if (rec.closed) return
      rec.closed = true
      rec.ms = Date.now() - rec.ts
      if (fullSid !== undefined) lastEstBySession.set(fullSid, rec.estPrompt)
      if (rec.kind === 'aux') totals.auxRequests++; else totals.requests++
      totals.inputTokens += rec.input; totals.cachedTokens += rec.cached
      totals.outputTokens += rec.output; totals.reasoningTokens += rec.reasoning
      totals.avoidedTokens += rec.avoided; totals.estPromptTokens += rec.estPrompt
      comp.replays += rec.replayHits
      records.push(rec)
      if (records.length > 480) records.splice(0, records.length - 400)
      noteRecent(rec.kind === 'aux' ? 'aux' : 'request', rec.model || rec.provider || '?',
        'prompt~' + fmtInt(rec.estPrompt) + ' tok, out ' + fmtInt(rec.output) + ', avoided ~' + fmtInt(rec.avoided) + (rec.replayHits ? ' (' + rec.replayHits + ' replayed)' : ''), rec.avoided)
    }

    var inner = next()
    async function* tracked() {
      try {
        for await (var chunk of inner) { observe(chunk); yield chunk }
      } finally { closeRecord() }
    }
    return tracked()
  })

  // ---------- arm 3: compaction assist at step boundaries (pressure trigger) ----------
  ctx.on('agent/pre-step', async function (payload, next) {
    try {
      var sid = payload.agent && payload.agent.session ? String(payload.agent.session.header.id) : undefined
      if (sid !== undefined && cfg.compactBudgetTokens > 0) {
        var est = lastEstBySession.get(sid) || 0
        var lastAt = lastCompactAt.get(sid) || 0
        var now = Date.now()
        if (est > cfg.compactBudgetTokens && now - lastAt > cfg.compactCooldownMs) {
          var cs = ctx.get('compaction')
          if (cs !== undefined && typeof cs.compactIfNeeded === 'function') {
            lastCompactAt.set(sid, now)
            compactStats.attempts++
            var res = await cs.compactIfNeeded(payload.agent, 'pressure', payload.signal)
            if (res !== undefined && res !== null) { compactStats.done++; noteRecent('compact', payload.agent.options && payload.agent.options.model ? payload.agent.options.model : 'session', 'context ~' + fmtInt(est) + ' tok > budget -> compaction applied', 0) }
            else { compactStats.skipped++; noteRecent('compact', 'policy', 'pressure reported at ~' + fmtInt(est) + ' tok; engine declined (no-op)', 0) }
          }
        }
      }
    } catch (e) { console.error('save-token: compaction assist failed (non-fatal)', e) }
    return next()
  })

  // ---------- arm 4: save_token_expand retrieval tool (CCR closure) ----------
  ctx.tools.register(defineTool({
    name: 'save_token_expand',
    description: 'Retrieve the FULL ORIGINAL text behind a compressed [save-token #id] tool-output notice. Use it whenever an omitted region might contain a detail you need, instead of guessing from the preview.',
    parameters: {
      id: { type: 'string', required: true, description: 'The short marker id from the notice, e.g. "c1or".' }
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: function (args, value) {
        var t = value && typeof value.text === 'string' && value.text.length > 0 ? value.text : String((value && value.error) || 'not found')
        return [{ type: 'text', text: t }]
      }
    },
    execute: function (args) {
      var key = args && typeof args.id === 'string' ? args.id.trim() : ''
      var ent = originals.get(key)
      if (!ent) return Promise.resolve({ error: 'unknown or expired id. Find the FULL ORIGINAL path printed inside the original [save-token #...] notice and use the read tool on that path.' })
      return Promise.resolve({ text: ent.text, locator: ent.locator, truncated: ent.truncated === true })
    }
  }))

  // ---------- package-private JSON API for the Client dashboard ----------
  ctx.effect(
    () => {
      const handler = async (req, res) => {
        try {
          const path = String(req.url ?? '').split('?')[0].replace(/\/+$/, '')
          const action = path.endsWith('/api/dashboard') ? 'dashboard'
            : path.endsWith('/api/set-enabled') ? 'set-enabled'
            : path.endsWith('/api/reset') ? 'reset' : ''
          if (req.method === 'GET' && action === 'dashboard') {
            sendJson(res, 200, dashboardPayload())
            return
          }
          if (req.method === 'POST' && (action === 'set-enabled' || action === 'reset')) {
            let args = {}
            try {
              const chunks = []
              for await (const c of req) chunks.push(c)
              const raw = Buffer.concat(chunks).toString('utf8')
              if (raw) args = JSON.parse(raw)
            } catch (e) { args = {} }
            sendJson(res, 200, action === 'set-enabled' ? setEnabled(args) : resetAll())
            return
          }
          sendJson(res, 404, { ok: false, error: 'unknown save-token endpoint' })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
        }
      }
      return ctx.webServer.register({ kind: 'prefix', path: '/save-token', handler })
    },
    'save-token: dashboard API routes'
  )

  function sendJson(res, status, payload) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(payload))
  }

  function dashboardPayload() {
    var series = records.slice(-60).map(function (r) {
      return { p: r.input + r.cached || r.estPrompt, a: r.avoided, aux: r.kind === 'aux' }
    })
    var tools = []
    byTool.forEach(function (v, k) { tools.push({ name: k, count: v.count, savedBytes: v.savedBytes }) })
    tools.sort(function (a, b) { return b.savedBytes - a.savedBytes })
    var billedInput = totals.inputTokens + totals.cachedTokens
    return {
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      flags: { compress: cfg.compressEnabled, dedupe: cfg.dedupeEnabled, expandTool: true },
      spillReady: spillAvailable,
      lastSkip: lastSkip,
      totals: totals,
      reliefPct: (billedInput + totals.avoidedTokens) > 0 ? Math.round(totals.avoidedTokens * 100 / (billedInput + totals.avoidedTokens)) : 0,
      compression: comp,
      compaction: { attempts: compactStats.attempts, done: compactStats.done, skipped: compactStats.skipped, budgetTok: cfg.compactBudgetTokens },
      byTool: tools.slice(0, 8),
      series: series,
      recent: recent.slice(0, 18)
    }
  }

  function setEnabled(args) {
    var a = args || {}
    if (a.key === 'compress') cfg.compressEnabled = !!a.value
    else if (a.key === 'dedupe') cfg.dedupeEnabled = !!a.value
    else if (a.key === 'compactAssist') cfg.compactBudgetTokens = a.value ? 120000 : 0
    else return { ok: false }
    noteRecent('config', a.key, (a.value ? 'enabled' : 'disabled'), 0)
    return { ok: true, flags: { compress: cfg.compressEnabled, dedupe: cfg.dedupeEnabled, expandTool: true } }
  }

  function resetAll() {
    totals.requests = 0; totals.auxRequests = 0; totals.inputTokens = 0; totals.cachedTokens = 0
    totals.outputTokens = 0; totals.reasoningTokens = 0; totals.avoidedTokens = 0; totals.estPromptTokens = 0
    comp.count = 0; comp.bytesBefore = 0; comp.bytesAfter = 0; comp.dedupeHits = 0; comp.dedupeSavedBytes = 0; comp.replays = 0; comp.losslessEncodes = 0; comp.tabularWindows = 0
    compactStats.attempts = 0; compactStats.done = 0; compactStats.skipped = 0
    records.length = 0; recent.length = 0; byTool.clear(); compressedIndex.clear(); dedupeCache.clear(); originals.clear()
    startedAt = Date.now()
    return { ok: true }
  }

  console.log('save-token v2 loaded: structure-aware compress + lossless tabular encode + expand tool + compaction assist')
}
