window.__ModuleLoader__.load({ id: "dsh-plugin-save-token", factory: function (require) {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
/*!
 * dsh-plugin-save-token v2.1.0 — Client half (browser)
 *
 * ES module built by build.mjs into the DSH client-modules handshake
 * (lib/client.js, `window.__ModuleLoader__.load({ id, factory })`). `react`
 * stays external: the web shell seeds it in the module table and the
 * loader-provided require resolves it inside the factory.
 *
 * Contract: `{ inject: ['slots'], apply(ctx) }` — registers UI into slots
 * `settings.section` and `conversation.composer.dock`, polls the
 * package-private JSON API (`/save-token/api/*`) served by the node half,
 * and renders with React.createElement.
 */
var inject = ["slots"];
var API_BASE = "/save-token/api";
var CSS = ".st-wrap{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2937)}\n.st-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.st-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}\n.st-kpi{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:10px 12px;min-width:0}\n.st-kpi .st-v{font-size:19px;font-weight:650;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.st-kpi .st-s{color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;margin-top:3px;line-height:1.35}\n.st-card{background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;padding:12px 14px}\n.st-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280);letter-spacing:.02em;text-transform:uppercase}\n.st-green{color:var(--dsw-alias-state-success-primary,#15803d)}\n.st-dim{color:var(--dsw-alias-label-secondary,#6b7280)}\n.st-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-primary,#2563eb);opacity:.85}\n.st-barrow{display:grid;grid-template-columns:minmax(90px,160px) 1fr auto;gap:10px;align-items:center;margin-top:8px;font-size:12px}\n.st-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}\n.st-table td{padding:4px 6px;border-top:1px solid var(--dsw-alias-border-l1,#eceef1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}\n.st-badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:600;border:1px solid var(--dsw-alias-border-l1,#ddd)}\n.st-btn{border:1px solid var(--dsw-alias-border-l2,#d1d5db);background:transparent;color:inherit;border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}\n.st-btn:hover{border-color:var(--dsw-alias-brand-primary,#2563eb)}\n.st-btn.st-on{border-color:var(--dsw-alias-state-success-primary,#16a34a);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#15803d);font-weight:650}\n.st-btn.st-on:hover{border-color:var(--dsw-alias-state-success-primary,#16a34a);filter:brightness(1.08)}\n.st-btn.st-off{opacity:.5}\n.st-dot{display:inline-block;width:7px;height:7px;border-radius:999px;margin-right:6px;vertical-align:1px}\n.st-strip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 6px);display:flex;gap:14px;align-items:center;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);background:var(--dsw-alias-bg-layer-2,color-mix(in srgb,var(--dsw-alias-bg-base,#f7f7f8) 82%,transparent));border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:999px;padding:3px 14px;pointer-events:none;z-index:20}";
var styled = false;
function ensureStyles() {
  if (styled || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-save-token", "");
  el.textContent = CSS;
  document.head.appendChild(el);
  styled = true;
}
async function apiGet(action) {
  const response = await fetch(API_BASE + "/" + action, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("save-token api " + action + ": HTTP " + response.status);
  return response.json();
}
async function apiPost(action, body) {
  const response = await fetch(API_BASE + "/" + action, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!response.ok) throw new Error("save-token api " + action + ": HTTP " + response.status);
  return response.json();
}
function apply(ctx) {
  ensureStyles();
  const h = import_react.default.createElement;
  function fmtTok(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(Math.round(n));
  }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b >= 1048576) return (b / 1048576).toFixed(1) + "MB";
    if (b >= 1024) return (b / 1024).toFixed(1) + "KB";
    return b + "B";
  }
  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
    } catch (e) {
      return "";
    }
  }
  const KIND_LABEL = { compress: ["compressed", "var(--dsw-alias-brand-primary,#2563eb)"], lossless: ["lossless", "var(--dsw-alias-state-success-primary,#16a34a)"], dedupe: ["deduped", "var(--dsw-alias-state-warn-primary,#b45309)"], request: ["request", "var(--dsw-alias-label-secondary,#6b7280)"], aux: ["aux-call", "var(--dsw-alias-label-secondary,#6b7280)"], skip: ["skipped", "var(--dsw-alias-state-error-primary,#b91c1c)"], config: ["config", "var(--dsw-alias-label-secondary,#6b7280)"], compact: ["compaction", "var(--dsw-alias-state-warn-primary,#b45309)"] };
  function useDashboard(intervalMs) {
    const st = import_react.default.useState(null);
    const data = st[0], setData = st[1];
    import_react.default.useEffect(function() {
      let alive = true;
      const tick = async function() {
        try {
          const d = await apiGet("dashboard");
          if (alive) setData(d);
        } catch (e) {
          console.error("save-token dashboard poll failed", e);
        }
      };
      tick();
      const timer = setInterval(tick, intervalMs);
      return function() {
        alive = false;
        clearInterval(timer);
      };
    }, []);
    return [data, setData];
  }
  function Kpi(props) {
    return h(
      "div",
      { className: "st-kpi" },
      h("div", { className: "st-title" }, props.label),
      h("div", { className: "st-v" + (props.green ? " st-green" : "") }, props.value),
      props.sub ? h("div", { className: "st-s" }, props.sub) : null
    );
  }
  function Spark(props) {
    const series = props.series || [];
    if (series.length === 0) return h("div", { className: "st-dim" }, "no requests yet");
    const n = series.length;
    let maxV = 1;
    for (let i = 0; i < n; i++) maxV = Math.max(maxV, (series[i].p || 0) + (series[i].a || 0));
    const W = n * 7, H = 48;
    const bars = [];
    for (let j = 0; j < n; j++) {
      const p = series[j].p || 0, a = series[j].a || 0;
      const ph = Math.max(p > 0 ? 2 : 0, Math.round(p / maxV * 40));
      const ah = Math.round(a / maxV * 40);
      bars.push(h("rect", { key: "p" + j, x: j * 7, y: H - 4 - ph - ah, width: 5, height: ph, fill: "var(--dsw-alias-border-l2,#c7cbd1)" }));
      if (ah > 0) bars.push(h("rect", { key: "a" + j, x: j * 7, y: H - 4 - ah, width: 5, height: ah, fill: "var(--dsw-alias-state-success-primary,#16a34a)" }));
    }
    return h("svg", { width: "100%", height: H, viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" }, bars);
  }
  function Toggle(props) {
    return h(
      "button",
      {
        className: "st-btn " + (props.on ? "st-on" : "st-off"),
        title: props.on ? "Enabled — click to turn off" : "Disabled — click to enable",
        onClick: async function() {
          try {
            await apiPost("set-enabled", { key: props.k, value: !props.on });
            props.onChange();
          } catch (e) {
            console.error(e);
          }
        }
      },
      h("span", { className: "st-dot", style: { background: props.on ? "var(--dsw-alias-state-success-primary,#16a34a)" : "currentColor", opacity: props.on ? 1 : 0.4 } }),
      props.label + ": " + (props.on ? "ON" : "OFF")
    );
  }
  function Dashboard() {
    const ud = useDashboard(2500);
    const d = ud[0], refresh = ud[1];
    if (!d) return h("div", { className: "st-dim" }, "Loading token stats...");
    const t = d.totals || {};
    const c = d.compression || {};
    const cm = d.compaction || { attempts: 0, done: 0, skipped: 0, budgetTok: 0 };
    const avgPrompt = t.requests > 0 ? Math.round(t.estPromptTokens / t.requests) : 0;
    const avgAvoided = t.requests > 0 ? Math.round(t.avoidedTokens / t.requests) : 0;
    const ratio = c.bytesBefore > 0 ? Math.round((1 - c.bytesAfter / c.bytesBefore) * 100) : 0;
    let maxSaved = 1;
    for (let i = 0; i < (d.byTool || []).length; i++) maxSaved = Math.max(maxSaved, d.byTool[i].savedBytes);
    return h(
      "div",
      { className: "st-wrap" },
      h(
        "div",
        { className: "st-row" },
        h("span", { style: { fontWeight: 650, fontSize: 15 } }, "Token Saver v2"),
        h("span", { className: "st-dim" }, "structure-aware · lossless-first · CCR"),
        h("span", { className: "st-dim" }, "up " + Math.round((d.uptimeSec || 0) / 60) + "min"),
        h("span", { className: "st-dim" }, d.flags.expandTool ? "expand-tool ✓" : ""),
        h("span", { style: { flex: 1 } }),
        h(Toggle, { k: "compress", label: "Compress", on: d.flags.compress, onChange: refresh }),
        h(Toggle, { k: "dedupe", label: "Dedupe", on: d.flags.dedupe, onChange: refresh }),
        h(Toggle, { k: "compactAssist", label: "Compact@" + fmtTok(cm.budgetTok || 12e4), on: (cm.budgetTok || 0) > 0, onChange: refresh }),
        h("button", {
          className: "st-btn",
          onClick: async function() {
            try {
              await apiPost("reset", {});
              refresh();
            } catch (e) {
              console.error(e);
            }
          }
        }, "Reset")
      ),
      d.spillReady === false ? h(
        "div",
        { className: "st-card", style: { borderColor: "var(--dsw-alias-state-error-primary,#b91c1c)" } },
        h("span", { className: "st-dim" }, "Reversible storage unavailable -> compression stays off. "),
        h("span", { className: "st-dim" }, d.lastSkip || "")
      ) : null,
      h(
        "div",
        { className: "st-kpis" },
        h(Kpi, { label: "Model requests", value: fmtTok(t.requests || 0), sub: "+" + fmtTok(t.auxRequests || 0) + " aux (title/compaction)" }),
        h(Kpi, { label: "Input tokens (actual)", value: fmtTok((t.inputTokens || 0) + (t.cachedTokens || 0)), sub: "incl " + fmtTok(t.cachedTokens || 0) + " cached/replayed" }),
        h(Kpi, { label: "Output tokens (actual)", value: fmtTok(t.outputTokens || 0), sub: fmtTok(t.reasoningTokens || 0) + " reasoning" }),
        h(Kpi, { label: "Tokens avoided (est)", value: fmtTok(t.avoidedTokens || 0), green: true, sub: "~" + d.reliefPct + "% lighter context per call avg" })
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, "Per-request context weight — gray = sent prompt, green = avoided"),
        h(Spark, { series: d.series || [] }),
        h(
          "div",
          { className: "st-s st-dim", style: { marginTop: 6 } },
          "avg prompt ~" + fmtTok(avgPrompt) + " tok | avg avoided ~" + fmtTok(avgAvoided) + " tok/request"
        )
      ),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } },
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, "Compression"),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, fmtTok(c.count || 0)), " reshaped, avg -" + ratio + "% bytes")
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            fmtBytes(c.bytesBefore || 0) + " -> " + fmtBytes(c.bytesAfter || 0)
          )
        ),
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, "Lossless routes"),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, String(c.losslessEncodes || 0)), " TOON-style re-encodes")
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            String(c.tabularWindows || 0) + " strided table windows"
          )
        ),
        h(
          "div",
          { className: "st-card" },
          h("div", { className: "st-title" }, "Dedupe / Compaction"),
          h(
            "div",
            { style: { marginTop: 6 } },
            h("div", null, h("b", null, String(c.dedupeHits || 0)), " stubbed · ", h("b", null, String(cm.done || 0)), "/", String(cm.attempts || 0), " compactions")
          ),
          h(
            "div",
            { className: "st-s st-dim", style: { marginTop: 4 } },
            fmtBytes(c.dedupeSavedBytes || 0) + " deduped · assist @" + fmtTok(cm.budgetTok || 0) + " tok"
          )
        )
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, "Top tools by bytes kept out"),
        (d.byTool || []).length === 0 ? h("div", { className: "st-dim", style: { marginTop: 8 } }, "nothing compressed yet") : h("div", null, (d.byTool || []).map(function(tool) {
          return h(
            "div",
            { className: "st-barrow", key: tool.name },
            h("span", { className: "st-dim", style: { overflow: "hidden", textOverflow: "ellipsis" } }, tool.name),
            h("div", { className: "st-bar", style: { width: Math.max(4, Math.round(tool.savedBytes * 100 / maxSaved)) + "%" } }),
            h("span", null, fmtBytes(tool.savedBytes) + " / " + tool.count + "x")
          );
        }))
      ),
      h(
        "div",
        { className: "st-card" },
        h("div", { className: "st-title" }, "Recent activity"),
        h("table", { className: "st-table" }, h("tbody", null, (d.recent || []).map(function(r, ri) {
          const kl = KIND_LABEL[r.kind] || KIND_LABEL.request;
          return h(
            "tr",
            { key: ri },
            h("td", { className: "st-dim" }, fmtTime(r.ts)),
            h("td", null, h("span", { className: "st-badge", style: { color: kl[1], borderColor: kl[1] } }, kl[0])),
            h("td", { style: { fontWeight: 550 } }, r.label),
            h("td", { className: "st-dim" }, r.detail),
            h("td", { className: "st-green", style: { textAlign: "right" } }, r.saved > 0 ? "-" + fmtTok(r.saved) : "")
          );
        })))
      ),
      h(
        "div",
        { className: "st-s st-dim" },
        "Lossless-first: uniform JSON arrays are re-encoded deterministically (TOON-style) with zero information loss; regular outputs get structure-aware windows with line-numbered stride samples. Every replacement stays retrievable via the save_token_expand tool or the stored locator."
      )
    );
  }
  function Strip() {
    const ud = useDashboard(4e3);
    const d = ud[0];
    if (!d) return null;
    const t = d.totals || {};
    const cc = d.compression && d.compression.count || 0;
    const ll = d.compression && d.compression.losslessEncodes || 0;
    return h(
      "div",
      { className: "st-strip" },
      h("span", null, "token-saver"),
      h("span", null, h("b", null, "~" + fmtTok(t.avoidedTokens || 0) + " tok avoided")),
      h("span", null, fmtTok(cc) + " compressed" + (ll > 0 ? " (" + ll + " lossless)" : "")),
      h("span", null, fmtTok(t.requests || 0) + " reqs")
    );
  }
  ctx.slots.inject("settings.section", function() {
    ctx.slots.register(
      { name: "settings.section", id: "save-token", order: 430, label: "Token Saver" },
      function() {
        return h(Dashboard);
      }
    );
  });
  ctx.slots.inject("conversation.composer.dock", function() {
    ctx.slots.register(
      { name: "conversation.composer.dock", id: "save-token-strip", order: 85 },
      function() {
        return h(Strip);
      }
    );
  });
}

return module.exports; } });
