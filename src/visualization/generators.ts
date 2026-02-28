/**
 * generators.ts
 * Three HTML generator functions — each returns a complete self-contained HTML document.
 *
 * Design decisions:
 *   - No external CDN dependencies. All JS is inline.
 *   - graph page uses Canvas 2D + a pure-JS Verlet force simulation (no D3).
 *   - All pages load data from './data.js' (var VIZ_DATA = ...).
 *   - Dark theme matches the analysis-visualization prototype.
 *
 * Template literal escaping:
 *   - TypeScript interpolations (${...}) are used only for page title and JSON data injection.
 *   - The embedded JavaScript uses string concatenation, avoiding JS template literals
 *     entirely — so no ${'$'}{ escaping is required in the JS blocks.
 */

import type { VizData } from './types.js';
import { buildPalette, type Palette } from './viz-palette.js';

// ---------------------------------------------------------------------------
// Palette computation from VizData
// ---------------------------------------------------------------------------

/** Compute a deterministic palette from the actual data present. */
function computePalette(data: VizData): Palette {
  // Collect unique node kinds actually present
  const nodeKindSet = new Set<string>();
  const subtypeSet = new Set<string>();
  const edgeKindSet = new Set<string>();

  for (const n of data.nodes) {
    nodeKindSet.add(n.type);
    if (n.type === 'Widget' && n.subtypeKey !== undefined) {
      subtypeSet.add(n.subtypeKey);
    }
  }
  for (const e of data.edges) {
    edgeKindSet.add(e.kind);
  }

  return buildPalette(
    [...nodeKindSet].sort(),
    [...subtypeSet].sort(),
    [...edgeKindSet].sort(),
  );
}

/**
 * Build the structured legend HTML for one coherent panel.
 * Three sections: node kinds (with counts), widget subtypes nested under Widget,
 * edge kinds (with counts). Only entries with count > 0.
 */
function buildLegendHtml(data: VizData, palette: Palette): string {
  // Section A: Node kinds with counts
  const nodeKindCounts: Record<string, number> = {};
  for (const n of data.nodes) {
    nodeKindCounts[n.type] = (nodeKindCounts[n.type] ?? 0) + 1;
  }

  const nodeKindHtml = Object.entries(nodeKindCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) =>
      '<div class="leg"><div class="leg-dot" style="background:' +
      (palette.nodeKindColors[kind] ?? '#888') +
      '"></div>' + kind + ' <span class="leg-count">(' + count + ')</span></div>',
    )
    .join('');

  // Section B: Widget subtypes nested under widgetKind headers
  // Group subtypeKeys by widgetKind
  const subtypesByKind: Record<string, Record<string, number>> = {};
  for (const n of data.nodes) {
    if (n.type === 'Widget' && n.widgetKind !== undefined && n.subtypeKey !== undefined) {
      if (subtypesByKind[n.widgetKind] === undefined) subtypesByKind[n.widgetKind] = {};
      subtypesByKind[n.widgetKind]![n.subtypeKey] = (subtypesByKind[n.widgetKind]![n.subtypeKey] ?? 0) + 1;
    }
  }

  let widgetSubtypeHtml = '';
  const sortedKinds = Object.keys(subtypesByKind).sort();
  for (const kind of sortedKinds) {
    const subtypes = subtypesByKind[kind]!;
    // Sort by count desc, then lex
    const sortedEntries = Object.entries(subtypes).sort(([aKey, aCount], [bKey, bCount]) => {
      if (bCount !== aCount) return bCount - aCount;
      return aKey.localeCompare(bKey);
    });
    widgetSubtypeHtml += '<div class="leg-group"><span class="leg-group-title">' + kind + '</span>';
    for (const [subtypeKey, count] of sortedEntries) {
      widgetSubtypeHtml += '<div class="leg leg-indent"><div class="leg-dot" style="background:' +
        (palette.widgetSubtypeColors[subtypeKey] ?? '#888') +
        '"></div>&lt;' + subtypeKey + '&gt; <span class="leg-count">(' + count + ')</span></div>';
    }
    widgetSubtypeHtml += '</div>';
  }

  // Section C: Edge kinds with counts
  const edgeKindCounts: Record<string, number> = {};
  for (const e of data.edges) {
    edgeKindCounts[e.kind] = (edgeKindCounts[e.kind] ?? 0) + 1;
  }

  const edgeKindHtml = Object.entries(edgeKindCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) =>
      '<div class="leg"><div class="leg-line" style="background:' +
      (palette.edgeKindColors[kind] ?? '#888') +
      '"></div>' + kind + ' <span class="leg-count">(' + count + ')</span></div>',
    )
    .join('');

  return '<div class="legend-section"><div class="legend-title">Nodes</div><div class="legend-items">' +
    nodeKindHtml +
    '</div></div>' +
    (widgetSubtypeHtml.length > 0
      ? '<div class="legend-section"><div class="legend-title">Widget subtypes</div><div class="legend-items">' +
        widgetSubtypeHtml +
        '</div></div>'
      : '') +
    '<div class="legend-section"><div class="legend-title">Edges</div><div class="legend-items">' +
    edgeKindHtml +
    '</div></div>';
}

