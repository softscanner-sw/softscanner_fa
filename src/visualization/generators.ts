/**
 * generators.ts
 * HTML generator functions — each returns a complete self-contained HTML document.
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
// A2 Task Workflows — single-trigger task visualization
// ---------------------------------------------------------------------------

export function generateA2TaskWorkflowsHtml(data: VizData, taskJson: string): string {
  const title = 'A2 Task Workflows \u2014 ' + data.generatedFromProject;
  const palette = computePalette(data);
  const edgeColorsJson = JSON.stringify(palette.edgeKindColors);
  const nodeColorsJson = JSON.stringify(palette.nodeKindColors);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
${SHARED_CSS}
  .page { padding: 0 20px 32px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 20px; align-items: center; border-bottom: 1px solid #1e2438; }
  .toolbar input { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 5px; padding: 6px 10px; color: #e2e8f0; font-size: 12px; width: 300px; }
  .toolbar select { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 5px; padding: 6px 8px; color: #e2e8f0; font-size: 11px; }
  .toolbar .count { font-size: 11px; color: #64748b; }
  .toolbar button { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 5px; padding: 6px 10px; color: #94a3b8; font-size: 11px; cursor: pointer; }
  .toolbar button.active { background: #2d3a6a; border-color: #7c85f0; color: #c4b5fd; }
  .pagination { display: flex; align-items: center; gap: 8px; padding: 8px 20px; border-bottom: 1px solid #1e2438; }
  .pagination button { background: #1a1d2e; border: 1px solid #2d3148; color: #94a3b8; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
  .pagination button:disabled { opacity: 0.4; cursor: default; }
  .pagination .page-info { font-size: 11px; color: #64748b; }
  .workflow { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .wf-title { font-size: 12px; font-weight: 600; color: #c4b5fd; margin-bottom: 4px; }
  .wf-meta { font-size: 10px; color: #64748b; margin-bottom: 8px; }
  .wf-meta .warn { color: #fbbf24; }
  .wf-meta .err { color: #f87171; }
  .wf-routes { font-size: 10px; color: #94a3b8; margin-bottom: 6px; }
  .wf-routes .route-tag { background: #1e2438; border: 1px solid #2d3148; border-radius: 4px; padding: 1px 6px; font-size: 9px; margin-right: 4px; display: inline-block; margin-bottom: 2px; }
  .step { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 0; border-bottom: 1px solid #151825; font-size: 11px; }
  .step:last-child { border-bottom: none; }
  .step-num { color: #475569; font-size: 9px; min-width: 16px; text-align: right; flex-shrink: 0; }
  .step-chip { border-radius: 4px; padding: 2px 6px; font-size: 9px; font-weight: 600; flex-shrink: 0; }
  .step-badge { padding: 1px 5px; border-radius: 3px; font-size: 8px; font-weight: 700; flex-shrink: 0; }
  .step-badge.system { background: #7c3aed22; color: #a78bfa; border: 1px solid #7c3aed; }
  .step-badge.trigger { background: #06b6d422; color: #67e8f9; border: 1px solid #06b6d4; }
  .step-badge.effect { background: #8b5cf622; color: #c4b5fd; border: 1px solid #8b5cf6; }
  .step-from, .step-to { color: #e2e8f0; }
  .step-kind { color: #64748b; font-size: 9px; }
  .step-arrow { color: #475569; flex-shrink: 0; }
  .step-to.unresolved { color: #fbbf24; font-style: italic; }
  .step-detail { font-size: 9px; color: #94a3b8; padding-left: 22px; width: 100%; }
  .empty { color: #475569; font-size: 12px; padding: 20px; }
  .sig-strip { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 20px; border-bottom: 1px solid #1e2438; }
  .sig-tag { background: #1a1d2e; border: 1px solid #2d3148; border-radius: 5px; padding: 3px 8px; font-size: 10px; color: #94a3b8; cursor: pointer; }
  .sig-tag:hover { border-color: #7c85f0; }
  .sig-tag .sig-n { color: #c4b5fd; font-weight: 600; }
  .sig-group { margin-bottom: 16px; }
  .sig-header { background: #1e2438; border: 1px solid #2d3148; border-radius: 8px; padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .sig-header:hover { border-color: #7c85f0; }
  .sig-title { font-size: 11px; color: #7c85f0; font-weight: 600; flex: 1; }
  .sig-count { font-size: 10px; color: #64748b; }
  .verdict { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; margin-right: 6px; }
  .verdict.FEASIBLE { background: #16a34a22; color: #4ade80; border: 1px solid #16a34a; }
  .verdict.CONDITIONAL { background: #d9770622; color: #fbbf24; border: 1px solid #d97706; }
  .verdict.PRUNED { background: #dc262622; color: #f87171; border: 1px solid #dc2626; }
  .wf-explanation { font-size: 9px; color: #94a3b8; padding: 4px 0; }
  .term-cause { font-size: 10px; color: #94a3b8; font-weight: 400; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
</header>
<div class="note">
  <strong>Phase A2 \u2014 Task Mode</strong>: Single-trigger TaskWorkflows.
  Each task represents one user trigger edge with its deterministic handler-scoped effect closure
  (CCS by callsiteOrdinal + CNR + redirect closure). Task count equals trigger edge count exactly.
</div>
<div class="stat-strip" id="stats"></div>
<div class="toolbar">
  <input id="search" placeholder="Filter by edge kind, route ID, handler, or workflow ID..." />
  <select id="filter-meta">
    <option value="">All workflows</option>
    <option value="feasible">FEASIBLE</option>
    <option value="conditional">CONDITIONAL</option>
    <option value="pruned">PRUNED</option>
    <option value="unresolved">Has unresolved targets</option>
    <option value="redirect-loop">Has redirect loop</option>
  </select>
  <select id="page-size">
    <option value="50">50/page</option>
    <option value="100" selected>100/page</option>
    <option value="200">200/page</option>
  </select>
  <button id="sig-toggle">Group by step pattern</button>
  <span class="count" id="count"></span>
</div>
<div id="sig-strip-container"></div>
<div class="pagination" id="pagination"></div>
<div class="page">
  <div id="wf-container"></div>
</div>
<script src="./data.js"></script>
<script>
var TASK_DATA = ${taskJson};
</script>
<script>
(function() {
  var EC = ${edgeColorsJson};
  var NC = ${nodeColorsJson};

  var edgeById = {};
  VIZ_DATA.edges.forEach(function(e) { edgeById[e.id] = e; });

  var nodeById = {};
  VIZ_DATA.nodes.forEach(function(n) { nodeById[n.id] = n; });

  // Stats strip
  var s = TASK_DATA.stats || {};
  var statsEl = document.getElementById('stats');
  function sc(n, l) { return '<div class="stat-card"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
  if (s.workflowCount !== undefined) {
    statsEl.innerHTML =
      sc(s.workflowCount, 'Task workflows') +
      sc(s.feasibleCount, 'Feasible') +
      sc(s.conditionalCount, 'Conditional') +
      sc(s.prunedCount, 'Pruned') +
      sc(s.triggerEdgeCount, 'Trigger edges') +
      sc(s.enumeratedRouteCount, 'Enumerated routes');
  }

  // State
  var currentPage = 0;
  var pageSize = 100;
  var groupBySig = false;
  var filteredWorkflows = [];

  var container = document.getElementById('wf-container');
  var countEl = document.getElementById('count');
  var searchEl = document.getElementById('search');
  var filterEl = document.getElementById('filter-meta');
  var pageSizeEl = document.getElementById('page-size');
  var sigToggle = document.getElementById('sig-toggle');
  var paginationEl = document.getElementById('pagination');
  var sigStripEl = document.getElementById('sig-strip-container');

  var workflows = (TASK_DATA.workflows || []);

  // \\u2500\\u2500 Filtering \\u2500\\u2500
  function getFiltered() {
    var q = searchEl.value.toLowerCase();
    var mf = filterEl.value;
    var result = [];
    for (var i = 0; i < workflows.length; i++) {
      var w = workflows[i];
      if (mf === 'feasible' && w.verdict !== 'FEASIBLE') continue;
      if (mf === 'conditional' && w.verdict !== 'CONDITIONAL') continue;
      if (mf === 'pruned' && w.verdict !== 'PRUNED') continue;
      if (mf === 'unresolved' && !(w.meta.unresolvedTargets && w.meta.unresolvedTargets.length)) continue;
      if (mf === 'redirect-loop' && !w.meta.redirectLoop) continue;
      if (q) {
        var text = w.id + ' ' + w.startRouteIds.join(' ') + ' ' + w.terminalNodeId + ' ' + (w.effectGroupId || '');
        for (var si = 0; si < w.steps.length; si++) {
          text += ' ' + w.steps[si].edgeId + ' ' + w.steps[si].kind;
        }
        if (text.toLowerCase().indexOf(q) === -1) continue;
      }
      result.push(w);
    }
    return result;
  }

  // \\u2500\\u2500 Signature (step pattern) \\u2500\\u2500
  function computeSignature(w) {
    var parts = [];
    for (var i = 0; i < w.steps.length; i++) {
      parts.push(w.steps[i].kind);
    }
    var term = nodeById[w.terminalNodeId];
    parts.push(term ? term.type : '?');
    return parts.join(' > ');
  }

  function groupBySignature(wfs) {
    var groups = {};
    var order = [];
    for (var i = 0; i < wfs.length; i++) {
      var sig = computeSignature(wfs[i]);
      if (!groups[sig]) { groups[sig] = []; order.push(sig); }
      groups[sig].push(wfs[i]);
    }
    order.sort(function(a, b) {
      if (groups[b].length !== groups[a].length) return groups[b].length - groups[a].length;
      return a.localeCompare(b);
    });
    return { groups: groups, order: order };
  }

  // \\u2500\\u2500 Step rendering \\u2500\\u2500
  function renderStep(step, index) {
    var edge = edgeById[step.edgeId];
    if (!edge) return '<div class="step"><span class="step-num">' + (index + 1) + '</span><span style="color:#f87171">Unknown edge: ' + step.edgeId.substring(0, 40) + '...</span></div>';

    var fromNode = nodeById[edge.from];
    var toNode = edge.to ? nodeById[edge.to] : null;
    var kind = edge.kind;
    var color = EC[kind] || '#888';

    var html = '<div class="step">';
    html += '<span class="step-num">' + (index + 1) + '</span>';
    html += '<span class="step-chip" style="background:' + color + '22;border:1px solid ' + color + ';color:' + color + '">' + kind + '</span>';

    if (edge.isSystem) html += '<span class="step-badge system">SYSTEM</span>';
    if (index === 0) {
      html += '<span class="step-badge trigger">TRIGGER</span>';
      // Show widget tag/kind on trigger step
      if (fromNode && fromNode.tagName) {
        var wLabel = fromNode.tagName;
        if (fromNode.widgetKind && fromNode.widgetKind !== 'Unknown') wLabel += ' (' + fromNode.widgetKind + ')';
        html += '<span style="font-size:9px;color:#67e8f9;margin-left:2px">' + escHtml(wLabel) + '</span>';
      }
    }
    else if (kind === 'COMPONENT_CALLS_SERVICE' || kind === 'COMPONENT_NAVIGATES_ROUTE') html += '<span class="step-badge effect">EFFECT</span>';

    // From node
    var fromLabel = fromNode ? fromNode.label : edge.from.split('#').pop().split('|')[0];
    var fromKind = fromNode ? fromNode.type : '?';
    html += '<span class="step-from">' + escHtml(fromLabel) + ' <span class="step-kind">(' + fromKind + ')</span></span>';

    html += '<span class="step-arrow">\\u2192</span>';

    // To node
    if (toNode) {
      var toLabel = toNode.label;
      html += '<span class="step-to">' + escHtml(toLabel) + ' <span class="step-kind">(' + toNode.type + ')</span></span>';
    } else if (edge.to === null) {
      var tt = edge.targetText || 'unknown target';
      html += '<span class="step-to unresolved">UNRESOLVED: ' + escHtml(tt) + '</span>';
    }

    html += '</div>';

    // Detail line
    var details = [];
    if (edge.handler) details.push('handler: ' + escHtml(edge.handler.componentId.split('#').pop() + '.' + edge.handler.methodName));
    if (edge.trigger) {
      var trigParts = [];
      if (edge.trigger.viaRouterLink) trigParts.push('routerLink');
      else if (edge.trigger.event && edge.trigger.event !== 'unknown') trigParts.push(edge.trigger.event);
      if (trigParts.length) details.push('trigger: ' + trigParts.join(', '));
    }
    if (details.length) {
      html += '<div class="step-detail">' + details.join(' | ') + '</div>';
    }

    return html;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // \\u2500\\u2500 Workflow card \\u2500\\u2500
  function deriveTerminationCause(w, termNode) {
    if (w.meta.redirectLoop) return 'redirect loop';
    if (w.meta.unresolvedTargets && w.meta.unresolvedTargets.length) return 'unresolved nav';
    if (termNode && termNode.type === 'External') return 'external navigation';
    if (w.steps.length === 1) return 'trigger only (no effects)';
    return 'effect closure complete';
  }

  function shortId(id) {
    // Show last meaningful segment of a long ID
    var parts = id.split('::');
    if (parts.length > 1) return parts[parts.length - 2].split('#').pop().split('|').pop() + '::' + parts[parts.length - 1];
    return id.length > 60 ? '...' + id.slice(-50) : id;
  }

  function renderWorkflowCard(w) {
    var termNode = nodeById[w.terminalNodeId];
    var termLabel = termNode ? termNode.label : w.terminalNodeId;
    var termCause = deriveTerminationCause(w, termNode);

    // Trigger edge label
    var trigEdge = edgeById[w.triggerEdgeId];
    var trigLabel = trigEdge ? (trigEdge.kind + ' from ' + escHtml((nodeById[trigEdge.from] || {}).label || trigEdge.from.split('#').pop().split('|')[0])) : shortId(w.triggerEdgeId);

    var html = '<div class="workflow">';
    html += '<div class="wf-title">' + escHtml(trigLabel) + ' \\u2192 END: ' + escHtml(termLabel) + ' <span class="term-cause">(' + escHtml(termCause) + ')</span></div>';

    // Verdict badge
    if (w.verdict) {
      html += '<span class="verdict ' + w.verdict + '">' + w.verdict + '</span>';
    }

    var metaText = w.steps.length + ' steps';
    if (w.effectGroupId) {
      var eg = w.effectGroupId.split('::');
      metaText += ' \\u00b7 handler: ' + escHtml(eg[eg.length - 1] || w.effectGroupId);
    }
    if (w.meta.unresolvedTargets && w.meta.unresolvedTargets.length) metaText += ' \\u00b7 <span class="warn">unresolved: ' + w.meta.unresolvedTargets.length + '</span>';
    if (w.meta.redirectLoop) metaText += ' \\u00b7 <span class="err">redirect loop at ' + escHtml(w.meta.redirectLoop.routeId) + '</span>';
    if (w.meta.redirectClosureStabilized === false) metaText += ' \\u00b7 <span class="err">unstabilized</span>';
    html += '<div class="wf-meta">' + metaText + '</div>';

    // Entry routes
    html += '<div class="wf-routes">Entry routes: ';
    for (var ri = 0; ri < w.startRouteIds.length; ri++) {
      var rNode = nodeById[w.startRouteIds[ri]];
      var rLabel = rNode ? rNode.label : w.startRouteIds[ri];
      html += '<span class="route-tag">' + escHtml(rLabel) + '</span>';
    }
    html += '</div>';

    // Explanation
    if (w.explanation) {
      var expParts = [];
      if (w.explanation.missingParams && w.explanation.missingParams.length) expParts.push('params: ' + w.explanation.missingParams.join(', '));
      if (w.explanation.requiredGuards && w.explanation.requiredGuards.length) expParts.push('guards: ' + w.explanation.requiredGuards.join(', '));
      if (w.explanation.requiredRoles && w.explanation.requiredRoles.length) expParts.push('roles: ' + w.explanation.requiredRoles.join(', '));
      if (w.explanation.requiresFormValid) expParts.push('requires form valid');
      if (w.explanation.uiGates && w.explanation.uiGates.length) {
        var gateStr = w.explanation.uiGates.map(function(g) { return g.kind + ': ' + g.args.join(', '); }).join('; ');
        expParts.push('UI gates: ' + gateStr);
      }
      if (w.explanation.contradictions && w.explanation.contradictions.length) {
        var cStr = w.explanation.contradictions.map(function(c) { return c.kind + ': ' + c.args.join(', '); }).join('; ');
        expParts.push('contradictions: ' + cStr);
      }
      if (expParts.length) html += '<div class="wf-explanation">' + escHtml(expParts.join(' | ')) + '</div>';
    }

    // Steps
    for (var si = 0; si < w.steps.length; si++) {
      html += renderStep(w.steps[si], si);
    }

    html += '</div>';
    return html;
  }

  // \\u2500\\u2500 Pagination \\u2500\\u2500
  function renderPagination(total) {
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    var start = currentPage * pageSize + 1;
    var end = Math.min((currentPage + 1) * pageSize, total);

    var html = '';
    html += '<button id="pg-prev"' + (currentPage === 0 ? ' disabled' : '') + '>Prev</button>';
    html += '<span class="page-info">Showing ' + (total > 0 ? start + '-' + end : '0') + ' of ' + total + ' (page ' + (currentPage + 1) + ' of ' + totalPages + ')</span>';
    html += '<button id="pg-next"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Next</button>';
    paginationEl.innerHTML = html;

    var prev = document.getElementById('pg-prev');
    var next = document.getElementById('pg-next');
    if (prev) prev.onclick = function() { if (currentPage > 0) { currentPage--; render(); } };
    if (next) next.onclick = function() { if (currentPage < totalPages - 1) { currentPage++; render(); } };
  }

  // \\u2500\\u2500 Signature strip \\u2500\\u2500
  function renderSigStrip(sigData) {
    if (!groupBySig || sigData.order.length === 0) {
      sigStripEl.innerHTML = '';
      return;
    }
    var html = '<div class="sig-strip">';
    var top = sigData.order.slice(0, 10);
    for (var i = 0; i < top.length; i++) {
      var sig = top[i];
      var cnt = sigData.groups[sig].length;
      var short = sig.split(' > ').map(function(s) { return s.split('_').pop(); }).join(' > ');
      html += '<span class="sig-tag" data-sig="' + escHtml(sig) + '"><span class="sig-n">' + cnt + '</span> ' + escHtml(short) + '</span>';
    }
    if (sigData.order.length > 10) html += '<span class="sig-tag" style="color:#475569">' + (sigData.order.length - 10) + ' more...</span>';
    html += '</div>';
    sigStripEl.innerHTML = html;

    var tags = sigStripEl.querySelectorAll('.sig-tag[data-sig]');
    for (var t = 0; t < tags.length; t++) {
      tags[t].addEventListener('click', function(ev) {
        var sig = ev.currentTarget.getAttribute('data-sig');
        searchEl.value = sig.split(' > ')[0];
        currentPage = 0;
        render();
      });
    }
  }

  // \\u2500\\u2500 Grouped rendering \\u2500\\u2500
  function renderGrouped(sigData) {
    var html = '';
    var pageStart = currentPage * pageSize;
    var pageEnd = pageStart + pageSize;
    var itemIndex = 0;

    for (var gi = 0; gi < sigData.order.length; gi++) {
      var sig = sigData.order[gi];
      var wfs = sigData.groups[sig];
      if (itemIndex + wfs.length <= pageStart) { itemIndex += wfs.length; continue; }
      if (itemIndex >= pageEnd) break;

      var short = sig.split(' > ').map(function(s) { return s.split('_').pop(); }).join(' > ');
      var groupId = 'sig-group-' + gi;
      html += '<div class="sig-group" id="' + groupId + '">';
      html += '<div class="sig-header" data-group="' + groupId + '">';
      html += '<span class="sig-title">' + escHtml(short) + '</span>';
      html += '<span class="sig-count">' + wfs.length + ' task' + (wfs.length > 1 ? 's' : '') + '</span>';
      html += '</div>';

      html += renderWorkflowCard(wfs[0]);
      if (wfs.length > 1) {
        html += '<div class="sig-expand" data-group="' + groupId + '-rest">Show all ' + wfs.length + ' tasks</div>';
        html += '<div id="' + groupId + '-rest" style="display:none">';
        var limit = Math.min(wfs.length, 50);
        for (var wi = 1; wi < limit; wi++) {
          html += renderWorkflowCard(wfs[wi]);
        }
        if (wfs.length > 50) html += '<div class="empty">' + (wfs.length - 50) + ' more tasks not shown.</div>';
        html += '</div>';
      }
      html += '</div>';
      itemIndex += wfs.length;
    }

    container.innerHTML = html || '<div class="empty">No task workflows match the filter.</div>';

    var expands = container.querySelectorAll('.sig-expand');
    for (var ei = 0; ei < expands.length; ei++) {
      expands[ei].addEventListener('click', function(ev) {
        var targetId = ev.currentTarget.getAttribute('data-group');
        var el = document.getElementById(targetId);
        if (el) {
          var show = el.style.display === 'none';
          el.style.display = show ? 'block' : 'none';
          ev.currentTarget.textContent = show ? 'Collapse' : 'Show all';
        }
      });
    }
  }

  // \\u2500\\u2500 Flat rendering \\u2500\\u2500
  function renderFlat() {
    var start = currentPage * pageSize;
    var end = Math.min(start + pageSize, filteredWorkflows.length);
    var html = '';
    for (var i = start; i < end; i++) {
      html += renderWorkflowCard(filteredWorkflows[i]);
    }
    container.innerHTML = html || '<div class="empty">No task workflows match the filter.</div>';
  }

  // \\u2500\\u2500 Main render \\u2500\\u2500
  function render() {
    filteredWorkflows = getFiltered();
    countEl.textContent = filteredWorkflows.length + ' of ' + workflows.length + ' task workflows';

    if (groupBySig) {
      var sigData = groupBySignature(filteredWorkflows);
      renderSigStrip(sigData);
      renderPagination(filteredWorkflows.length);
      renderGrouped(sigData);
    } else {
      sigStripEl.innerHTML = '';
      renderPagination(filteredWorkflows.length);
      renderFlat();
    }
  }

  // \\u2500\\u2500 Event wiring \\u2500\\u2500
  searchEl.addEventListener('input', function() { currentPage = 0; render(); });
  filterEl.addEventListener('change', function() { currentPage = 0; render(); });
  pageSizeEl.addEventListener('change', function() { pageSize = parseInt(pageSizeEl.value, 10); currentPage = 0; render(); });
  sigToggle.addEventListener('click', function() {
    groupBySig = !groupBySig;
    sigToggle.className = groupBySig ? 'active' : '';
    currentPage = 0;
    render();
  });

  render();
})();
</script>
</body>
</html>`;
}