// ---------------------------------------------------------------------------
// Shared CSS (dark theme)
// ---------------------------------------------------------------------------

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; overflow-x: hidden; }
  header { padding: 14px 20px; background: #1a1d2e; border-bottom: 1px solid #2d3148; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  header h1 { font-size: 17px; font-weight: 600; color: #7c85f0; }
  header span { font-size: 12px; color: #64748b; }
  .note { background: #1e2a40; border: 1px solid #2a3f6f; border-radius: 8px; padding: 10px 14px; margin: 12px 20px; font-size: 11px; color: #93c5fd; line-height: 1.6; }
  .note strong { color: #60a5fa; }
  h2 { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin: 20px 20px 10px; }
  .stat-strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 20px; border-bottom: 1px solid #1e2438; }
  .stat-card { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 7px; padding: 8px 14px; min-width: 90px; }
  .stat-card .n { font-size: 20px; font-weight: 700; }
  .stat-card .l { font-size: 10px; color: #64748b; margin-top: 1px; }
  .legend-row { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 20px; border-bottom: 1px solid #1e2438; }
  .leg { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; }
  .leg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .leg-line { width: 20px; height: 3px; border-radius: 2px; flex-shrink: 0; }
  .leg-count { color: #475569; font-size: 10px; }
  .legend-panel { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 20px; border-bottom: 1px solid #1e2438; }
  .legend-section { min-width: 140px; }
  .legend-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; font-weight: 600; }
  .legend-items { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  .leg-group { display: contents; }
  .leg-group-title { font-size: 10px; color: #7c85f0; font-weight: 600; margin-right: 4px; }
  .leg-indent { margin-left: 2px; }
`;

// Color constants removed — palette is now computed dynamically from data
// via computePalette() + buildPalette(). See viz-palette.ts.

// ---------------------------------------------------------------------------
// A1 — Navigation graph (Canvas 2D + Verlet force layout)
// ---------------------------------------------------------------------------

export function generateA1GraphHtml(data: VizData): string {
  const title = 'A1 Navigation Graph \u2014 ' + data.generatedFromProject;
  const palette = computePalette(data);

  // Build structured legend panel (single source of truth for kinds + counts)
  const legendHtml = buildLegendHtml(data, palette);

  // Serialize palette maps for use in embedded JS
  const nodeColorsJson = JSON.stringify(palette.nodeKindColors);
  const edgeColorsJson = JSON.stringify(palette.edgeKindColors);
  const subtypeColorsJson = JSON.stringify(palette.widgetSubtypeColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${SHARED_CSS}
  .layout { display: flex; height: calc(100vh - 57px); }
  #canvas-wrap { flex: 1; position: relative; overflow: hidden; }
  canvas { display: block; cursor: grab; width: 100%; height: 100%; }
  canvas.panning { cursor: grabbing; }
  #sidebar { width: 270px; background: #1a1d2e; border-left: 1px solid #2d3148; overflow-y: auto; display: flex; flex-direction: column; flex-shrink: 0; }
  .filter-section { padding: 8px 10px; border-bottom: 1px solid #2d3148; }
  .filter-section label { font-size: 10px; color: #64748b; display: block; margin-bottom: 5px; text-transform: uppercase; }
  .filter-btns { display: flex; flex-wrap: wrap; gap: 4px; }
  .fbtn { background: #242840; border: 1px solid #3d4275; color: #94a3b8; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; }
  .fbtn.active { color: #e2e8f0; }
  #search-wrap { padding: 8px 10px; border-bottom: 1px solid #2d3148; }
  #search { background: #242840; border: 1px solid #3d4275; color: #e2e8f0; padding: 5px 8px; border-radius: 4px; font-size: 11px; width: 100%; }
  #info-panel { flex: 1; padding: 10px; overflow-y: auto; }
  #info-panel h3 { font-size: 10px; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
  .irow { margin: 4px 0; font-size: 11px; }
  .ik { color: #7c85f0; font-weight: 600; }
  .iv { color: #e2e8f0; word-break: break-all; }
  .controls { position: absolute; bottom: 10px; left: 10px; display: flex; gap: 5px; }
  .cbtn { background: #1a1d2e; border: 1px solid #2d3148; color: #94a3b8; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 11px; }
  .cbtn:hover { background: #242840; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <span>${data.nodes.length} nodes &bull; ${data.edges.length} edges</span>
</header>
<div class="legend-panel">${legendHtml}</div>
<div class="layout">
  <div id="canvas-wrap">
    <canvas id="g"></canvas>
    <div class="controls">
      <button class="cbtn" onclick="resetView()">Reset</button>
      <button class="cbtn" onclick="toggleLabels()">Labels</button>
    </div>
  </div>
  <div id="sidebar">
    <div class="filter-section">
      <label>Node types</label>
      <div class="filter-btns" id="type-btns"></div>
    </div>
    <div class="filter-section">
      <label>Edge kinds</label>
      <div class="filter-btns" id="kind-btns"></div>
    </div>
    <div id="search-wrap">
      <input id="search" type="text" placeholder="Search node id / label..." oninput="onSearch(this.value)">
    </div>
    <div id="info-panel"><h3>Selection</h3><div id="info-content"><div style="color:#475569;font-size:11px">Click a node or edge.</div></div></div>
  </div>
</div>
<script src="./data.js"></script>
<script>
(function() {
  var NC = ${nodeColorsJson};
  var EC = ${edgeColorsJson};
  var SC = ${subtypeColorsJson};
  var RADII = { Module: 12, Route: 9, Component: 8, Widget: 6, Service: 7, External: 7 };
  function nodeColor(n) { if (n.type === 'Widget' && n.subtypeKey && SC[n.subtypeKey]) return SC[n.subtypeKey]; return NC[n.type] || '#fff'; }
  function wrapText(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return [text];
    // Split at camelCase boundaries, spaces, hyphens, underscores — NOT slashes
    var words = text.split(/(?=[A-Z])|[-_ ]/);
    if (words.length <= 1) return [text];
    var lines = [], cur = words[0] || '';
    for (var i = 1; i < words.length; i++) {
      var test = cur + words[i];
      if (c.measureText(test).width <= maxW) { cur = test; }
      else { if (cur) lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    return lines.length > 3 ? lines.slice(0, 3) : lines;
  }

  var canvas = document.getElementById('g');
  var ctx = canvas.getContext('2d');
  var wrap = document.getElementById('canvas-wrap');

  // ── State ─────────────────────────────────────────────────────────────────
  var tx = 0, ty = 0, scale = 1;
  var showLabels = true;
  var activeTypes = new Set(Object.keys(NC));
  var activeKinds = new Set(Object.keys(EC));
  var searchText = '';
  var selectedId = null;
  var focusHops = 2;

  // Simulation node state
  var simNodes = VIZ_DATA.nodes.map(function(n, i) {
    return { id: n.id, type: n.type, label: n.label, widgetKind: n.widgetKind, subtypeKey: n.subtypeKey, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, fx: null, fy: null, idx: i };
  });
  var nodeMap = {};
  simNodes.forEach(function(n) { nodeMap[n.id] = n; });

  // ── Initial circular layout ───────────────────────────────────────────────
  function initLayout() {
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var r = Math.min(W, H) * 0.38;
    simNodes.forEach(function(n, i) {
      var angle = (2 * Math.PI * i) / simNodes.length - Math.PI / 2;
      n.x = cx + r * Math.cos(angle);
      n.y = cy + r * Math.sin(angle);
      n.vx = 0; n.vy = 0;
    });
    // Reset zoom to center
    tx = 0; ty = 0; scale = 1;
  }

  // ── Force simulation ──────────────────────────────────────────────────────
  var REPULSION = 7000, SPRING_LEN = 110, SPRING_K = 0.04, DAMPING = 0.82, CENTER_K = 0.002, MAX_V = 40;
  function tick() {
    var W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
    simNodes.forEach(function(n) { n.ax = 0; n.ay = 0; });
    // Repulsion
    for (var i = 0; i < simNodes.length; i++) {
      for (var j = i + 1; j < simNodes.length; j++) {
        var a = simNodes[i], b = simNodes[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy + 1;
        var d = Math.sqrt(d2);
        var f = REPULSION / d2;
        var fx = f * dx / d, fy = f * dy / d;
        a.ax -= fx; a.ay -= fy; b.ax += fx; b.ay += fy;
      }
    }
    // Springs
    VIZ_DATA.edges.forEach(function(e) {
      if (e.to === null) return;
      var a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var stretch = d - SPRING_LEN;
      var fx = SPRING_K * stretch * dx / d, fy = SPRING_K * stretch * dy / d;
      a.ax += fx; a.ay += fy; b.ax -= fx; b.ay -= fy;
    });
    // Center gravity
    simNodes.forEach(function(n) { n.ax += CENTER_K * (cx - n.x); n.ay += CENTER_K * (cy - n.y); });
    // Integrate
    simNodes.forEach(function(n) {
      if (n.fx !== null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; return; }
      n.vx = (n.vx + n.ax) * DAMPING; n.vy = (n.vy + n.ay) * DAMPING;
      var v = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (v > MAX_V) { n.vx *= MAX_V / v; n.vy *= MAX_V / v; }
      n.x += n.vx; n.y += n.vy;
    });
  }

  // ── Visibility ────────────────────────────────────────────────────────────
  function visibleNodes() {
    var focused = getFocused();
    return simNodes.filter(function(n) {
      if (!activeTypes.has(n.type)) return false;
      if (focused && !focused.has(n.id)) return false;
      if (searchText && n.id.toLowerCase().indexOf(searchText) < 0 && n.label.toLowerCase().indexOf(searchText) < 0) return false;
      return true;
    });
  }
  function visibleEdges(vnSet) {
    return VIZ_DATA.edges.filter(function(e) {
      return e.to !== null && activeKinds.has(e.kind) && vnSet.has(e.from) && vnSet.has(e.to);
    });
  }

  function getFocused() {
    if (!selectedId) return null;
    var set = new Set();
    set.add(selectedId);
    var frontier = [selectedId];
    for (var h = 0; h < focusHops; h++) {
      var next = [];
      frontier.forEach(function(id) {
        VIZ_DATA.edges.forEach(function(e) {
          if (e.to === null) return;
          if (e.from === id && !set.has(e.to)) { set.add(e.to); next.push(e.to); }
          if (e.to === id && !set.has(e.from)) { set.add(e.from); next.push(e.from); }
        });
      });
      frontier = next;
    }
    return set;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function draw() {
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, tx, ty);

    var vn = visibleNodes();
    var vnSet = new Set(vn.map(function(n) { return n.id; }));
    var ve = visibleEdges(vnSet);

    // Edges
    ve.forEach(function(e) {
      var src = nodeMap[e.from], dst = nodeMap[e.to];
      if (!src || !dst) return;
      var color = EC[e.kind] || '#666';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / scale;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(dst.x, dst.y);
      ctx.stroke();
      // Arrowhead
      var dx = dst.x - src.x, dy = dst.y - src.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var R = (RADII[dst.type] || 8) + 4;
      var ax = dst.x - dx / d * R, ay = dst.y - dy / d * R;
      var angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8 / scale, 4 / scale);
      ctx.lineTo(-8 / scale, -4 / scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    // Nodes
    vn.forEach(function(n) {
      var r = RADII[n.type] || 8;
      var color = nodeColor(n);
      var isSelected = n.id === selectedId;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
      if (showLabels) {
        ctx.fillStyle = color;
        var fs = 9 / scale;
        ctx.font = fs + 'px Segoe UI,sans-serif';
        ctx.textAlign = 'center';
        var lines = wrapText(ctx, n.label, 100 / scale);
        for (var li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], n.x, n.y - r - (3 + (lines.length - 1 - li) * (fs + 1)) / scale);
        }
      }
    });

    ctx.restore();
  }

  var animRunning = true;
  var TICKS = 3;
  function loop() {
    if (!animRunning) return;
    for (var i = 0; i < TICKS; i++) tick();
    draw();
    requestAnimationFrame(loop);
  }

  // ── Pan / zoom ─────────────────────────────────────────────────────────────
  var panning = false, panStart = { x: 0, y: 0 }, panOrig = { tx: 0, ty: 0 };
  var draggingNode = null, dragStart = { x: 0, y: 0 };

  function worldPos(ex, ey) {
    var rect = canvas.getBoundingClientRect();
    return { x: (ex - rect.left - tx) / scale, y: (ey - rect.top - ty) / scale };
  }

  function hitNode(wx, wy) {
    for (var i = simNodes.length - 1; i >= 0; i--) {
      var n = simNodes[i];
      var r = (RADII[n.type] || 8) + 4;
      var dx = wx - n.x, dy = wy - n.y;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }

  function hitEdge(wx, wy) {
    var best = null, bestD = 8 / scale;
    VIZ_DATA.edges.forEach(function(e) {
      if (e.to === null) return;
      var a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var t = ((wx - a.x) * dx + (wy - a.y) * dy) / (len * len);
      t = Math.max(0, Math.min(1, t));
      var px = a.x + t * dx - wx, py = a.y + t * dy - wy;
      var d = Math.sqrt(px * px + py * py);
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  canvas.addEventListener('mousedown', function(ev) {
    var w = worldPos(ev.clientX, ev.clientY);
    var n = hitNode(w.x, w.y);
    if (n) { draggingNode = n; dragStart = { x: w.x - n.x, y: w.y - n.y }; n.fx = n.x; n.fy = n.y; }
    else { panning = true; panStart = { x: ev.clientX, y: ev.clientY }; panOrig = { tx: tx, ty: ty }; canvas.classList.add('panning'); }
  });
  window.addEventListener('mousemove', function(ev) {
    if (draggingNode) {
      var w = worldPos(ev.clientX, ev.clientY);
      draggingNode.fx = w.x - dragStart.x; draggingNode.fy = w.y - dragStart.y;
      draggingNode.x = draggingNode.fx; draggingNode.y = draggingNode.fy;
    } else if (panning) {
      tx = panOrig.tx + (ev.clientX - panStart.x);
      ty = panOrig.ty + (ev.clientY - panStart.y);
    }
  });
  window.addEventListener('mouseup', function() {
    if (draggingNode) { draggingNode.fx = null; draggingNode.fy = null; draggingNode = null; }
    panning = false; canvas.classList.remove('panning');
  });
  canvas.addEventListener('wheel', function(ev) {
    ev.preventDefault();
    var factor = ev.deltaY < 0 ? 1.12 : 0.89;
    var rect = canvas.getBoundingClientRect();
    var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    tx = mx - (mx - tx) * factor; ty = my - (my - ty) * factor;
    scale *= factor;
  }, { passive: false });
  canvas.addEventListener('click', function(ev) {
    var w = worldPos(ev.clientX, ev.clientY);
    var n = hitNode(w.x, w.y);
    if (n) { selectedId = n.id; showNodeInfo(n); return; }
    var e = hitEdge(w.x, w.y);
    if (e) { selectedId = null; showEdgeInfo(e); return; }
    selectedId = null;
    document.getElementById('info-content').innerHTML = '<div style="color:#475569;font-size:11px">Click a node or edge.</div>';
  });

  function showNodeInfo(n) {
    var orig = (VIZ_DATA.nodes.find(function(x) { return x.id === n.id; }));
    var html = '<div class="irow"><span class="ik">type: </span><span class="iv">' + n.type + '</span></div>' +
      '<div class="irow"><span class="ik">id: </span><span class="iv">' + n.id + '</span></div>' +
      '<div class="irow"><span class="ik">label: </span><span class="iv">' + n.label + '</span></div>';
    if (orig && orig.routeParams && orig.routeParams.length) html += '<div class="irow"><span class="ik">routeParams: </span><span class="iv">' + orig.routeParams.join(', ') + '</span></div>';
    if (orig && orig.authRequired) html += '<div class="irow"><span class="ik">authRequired: </span><span class="iv" style="color:#f87171">true</span></div>';
    document.getElementById('info-content').innerHTML = html;
  }

  function showEdgeInfo(e) {
    var color = EC[e.kind] || '#aaa';
    var html = '<div class="irow"><span class="ik">kind: </span><span class="iv" style="color:' + color + '">' + e.kind + '</span></div>' +
      '<div class="irow"><span class="ik">id: </span><span class="iv">' + e.id + '</span></div>' +
      '<div class="irow"><span class="ik">from: </span><span class="iv">' + e.from + '</span></div>' +
      '<div class="irow"><span class="ik">to: </span><span class="iv">' + (e.to || 'null') + '</span></div>';
    if (e.isSystem) html += '<div class="irow"><span class="ik">isSystem: </span><span class="iv" style="color:#fb923c">true</span></div>';
    html += '<div class="irow"><span class="ik">preconditions: </span><span class="iv">' + e.uiPreconditionCount + '</span></div>';
    if (e.uiPreconditions.length) html += '<div class="irow"><span class="ik">predicates: </span><span class="iv">' + e.uiPreconditions.join(' | ') + '</span></div>';
    document.getElementById('info-content').innerHTML = html;
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  function buildFilterBtns(container, items, activeSet, colorMap) {
    var el = document.getElementById(container);
    items.forEach(function(item) {
      var btn = document.createElement('button');
      btn.className = 'fbtn' + (activeSet.has(item) ? ' active' : '');
      btn.textContent = item;
      btn.style.borderColor = colorMap[item] || '#3d4275';
      if (activeSet.has(item)) btn.style.background = (colorMap[item] || '#3d4275') + '33';
      btn.addEventListener('click', function() {
        if (activeSet.has(item)) activeSet.delete(item);
        else activeSet.add(item);
        btn.className = 'fbtn' + (activeSet.has(item) ? ' active' : '');
        btn.style.background = activeSet.has(item) ? ((colorMap[item] || '#3d4275') + '33') : '';
      });
      el.appendChild(btn);
    });
  }

  var allTypes = Object.keys(NC);
  var allKinds = Object.keys(EC);
  buildFilterBtns('type-btns', allTypes, activeTypes, NC);
  buildFilterBtns('kind-btns', allKinds, activeKinds, EC);

  window.onSearch = function(v) { searchText = v.toLowerCase(); };
  window.resetView = function() {
    tx = 0; ty = 0; scale = 1;
    initLayout();
  };
  window.toggleLabels = function() { showLabels = !showLabels; };

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize() {
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
  }
  window.addEventListener('resize', function() { resize(); });

  // ── Boot ──────────────────────────────────────────────────────────────────
  resize();
  initLayout();
  loop();
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// A2 — Mock workflows (exemplar paths from path-finder)
// ---------------------------------------------------------------------------

export function generateA2WorkflowsHtml(data: VizData): string {
  const title = 'A2 Exemplar Workflows \u2014 ' + data.generatedFromProject;
  const palette = computePalette(data);

  const nodeColorsJson = JSON.stringify(palette.nodeKindColors);
  const edgeColorsJson = JSON.stringify(palette.edgeKindColors);
  const subtypeColorsJson = JSON.stringify(palette.widgetSubtypeColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${SHARED_CSS}
  .page { padding: 0 20px 32px; }
  .workflow { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
  .wf-title { font-size: 12px; font-weight: 600; color: #c4b5fd; margin-bottom: 4px; }
  .wf-meta { font-size: 10px; color: #64748b; margin-bottom: 12px; }
  .steps { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 0; }
  .step { display: flex; flex-direction: column; align-items: center; }
  .step-box { border-radius: 7px; padding: 7px 10px; text-align: center; min-width: 100px; max-width: 150px; cursor: pointer; transition: opacity 0.1s; }
  .step-box:hover { opacity: 0.85; }
  .s-type { font-size: 9px; text-transform: uppercase; color: #64748b; }
  .s-label { font-size: 11px; font-weight: 600; margin: 2px 0; word-break: break-word; }
  .s-badges { margin-top: 3px; }
  .badge { display: inline-block; background: #2d3060; border-radius: 3px; padding: 1px 4px; font-size: 9px; color: #a78bfa; margin: 1px; }
  .badge.auth { color: #f87171; background: #3b1515; }
  .badge.param { color: #fbbf24; background: #2d1f00; }
  .badge.pre { color: #93c5fd; }
  .detail-panel { display: none; background: #242840; border-radius: 5px; padding: 8px 10px; margin-top: 4px; font-size: 10px; width: 100%; max-width: 200px; }
  .detail-panel.open { display: block; }
  .drow { margin: 2px 0; }
  .dk { color: #7c85f0; }
  .dv { color: #e2e8f0; }
  .arrow-wrap { display: flex; flex-direction: column; align-items: center; padding: 0 4px; padding-top: 14px; min-width: 55px; }
  .arr-line { height: 2px; width: 100%; }
  .arr-kind { font-size: 8px; font-weight: 600; text-transform: uppercase; margin-top: 3px; text-align: center; }
  .arr-nav { font-size: 8px; color: #64748b; text-align: center; }
  .empty { color: #475569; font-size: 12px; padding: 20px; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <span>${data.exemplarPaths.length} exemplar paths &bull; ${data.stats.feasible} feasible &bull; ${data.stats.conditional} conditional &bull; ${data.stats.pruned} pruned</span>
</header>
<div class="note">
  <strong>Note:</strong> These are <em>exemplar paths for visualization only</em> \u2014 NOT an A2 deliverable.
  Generated by bounded DFS (max 6 edges, max 2 paths per entry node, simple-path rule, deterministic order).
  C(W) shows the union of constraint surfaces accumulated along each path.
</div>
<div class="page">
  <div id="wf-container"></div>
</div>
<script src="./data.js"></script>
<script>
(function() {
  var NC = ${nodeColorsJson};
  var EC = ${edgeColorsJson};
  var SC = ${subtypeColorsJson};
  function nodeColor(n) { if (n.type === 'Widget' && n.subtypeKey && SC[n.subtypeKey]) return SC[n.subtypeKey]; return NC[n.type] || '#aaa'; }

  var nodeById = {};
  VIZ_DATA.nodes.forEach(function(n) { nodeById[n.id] = n; });
  var edgeById = {};
  VIZ_DATA.edges.forEach(function(e) { edgeById[e.id] = e; });

  var container = document.getElementById('wf-container');

  if (!VIZ_DATA.exemplarPaths.length) {
    container.innerHTML = '<div class="empty">No exemplar paths found for this graph.</div>';
    return;
  }

  VIZ_DATA.exemplarPaths.forEach(function(path, pi) {
    var wf = document.createElement('div');
    wf.className = 'workflow';

    var termNode = nodeById[path.steps[path.steps.length - 1] ? path.steps[path.steps.length - 1].nodeId : ''];
    var termLabel = termNode ? termNode.label : '?';
    var title = document.createElement('div');
    title.className = 'wf-title';
    title.textContent = 'W' + (pi + 1) + ': ' + path.entryNodeId.split('@')[0] + ' \u2192 \u2026 \u2192 ' + termLabel;
    wf.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'wf-meta';
    meta.textContent = path.steps.length + ' steps \u00b7 verdict: ' + path.verdict +
      (path.aggregated.requiredParams.length ? ' \u00b7 params: ' + path.aggregated.requiredParams.join(', ') : '') +
      (path.aggregated.authRequired ? ' \u00b7 authRequired' : '');
    wf.appendChild(meta);

    var stepsRow = document.createElement('div');
    stepsRow.className = 'steps';

    path.steps.forEach(function(step, si) {
      var node = nodeById[step.nodeId];
      if (!node) return;
      var color = nodeColor(node);

      var stepEl = document.createElement('div');
      stepEl.className = 'step';

      var box = document.createElement('div');
      box.className = 'step-box';
      box.style.background = color + '18';
      box.style.border = '1.5px solid ' + color;

      var typeDiv = document.createElement('div');
      typeDiv.className = 's-type';
      typeDiv.textContent = node.type;

      var labelDiv = document.createElement('div');
      labelDiv.className = 's-label';
      labelDiv.style.color = color;
      labelDiv.textContent = node.label;

      var badges = document.createElement('div');
      badges.className = 's-badges';

      var cs = step.constraintsSoFar;
      cs.requiredParams.forEach(function(p) {
        var b = document.createElement('span');
        b.className = 'badge param';
        b.textContent = ':' + p;
        badges.appendChild(b);
      });
      if (cs.authRequired) {
        var ab = document.createElement('span');
        ab.className = 'badge auth';
        ab.textContent = 'auth';
        badges.appendChild(ab);
      }
      cs.uiPreconditions.slice(0, 2).forEach(function(p) {
        var b = document.createElement('span');
        b.className = 'badge pre';
        b.textContent = p.length > 15 ? p.slice(0, 13) + '\u2026' : p;
        badges.appendChild(b);
      });

      box.appendChild(typeDiv);
      box.appendChild(labelDiv);
      box.appendChild(badges);

      // Detail panel
      var detail = document.createElement('div');
      detail.className = 'detail-panel';
      if (step.edgeId) {
        var edge = edgeById[step.edgeId];
        if (edge) {
          detail.innerHTML = '<div class="drow"><span class="dk">edge kind: </span><span class="dv" style="color:' + (EC[edge.kind] || '#aaa') + '">' + edge.kind + '</span></div>' +
            (edge.isSystem ? '<div class="drow"><span class="dk">system: </span><span class="dv" style="color:#fb923c">true</span></div>' : '') +
            '<div class="drow"><span class="dk">preconditions: </span><span class="dv">' + edge.uiPreconditionCount + '</span></div>';
        }
      } else {
        detail.innerHTML = '<div class="drow"><span class="dk">role: </span><span class="dv">entry node</span></div>';
      }
      box.addEventListener('click', function() { detail.classList.toggle('open'); });
      stepEl.appendChild(box);
      stepEl.appendChild(detail);
      stepsRow.appendChild(stepEl);

      // Arrow between steps
      if (si < path.steps.length - 1) {
        var nextStep = path.steps[si + 1];
        var nextEdge = nextStep && nextStep.edgeId ? edgeById[nextStep.edgeId] : null;
        var ekind = nextEdge ? nextEdge.kind : 'WIDGET_NAVIGATES_ROUTE';
        var ecolor = EC[ekind] || '#60a5fa';
        var arrWrap = document.createElement('div');
        arrWrap.className = 'arrow-wrap';
        arrWrap.innerHTML = '<div class="arr-line" style="background:' + ecolor + '"></div>' +
          '<div class="arr-kind" style="color:' + ecolor + '">' + ekind.split('_').pop() + '</div>';
        stepsRow.appendChild(arrWrap);
      }
    });

    wf.appendChild(stepsRow);
    container.appendChild(wf);
  });
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// A3 — Mock pruning (side-by-side verdict cards + table)
// ---------------------------------------------------------------------------

export function generateA3PruningHtml(data: VizData): string {
  const title = 'A3 Mock Pruning \u2014 ' + data.generatedFromProject;
  const palette = computePalette(data);
  const nodeColorsJson = JSON.stringify(palette.nodeKindColors);
  const edgeColorsJson = JSON.stringify(palette.edgeKindColors);
  const subtypeColorsJson = JSON.stringify(palette.widgetSubtypeColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${SHARED_CSS}
  .page { padding: 0 20px 32px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 28px; }
  @media (max-width: 700px) { .pair { grid-template-columns: 1fr; } }
  .wf-card { border-radius: 10px; padding: 14px; border: 1.5px solid; }
  .wf-card.feasible { background: #0e1f12; border-color: #16a34a; }
  .wf-card.conditional { background: #1a1608; border-color: #854d0e; }
  .wf-card.pruned { background: #1f0e0e; border-color: #7f1d1d; }
  .verdict-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 5px; margin-bottom: 12px; font-size: 12px; font-weight: 600; }
  .verdict-bar.ok { background: #166534; color: #bbf7d0; }
  .verdict-bar.warn { background: #78350f; color: #fde68a; }
  .verdict-bar.fail { background: #7f1d1d; color: #fecaca; }
  .wf-title { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
  .steps-v { display: flex; flex-direction: column; gap: 0; }
  .sv-row { display: flex; align-items: center; }
  .sv-block { flex: 1; border-radius: 5px; padding: 6px 8px; margin: 2px 0; }
  .sv-type { font-size: 8px; text-transform: uppercase; color: #64748b; }
  .sv-label { font-size: 11px; font-weight: 600; }
  .sv-c { font-size: 9px; margin-top: 2px; }
  .c-new { display: inline-block; background: #1e3a5f; border: 1px solid #3b82f6; border-radius: 3px; padding: 0 4px; color: #93c5fd; margin: 1px; }
  .c-bad { display: inline-block; background: #3b1515; border: 1px solid #ef4444; border-radius: 3px; padding: 0 4px; color: #fca5a5; margin: 1px; }
  .c-acc { display: inline-block; background: #1e2a4a; border-radius: 3px; padding: 0 4px; color: #7c85f0; margin: 1px; }
  .arr-v { width: 2px; height: 14px; margin: 0 auto; }
  .arr-lbl { font-size: 8px; color: #475569; text-align: center; }
  .sv-side { width: 14px; }
  .cw-box { background: #1e2438; border-radius: 6px; padding: 8px 10px; margin-top: 10px; font-size: 10px; }
  .cw-title { color: #7c85f0; font-weight: 600; margin-bottom: 4px; }
  .crow { display: flex; gap: 6px; margin: 2px 0; }
  .ck { color: #64748b; min-width: 120px; }
  .cv { color: #e2e8f0; }
  .cv.ok { color: #4ade80; }
  .cv.bad { color: #f87171; }
  .cv.warn { color: #fbbf24; }
  .prune-box { background: #250a0a; border: 1px solid #7f1d1d; border-radius: 5px; padding: 7px 9px; margin-top: 8px; font-size: 10px; color: #fca5a5; }
  .prune-box strong { color: #f87171; }
  .cond-box { background: #1a1200; border: 1px solid #854d0e; border-radius: 5px; padding: 7px 9px; margin-top: 8px; font-size: 10px; color: #fde68a; }
  .cond-box strong { color: #facc15; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1e2438; padding: 7px 10px; text-align: left; border-bottom: 1px solid #2d3148; color: #94a3b8; font-size: 10px; text-transform: uppercase; }
  td { padding: 7px 10px; border-bottom: 1px solid #1a2030; }
  .vf { color: #4ade80; font-weight: 600; }
  .vc { color: #fbbf24; font-weight: 600; }
  .vp { color: #f87171; font-weight: 600; }
  .empty { color: #475569; font-size: 12px; padding: 20px; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <span>${data.stats.feasible} feasible &bull; ${data.stats.conditional} conditional &bull; ${data.stats.pruned} pruned</span>
</header>
<div class="note">
  <strong>Note:</strong> A3 demo policy (visualization only, no SAT): <code>authRequired=true</code> \u2192 PRUNED &bull;
  <code>requiredParams &gt; 0</code> \u2192 CONDITIONAL &bull; otherwise FEASIBLE.
  C(W) = union of constraint surfaces along each path.
</div>
<div class="page">
  <div id="pairs-container"></div>
  <h2>All Exemplar Paths \u2014 Pruning Decision Table</h2>
  <div id="table-container"></div>
</div>
<script src="./data.js"></script>
<script>
(function() {
  var NC = ${nodeColorsJson};
  var EC = ${edgeColorsJson};
  var SC = ${subtypeColorsJson};
  function nodeColor(n) { if (n.type === 'Widget' && n.subtypeKey && SC[n.subtypeKey]) return SC[n.subtypeKey]; return NC[n.type] || '#aaa'; }

  var nodeById = {};
  VIZ_DATA.nodes.forEach(function(n) { nodeById[n.id] = n; });
  var edgeById = {};
  VIZ_DATA.edges.forEach(function(e) { edgeById[e.id] = e; });

  var paths = VIZ_DATA.exemplarPaths;
  var pairsContainer = document.getElementById('pairs-container');
  var tableContainer = document.getElementById('table-container');

  if (!paths.length) {
    pairsContainer.innerHTML = '<div class="empty">No exemplar paths found.</div>';
    return;
  }

  // ── Build pairs ────────────────────────────────────────────────────────────
  function firstOfVerdict(v) {
    return paths.find(function(p) { return p.verdict === v; }) || null;
  }

  function renderCard(path) {
    var v = path.verdict;
    var vClass = v === 'FEASIBLE' ? 'feasible' : v === 'CONDITIONAL' ? 'conditional' : 'pruned';
    var vBarClass = v === 'FEASIBLE' ? 'ok' : v === 'CONDITIONAL' ? 'warn' : 'fail';
    var vIcon = v === 'FEASIBLE' ? '\u2713' : v === 'CONDITIONAL' ? '\u26a0' : '\u2717';
    var vLabel = v === 'FEASIBLE' ? 'FEASIBLE' : v === 'CONDITIONAL' ? 'CONDITIONAL \u2014 params required' : 'PRUNED \u2014 auth blocked';

    var card = document.createElement('div');
    card.className = 'wf-card ' + vClass;

    var termNode = nodeById[path.steps.length ? path.steps[path.steps.length - 1].nodeId : ''];
    var termLabel = termNode ? termNode.label : '?';

    card.innerHTML = '<div class="verdict-bar ' + vBarClass + '"><span style="font-size:16px">' + vIcon + '</span>' + vLabel + '</div>' +
      '<div class="wf-title">' + path.entryNodeId.split('@')[0] + ' \u2192 \u2026 \u2192 ' + termLabel + '</div>';

    var stepsV = document.createElement('div');
    stepsV.className = 'steps-v';

    path.steps.forEach(function(step, si) {
      var node = nodeById[step.nodeId];
      if (!node) return;
      var color = nodeColor(node);
      var cs = step.constraintsSoFar;
      var prevCs = si > 0 && path.steps[si - 1] ? path.steps[si - 1].constraintsSoFar : { requiredParams: [], authRequired: false, uiPreconditions: [] };

      var isPrunedStep = v !== 'FEASIBLE' && si === path.steps.length - 1;

      var block = document.createElement('div');
      block.className = 'sv-block';
      block.style.background = color + '15';
      block.style.border = '1px solid ' + color + (isPrunedStep ? '; opacity:0.4' : '');

      // New constraints at this step
      var newParams = cs.requiredParams.filter(function(p) { return !(prevCs.requiredParams || []).includes(p); });
      var newAuth = cs.authRequired && !prevCs.authRequired;

      var cHtml = '';
      newParams.forEach(function(p) { cHtml += '<span class="c-new">:' + p + '</span>'; });
      if (newAuth) cHtml += '<span class="c-bad">auth required</span>';
      if (cs.requiredParams.length && !newParams.length && !newAuth) {
        cs.requiredParams.forEach(function(p) { cHtml += '<span class="c-acc">:' + p + '</span>'; });
      }
      if (cs.authRequired && !newAuth) cHtml += '<span class="c-acc">auth</span>';

      block.innerHTML = '<div class="sv-type">' + node.type + '</div>' +
        '<div class="sv-label" style="color:' + color + '">' + node.label + '</div>' +
        (cHtml ? '<div class="sv-c">' + cHtml + '</div>' : '');

      var row = document.createElement('div');
      row.className = 'sv-row';
      row.appendChild(block);
      stepsV.appendChild(row);

      if (si < path.steps.length - 1) {
        var nextStep = path.steps[si + 1];
        var edge = nextStep && nextStep.edgeId ? edgeById[nextStep.edgeId] : null;
        var ekind = edge ? edge.kind : 'WIDGET_NAVIGATES_ROUTE';
        var ecolor = EC[ekind] || '#60a5fa';
        var arrRow = document.createElement('div');
        arrRow.innerHTML = '<div class="arr-v" style="background:' + ecolor + ';margin-left:20px"></div>' +
          '<div class="arr-lbl" style="margin-left:0">' + ekind.split('_').pop() + '</div>';
        stepsV.appendChild(arrRow);
      }
    });

    card.appendChild(stepsV);

    // C(W) box
    var agg = path.aggregated;
    var cwHtml = '<div class="cw-box"><div class="cw-title">C(W) \u2014 Aggregated Constraints</div>' +
      '<div class="crow"><span class="ck">authRequired:</span><span class="cv ' + (agg.authRequired ? 'bad' : 'ok') + '">' + agg.authRequired + '</span></div>' +
      '<div class="crow"><span class="ck">requiredParams:</span><span class="cv ' + (agg.requiredParams.length ? 'warn' : 'ok') + '">' + (agg.requiredParams.length ? '[' + agg.requiredParams.join(', ') + ']' : '[]') + '</span></div>' +
      '<div class="crow"><span class="ck">rolesRequired:</span><span class="cv">' + (agg.rolesRequired.length ? '[' + agg.rolesRequired.join(', ') + ']' : '[]') + '</span></div>' +
      '<div class="crow"><span class="ck">uiPreconditions:</span><span class="cv">' + agg.uiPreconditions.length + ' predicates</span></div>' +
      '<div class="crow"><span class="ck">SAT result:</span><span class="cv ' + (v === 'FEASIBLE' ? 'ok' : v === 'CONDITIONAL' ? 'warn' : 'bad') + '">' + (v === 'FEASIBLE' ? 'SATISFIABLE \u2713' : v === 'CONDITIONAL' ? 'CONDITIONAL \u26a0' : 'UNSATISFIABLE \u2717') + '</span></div>' +
      '</div>';
    card.innerHTML += cwHtml;

    if (path.pruneReason) {
      var box = document.createElement('div');
      box.className = v === 'PRUNED' ? 'prune-box' : 'cond-box';
      box.innerHTML = '<strong>' + (v === 'PRUNED' ? 'Prune reason: ' : 'Condition: ') + '</strong>' + path.pruneReason;
      card.appendChild(box);
    }

    return card;
  }

  // Find pairs for side-by-side display
  var showPairs = [
    ['FEASIBLE', firstOfVerdict('PRUNED') ? 'PRUNED' : 'CONDITIONAL'],
    ['FEASIBLE', 'CONDITIONAL'],
  ];
  var renderedPairs = 0;
  for (var pi = 0; pi < showPairs.length && renderedPairs < 2; pi++) {
    var leftVerdict = showPairs[pi][0];
    var rightVerdict = showPairs[pi][1];
    var leftPath = firstOfVerdict(leftVerdict);
    var rightPath = firstOfVerdict(rightVerdict);
    if (!leftPath || !rightPath || leftPath === rightPath) continue;
    var pair = document.createElement('div');
    pair.className = 'pair';
    var h2 = document.createElement('h2');
    h2.style.gridColumn = '1/-1';
    h2.textContent = leftVerdict + ' vs. ' + rightVerdict;
    var leftCard = renderCard(leftPath);
    var rightCard = renderCard(rightPath);
    if (!leftCard || !rightCard) continue;
    pairsContainer.appendChild(h2);
    pair.appendChild(leftCard);
    pair.appendChild(rightCard);
    pairsContainer.appendChild(pair);
    renderedPairs++;
  }
  // If nothing to compare, show all paths
  if (!renderedPairs) {
    paths.slice(0, 3).forEach(function(p) {
      var card = renderCard(p);
      if (card) pairsContainer.appendChild(card);
    });
  }

  // ── Decision table ─────────────────────────────────────────────────────────
  var tbl = document.createElement('table');
  tbl.innerHTML = '<thead><tr><th>Path</th><th>Steps</th><th>authRequired</th><th>requiredParams</th><th>uiPreconditions</th><th>Verdict</th></tr></thead>';
  var tbody = document.createElement('tbody');
  paths.forEach(function(p, i) {
    var agg = p.aggregated;
    var vCls = p.verdict === 'FEASIBLE' ? 'vf' : p.verdict === 'CONDITIONAL' ? 'vc' : 'vp';
    var termNode = nodeById[p.steps.length ? p.steps[p.steps.length - 1].nodeId : ''];
    var termLabel = termNode ? termNode.label : '?';
    var tr = document.createElement('tr');
    tr.innerHTML = '<td style="color:#c4b5fd">W' + (i + 1) + '</td>' +
      '<td style="color:#94a3b8">' + p.entryNodeId.split('@')[0] + ' \u2192 ' + termLabel + '</td>' +
      '<td class="' + (agg.authRequired ? 'vp' : 'vf') + '">' + agg.authRequired + '</td>' +
      '<td class="' + (agg.requiredParams.length ? 'vc' : 'vf') + '">' + (agg.requiredParams.join(', ') || '\u2014') + '</td>' +
      '<td>' + agg.uiPreconditions.length + '</td>' +
      '<td class="' + vCls + '">' + p.verdict + '</td>';
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  tableContainer.appendChild(tbl);
})();
</script>
</body>
</html>`;
}
