'use strict';
/* ═══════════════════════════════════════════════════════════════
   IRS DASHBOARD  ·  dashboard.js
   3-Cluster: Steady Converters / Hesitant Browsers / Nudge-Responsive Impulsives
   Rules enforced:
   - No emojis anywhere
   - "ML Score" replaced with "Impulse Score" throughout
   - All chart content strictly inside container boundaries
   - No textposition:'outside' on any chart element
   - Pie charts: percent inside only, legend below in margin
   - Bar charts: no floating text labels, hover tooltips only
   - Scatter: markers only, region name shown on hover only
   - All charts explicitly sized to pixel dimensions of container
═══════════════════════════════════════════════════════════════ */

let DT = { session: null, user: null, stock: null, region: null };
let activeLocation = '';

/* ── Colour palette ──────────────────────────────────────────── */
const C = {
  blue:    '#3498db',
  navy:    '#2c3e50',
  green:   '#27ae60',
  orange:  '#f39c12',
  red:     '#e74c3c',
  cluster: ['#27ae60', '#3498db', '#e74c3c'],
  pie8:    ['#3498db','#27ae60','#f39c12','#e74c3c','#9b59b6','#1abc9c','#e67e22','#34495e']
};

/* ── Cluster metadata ────────────────────────────────────────── */
const CL = {
  0: {
    name: 'Steady Converters', col: '#27ae60', thresh: 0.52,
    size: '~32K sessions — 33% of total',
    goal: 'Increase basket size (AOV), not conversion',
    lift: '+15% AOV', cost: 'Low',
    desc: 'Reliable buyers who purchase frequently without nudging. Focus on volume upsell, not pressure tactics.',
    do_tags:   [['tag-loyalty','Bundles'], ['tag-loyalty','Loyalty Rewards'], ['tag-reco','Subscribe & Save']],
    dont_tags: [['tag-no','No Scarcity'], ['tag-no','No FOMO']],
    tactics: [
      { t: 'Bundle offers',         ex: 'Add milk to your bread — save 10%' },
      { t: 'Loyalty rewards',       ex: '3rd coffee free — buy now' },
      { t: 'Subscribe & Save',      ex: 'Monthly delivery deal' },
      { t: 'Avoid scarcity nudges', ex: 'No pressure needed for this segment' }
    ]
  },
  1: {
    name: 'Hesitant Browsers', col: '#3498db', thresh: 0.17,
    size: '~31K sessions — 32% of total',
    goal: 'Convert browsers to buyers',
    lift: '+8% conversion rate', cost: 'Medium',
    desc: 'Window shoppers who abandon carts. Price sensitivity is the barrier — use discounts and abandonment recovery.',
    do_tags:   [['tag-promo','Price Drops'], ['tag-promo','Free Shipping'], ['tag-fomo','Abandonment Recovery']],
    dont_tags: [],
    tactics: [
      { t: 'Price drop alerts',       ex: 'Chips now Rs.49 (was Rs.69)' },
      { t: 'Abandonment recovery',    ex: 'Complete your cart — 5% off' },
      { t: 'Free shipping threshold', ex: 'Add Rs.99 more for free delivery' },
      { t: 'Chat support nudge',      ex: 'Need help deciding?' }
    ]
  },
  2: {
    name: 'Nudge-Responsive Impulsives', col: '#e74c3c', thresh: 0.68,
    size: '~30K sessions — 35% of total',
    goal: 'Maximise impulse attach rate',
    lift: '+25% attach rate', cost: 'Low (high ROI)',
    desc: 'High-conversion potential — respond strongly to nudges. Scarcity and urgency drives immediate action.',
    do_tags:   [['tag-urgency','Countdown Timers'], ['tag-fomo','FOMO Alerts'], ['tag-urgency','Scarcity']],
    dont_tags: [],
    tactics: [
      { t: 'Live scarcity',    ex: 'Only 2 left — 17 people viewing' },
      { t: 'Countdown timers', ex: 'Offer ends in 2:47' },
      { t: 'Flash bundles',    ex: 'Chips + Coke = Rs.99 (save Rs.30)' },
      { t: 'Social proof',     ex: 'Top pick in Powai this hour' }
    ]
  }
};

/* ═══════════════════════════════════════════════════════════════
   CHART SIZING — DEFINITIVE FIX
   Problem: Bootstrap tabs use display:none on hidden panes.
   Every element inside returns offsetWidth = 0 at render time.
   Walking up the DOM tree also returns 0 because the whole pane
   is hidden. Fixed-pixel fallbacks render at wrong size.

   Solution: Use responsive:true + autosize:true.
   Plotly will size itself to 100% of its container automatically
   once the container is visible. We set the container height via
   CSS (style="height:Npx") and width to 100% via CSS.
   On tab switch we call Plotly.Plots.resize() to snap to actual dims.
═══════════════════════════════════════════════════════════════ */

/* ── Base layout — no width/height set, Plotly auto-fills ────── */
function mkLayout(divId, over) {
  return Object.assign({
    autosize:      true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font:       { family: 'Roboto, sans-serif', size: 12, color: '#6b7a8d' },
    margin:     { t: 20, r: 16, b: 56, l: 58, pad: 4 },
    showlegend: false,
    hoverlabel: { bgcolor: '#2c3e50', bordercolor: '#2c3e50',
                  font: { color: '#fff', size: 12, family: 'Roboto, sans-serif' } }
  }, over || {});
}

/* ── Pie layout — autosize, legend below ─────────────────────── */
function pieLayout(divId) {
  return {
    autosize:      true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    showlegend:    true,
    legend: {
      orientation: 'h', x: 0.5, xanchor: 'center',
      y: -0.06, yanchor: 'top',
      font: { size: 10, family: 'Roboto, sans-serif', color: '#6b7a8d' },
      bgcolor: 'rgba(0,0,0,0)', itemwidth: 30
    },
    margin:     { t: 12, r: 12, b: 52, l: 12, pad: 0 },
    hoverlabel: { bgcolor: '#2c3e50', bordercolor: '#2c3e50',
                  font: { color: '#fff', size: 12, family: 'Roboto, sans-serif' } }
  };
}

/* ── Gauge layout — autosize ─────────────────────────────────── */
function gaugeLayout(divId) {
  return {
    autosize:      true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    showlegend:    false,
    margin:        { t: 36, r: 28, b: 24, l: 28, pad: 0 },
    font:          { family: 'Roboto, sans-serif' }
  };
}

/* ── Axis helper ─────────────────────────────────────────────── */
function ax(title, extra) {
  return Object.assign({
    title:    title ? { text: title, font: { size: 11 }, standoff: 8 } : undefined,
    gridcolor:'#edf0f4', linecolor:'#e0e4ea',
    zeroline: false, tickfont: { size: 10, color: '#6b7a8d' }
  }, extra || {});
}

/* ── Config: responsive:true is the key that makes autosize work ─ */
const PC = { displayModeBar: false, responsive: true };

function P(divId, traces, layoutObj, cfg) {
  const el = document.getElementById(divId);
  if (!el) return;
  Plotly.purge(el);
  Plotly.newPlot(divId, traces, layoutObj, Object.assign({}, PC, cfg || {}));
}

/* ── Resize: called after tab becomes visible ────────────────── */
function resizeAll() {
  document.querySelectorAll('.js-plotly-plot').forEach(el => {
    try { Plotly.Plots.resize(el); } catch(e) {}
  });
}

/* ── Pie / donut — STRICT inside-only text ───────────────────── */
function makePie(labels, values, colors, hole) {
  return {
    labels, values,
    type:             'pie',
    hole:             hole || 0,
    marker:           { colors, line: { color: '#fff', width: 1.5 } },
    textinfo:         'percent',
    textposition:     'inside',
    insidetextanchor: 'middle',
    textfont:         { size: 11, color: '#fff', family: 'Roboto, sans-serif' },
    hovertemplate:    '<b>%{label}</b><br>Count: %{value:,}<br>%{percent}<extra></extra>',
    sort:             false,
    automargin:       false   // must be false — true pushes text outside boundaries
  };
}



/* ═══════════════════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════════════════ */
const $el = id => document.getElementById(id);
function show(id) { const e = $el(id); if (e) e.style.display = ''; }
function hide(id) { const e = $el(id); if (e) e.style.display = 'none'; }
function setErr(id, msg) {
  const e = $el(id);
  if (e) { e.innerHTML = `<strong>Error:</strong> ${msg}`; show(id); }
}

function kpi(label, value, sub) {
  return `<div class="kpi-label">${label}</div>
          <div class="kpi-value">${value}</div>
          <div class="kpi-sub">${sub}</div>`;
}

function sigBadge(s) {
  if (s >= 0.65) return `<span class="signal signal-strong">Strong</span>`;
  if (s >= 0.45) return `<span class="signal signal-medium">Medium</span>`;
  return `<span class="signal signal-low">Low</span>`;
}

function scoreBar(s) {
  const pct = Math.round(s * 100);
  const col = s >= 0.65 ? C.green : s >= 0.45 ? C.blue : C.orange;
  return `<div class="score-bar-cell">
    <div class="score-bar-bg">
      <div class="score-bar-fill" style="width:${pct}%;background:${col}"></div>
    </div>
    <span class="score-val">${s.toFixed(3)}</span>
  </div>`;
}

/* ── Cluster strategy banner ─────────────────────────────────── */
function clusterBanner(cluster) {
  const ci       = CL[cluster] || CL[0];
  const doTags   = ci.do_tags.map(([cls, lbl]) =>
    `<span class="nudge-tag ${cls}">${lbl}</span>`).join('');
  const dontTags = ci.dont_tags.map(([cls, lbl]) =>
    `<span class="nudge-tag ${cls}">${lbl}</span>`).join('');
  const tactics  = ci.tactics.map(t =>
    `<div class="tactic-row">
       <span class="tactic-label">${t.t}</span>
       <span class="tactic-ex">${t.ex}</span>
     </div>`).join('');
  return `
    <div class="cb-header" style="border-left-color:${ci.col}">
      <div class="cb-meta">
        <div class="cb-title" style="color:${ci.col}">Cluster ${cluster} — ${ci.name}</div>
        <div class="cb-size">${ci.size}</div>
      </div>
      <div class="cb-lift">
        <div class="lift-val" style="color:${ci.col}">${ci.lift}</div>
        <div class="lift-label">Expected Lift</div>
      </div>
      <div class="cb-lift">
        <div class="lift-val">${ci.cost}</div>
        <div class="lift-label">Nudge Cost</div>
      </div>
    </div>
    <div class="cb-body">
      <div class="cb-desc">${ci.desc}</div>
      <div class="cb-goal"><strong>Goal:</strong> ${ci.goal}</div>
      <div class="cb-tactics">${tactics}</div>
      <div class="cb-tags">
        <span class="cb-tag-label">Recommended:</span>${doTags}
        ${dontTags ? `<span class="cb-tag-label" style="margin-left:10px">Avoid:</span>${dontTags}` : ''}
      </div>
    </div>`;
}

/* ── Gauge ───────────────────────────────────────────────────── */
function renderGauge(divId, value) {
  const v   = Math.round(value * 1000) / 1000;
  const col = v >= 0.65 ? C.green : v >= 0.40 ? C.blue : C.orange;
  P(divId, [{
    type: 'indicator', mode: 'gauge+number',
    value: v,
    number: { valueformat: '.3f',
              font: { size: 20, color: '#2c3e50', family: 'Roboto, sans-serif' } },
    gauge: {
      axis: { range: [0, 1], tickvals: [0, 0.25, 0.5, 0.75, 1],
               ticktext: ['0','.25','.5','.75','1'],
               tickfont: { size: 9, color: '#9ca3af' }, tickcolor: '#e0e4ea' },
      bar:    { color: col, thickness: 0.20 },
      bgcolor:'white', borderwidth: 0,
      steps: [
        { range:[0.00,0.35], color:'rgba(231,76,60,0.07)' },
        { range:[0.35,0.65], color:'rgba(243,156,18,0.07)' },
        { range:[0.65,1.00], color:'rgba(39,174,96,0.07)' }
      ],
      threshold: { line:{color:col,width:2}, thickness:0.72, value:v }
    }
  }], gaugeLayout(divId), PC);
}

/* ── Reco table ──────────────────────────────────────────────── */
function recoTable(tableId, dtRef, recos) {
  if (dtRef) { try { dtRef.destroy(); } catch(e) {} $(`#${tableId} tbody`).empty(); }
  const tb = $(`#${tableId} tbody`);
  recos.forEach((r, i) => {
    const price = (r.price != null && r.price > 0) ? `Rs.${Number(r.price).toFixed(0)}` : '—';
    tb.append(`<tr>
      <td style="color:var(--muted);font-weight:600;width:44px">${i + 1}</td>
      <td style="font-weight:700;font-family:'Roboto Mono',monospace;color:var(--primary)">P-${r.product_id}</td>
      <td><span class="cat-badge">${r.category || '—'}</span></td>
      <td style="font-family:'Roboto Mono',monospace;font-weight:600">${price}</td>
      <td style="font-family:'Roboto Mono',monospace;font-weight:700;
                 color:${r.ml_impulse_pred >= 0.65 ? C.green : C.blue}">${r.ml_impulse_pred.toFixed(3)}</td>
      <td>${sigBadge(r.ml_impulse_pred)}</td>
      <td style="min-width:150px">${scoreBar(r.ml_impulse_pred)}</td>
    </tr>`);
  });
  return $(`#${tableId}`).DataTable({
    pageLength: 10, dom: 'Bfrtip',
    buttons:    [{ extend:'csv', text:'Export CSV', className:'btn btn-sm btn-outline-secondary' }],
    order:      [[4,'desc']],
    columnDefs: [{ orderable:false, targets:[5,6] }],
    language:   { search:'Search:', info:'Showing _START_–_END_ of _TOTAL_' }
  });
}

/* ═══════════════════════════════════════════════════════════════
   TAB 1 — SESSION
═══════════════════════════════════════════════════════════════ */
async function loadSessionReco() {
  const sid  = parseInt($el('sessionInput').value) || 6;
  const topK = parseInt($el('sessionTopK').value)  || 10;
  hide('sessionResults'); hide('sessionError'); show('sessionLoading');
  try {
    const d = await (await fetch('/api/session_reco', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ session_id:sid, top_k:topK })
    })).json();
    hide('sessionLoading');
    if (d.error) { setErr('sessionError', d.error); return; }
    // CRITICAL: show the container FIRST so all divs have real pixel
    // dimensions, then render charts in next animation frame
    renderSessionMeta(d);
    show('sessionResults');
    requestAnimationFrame(() => requestAnimationFrame(() => renderSessionCharts(d)));
  } catch(e) {
    hide('sessionLoading');
    setErr('sessionError', 'Cannot reach Flask. Run <code>python app.py</code> and refresh.');
  }
}

// Phase 1: populate all non-chart DOM (badges, KPIs, table, banner)
// This runs BEFORE show('sessionResults') so the div is still hidden — that's fine,
// no pixel measurement needed here.
function renderSessionMeta(d) {
  const avg = d.recos.length
    ? d.recos.reduce((s,r) => s + r.ml_impulse_pred, 0) / d.recos.length : 0;
  const ci  = CL[d.cluster] || CL[0];
  d._avg = avg; // stash for charts phase

  $el('sessionMeta').innerHTML = `
    <span class="badge-custom badge-blue">Session #${d.session_id}</span>
    <span class="badge-custom" style="background:${ci.col}18;color:${ci.col};border:1px solid ${ci.col}44">
      Cluster ${d.cluster} — ${ci.name}
    </span>
    <span class="badge-custom badge-green">Threshold ${d.threshold}</span>
    <span class="badge-custom badge-grey">${d.total_recos} products found</span>`;

  $el('sKpi1').innerHTML = kpi('Session ID',       `#${d.session_id}`, 'Lookup identifier');
  $el('sKpi2').innerHTML = kpi('Total Recos',       d.total_recos,      'Products recommended');
  $el('sKpi3').innerHTML = kpi('Avg Impulse Score', avg.toFixed(3),     'Signal average');
  $el('sKpi4').innerHTML = kpi('Threshold',          d.threshold,        `Cluster ${d.cluster} cutoff`);

  $el('sessionClusterBanner').innerHTML = clusterBanner(d.cluster);
  $el('sessionRecoCount').textContent   = `${d.recos.length} products`;
  DT.session = recoTable('sessionRecoTable', DT.session, d.recos);
}

// Phase 2: render Plotly charts — runs AFTER show('sessionResults') so containers
// have real pixel dimensions and getDims() returns correct values.
function renderSessionCharts(d) {
  const avg    = d._avg;
  const prods  = d.recos.map(r => `P-${r.product_id}`);
  const scores = d.recos.map(r => r.ml_impulse_pred);

  P('sessionScoreChart', [{
    x: prods, y: scores, type:'bar',
    marker: { color:scores.map(s=>s>=0.65?C.green:s>=0.45?C.blue:C.orange), opacity:0.87, line:{width:0} },
    hovertemplate:'<b>%{x}</b><br>Impulse Score: <b>%{y:.3f}</b><extra></extra>'
  }], mkLayout('sessionScoreChart', {
    margin:{t:16,r:16,b:64,l:52,pad:4},
    xaxis: ax(null, {tickangle:-35, tickfont:{size:10}}),
    yaxis: ax('Impulse Score', {range:[0,1.0], tickformat:'.2f', zeroline:true, zerolinecolor:'#e0e4ea'})
  }));

  P('sessionSourcePie',
    [makePie(['Session','User History','Cluster Boost'],
             [d.sources.session, d.sources.user_history, d.sources.cluster],
             [C.blue, C.green, C.orange], 0.52)],
    pieLayout('sessionSourcePie'));

  renderGauge('sessionGauge', avg);
}

/* ═══════════════════════════════════════════════════════════════
   TAB 2 — USER
═══════════════════════════════════════════════════════════════ */
async function loadUserReco() {
  const uid  = parseInt($el('userInput').value) || 6638;
  const topK = parseInt($el('userTopK').value)  || 10;
  hide('userResults'); hide('userError'); show('userLoading');
  try {
    const d = await (await fetch('/api/user_reco', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ user_id:uid, top_k:topK })
    })).json();
    hide('userLoading');
    if (d.error) { setErr('userError', d.error); return; }
    renderUserMeta(d);
    show('userResults');
    requestAnimationFrame(() => requestAnimationFrame(() => renderUserCharts(d)));
  } catch(e) {
    hide('userLoading');
    setErr('userError', 'Cannot reach Flask. Run <code>python app.py</code> and refresh.');
  }
}

function renderUserMeta(d) {
  const avg = d.recos.length
    ? d.recos.reduce((s,r) => s + r.ml_impulse_pred, 0) / d.recos.length : 0;
  const ci  = CL[d.cluster] || CL[0];
  d._avg = avg;

  $el('userMeta').innerHTML = `
    <span class="badge-custom badge-blue">User #${d.user_id}</span>
    <span class="badge-custom badge-grey">${d.sessions_analyzed} sessions analyzed</span>
    <span class="badge-custom" style="background:${ci.col}18;color:${ci.col};border:1px solid ${ci.col}44">
      Cluster ${d.cluster} — ${ci.name}
    </span>
    <span class="badge-custom badge-green">${d.total_unique_recos} unique products</span>
    <span class="badge-custom badge-grey">Threshold ${d.threshold}</span>`;

  $el('uKpi1').innerHTML = kpi('User ID',            `#${d.user_id}`,       'Lookup identifier');
  $el('uKpi2').innerHTML = kpi('Sessions Analyzed',   d.sessions_analyzed,  'Historical sessions');
  $el('uKpi3').innerHTML = kpi('Avg Impulse Score',   avg.toFixed(3),       'Cross-session avg');
  $el('uKpi4').innerHTML = kpi('Unique Recos',        d.total_unique_recos, 'Deduplicated products');

  $el('userClusterBanner').innerHTML = clusterBanner(d.cluster);
  $el('userRecoCount').textContent   = `${d.recos.length} products`;
  DT.user = recoTable('userRecoTable', DT.user, d.recos);
}

function renderUserCharts(d) {
  const avg    = d._avg;
  const prods  = d.recos.map(r => `P-${r.product_id}`);
  const scores = d.recos.map(r => r.ml_impulse_pred);

  P('userScoreChart', [{
    x: prods, y: scores, type:'bar',
    marker: { color:scores.map(s=>s>=0.65?C.green:s>=0.45?C.blue:C.orange), opacity:0.87, line:{width:0} },
    hovertemplate:'<b>%{x}</b><br>Impulse Score: <b>%{y:.3f}</b><extra></extra>'
  }], mkLayout('userScoreChart', {
    margin:{t:16,r:16,b:64,l:52,pad:4},
    xaxis: ax(null, {tickangle:-35, tickfont:{size:10}}),
    yaxis: ax('Impulse Score', {range:[0,1.0], tickformat:'.2f', zeroline:true, zerolinecolor:'#e0e4ea'})
  }));

  P('userSourcePie',
    [makePie(['User Sessions','Cluster Boost'],
             [d.sources.user_sessions, d.sources.cluster_boost],
             [C.navy, C.blue], 0.52)],
    pieLayout('userSourcePie'));

  renderGauge('userGauge', avg);
}

/* ═══════════════════════════════════════════════════════════════
   TAB 3 — STOCK PLANNER
═══════════════════════════════════════════════════════════════ */
async function loadStock() {
  const loc  = $el('locationSelect').value;
  const topK = parseInt($el('stockTopK').value)  || 15;
  const minS = parseFloat($el('minScore').value) || 0.3;
  activeLocation = loc;
  hide('stockResults'); hide('stockError'); hide('exportBtn'); show('stockLoading');
  try {
    const d = await (await fetch('/api/region_stock', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ location:loc, top_k:topK, min_score:minS })
    })).json();
    hide('stockLoading');
    if (d.error) { setErr('stockError', d.error); return; }
    renderStockMeta(d);
    show('stockResults'); show('exportBtn');
    requestAnimationFrame(() => requestAnimationFrame(() => renderStockCharts(d)));
  } catch(e) {
    hide('stockLoading');
    setErr('stockError', 'Cannot reach Flask. Run <code>python app.py</code> and refresh.');
  }
}

function renderStockMeta(d) {
  const total = d.products.reduce((s,p) => s + p.stock_qty, 0);

  $el('stockKpiRow').innerHTML = `
    <div class="col-md-3"><div class="kpi-card">
      ${kpi('Location', d.location, `${d.num_users.toLocaleString()} registered users`)}
    </div></div>
    <div class="col-md-3"><div class="kpi-card success-border">
      ${kpi('Sessions', d.num_sessions.toLocaleString(), 'Sessions analyzed')}
    </div></div>
    <div class="col-md-3"><div class="kpi-card warning-border">
      ${kpi('Avg Impulse Score', d.avg_ml_score, 'Signal strength')}
    </div></div>
    <div class="col-md-3"><div class="kpi-card danger-border">
      ${kpi('Total Stock Units', total.toLocaleString(), 'Recommended to stock')}
    </div></div>`;

  if (DT.stock) { try{DT.stock.destroy();}catch(e){} $('#stockTable tbody').empty(); }
  const tb = $('#stockTable tbody');
  d.products.forEach((p,i) => {
    const pr  = p.avg_ml_score>=0.65?'HIGH':p.avg_ml_score>=0.45?'MEDIUM':'LOW';
    const cls = p.avg_ml_score>=0.65?'priority-high':p.avg_ml_score>=0.45?'priority-medium':'priority-low';
    tb.append(`<tr>
      <td style="color:var(--muted);font-weight:600">${i+1}</td>
      <td style="font-weight:700;font-family:'Roboto Mono',monospace">P-${p.product_id}</td>
      <td><span class="cat-badge">${p.category||'—'}</span></td>
      <td style="font-family:'Roboto Mono',monospace">${p.avg_ml_score.toFixed(3)}</td>
      <td>${p.total_sold.toLocaleString()}</td>
      <td style="font-weight:700;color:var(--primary)">${p.stock_qty.toLocaleString()}</td>
      <td><span class="priority ${cls}">${pr}</span></td>
    </tr>`);
  });
  DT.stock = $('#stockTable').DataTable({
    pageLength:15, dom:'Bfrtip',
    buttons:[
      {extend:'csv',   text:'Export CSV',   className:'btn btn-sm btn-outline-secondary'},
      {extend:'excel', text:'Export Excel', className:'btn btn-sm btn-outline-secondary'}
    ],
    order:[[5,'desc']], language:{search:'Search:'}
  });
}

function renderStockCharts(d) {
  const top10 = d.products.slice(0,10);
  P('stockQtyChart', [{
    y: top10.map(p=>`P-${p.product_id}`),
    x: top10.map(p=>p.stock_qty),
    type:'bar', orientation:'h',
    marker:{ color:top10.map(p=>p.avg_ml_score>=0.65?C.green:p.avg_ml_score>=0.45?C.blue:C.orange), opacity:0.87, line:{width:0} },
    hovertemplate:'<b>%{y}</b><br>Stock Qty: <b>%{x:,}</b> units<extra></extra>'
  }], mkLayout('stockQtyChart', {
    margin:{t:16,r:20,b:48,l:84,pad:4},
    xaxis: ax('Stock Units'),
    yaxis: ax(null, {autorange:'reversed', tickfont:{size:11}})
  }));

  P('catPieChart',
    [makePie(Object.keys(d.category_breakdown), Object.values(d.category_breakdown), C.pie8, 0.48)],
    pieLayout('catPieChart'));

  const grp = {};
  d.products.forEach(p => { if(!grp[p.category]) grp[p.category]=[]; grp[p.category].push(p.avg_ml_score); });
  const cNames  = Object.keys(grp);
  const cScores = cNames.map(c => parseFloat((grp[c].reduce((a,b)=>a+b,0)/grp[c].length).toFixed(3)));
  P('catScoreChart', [{
    x:cNames, y:cScores, type:'bar',
    marker:{color:cScores.map(s=>s>=0.65?C.green:s>=0.45?C.blue:C.orange), opacity:0.87, line:{width:0}},
    hovertemplate:'<b>%{x}</b><br>Avg Impulse Score: <b>%{y:.3f}</b><extra></extra>'
  }], mkLayout('catScoreChart', {
    margin:{t:16,r:16,b:60,l:52,pad:4},
    xaxis: ax(null, {tickangle:-25, tickfont:{size:10}}),
    yaxis: ax('Avg Impulse Score', {range:[0,1.0], tickformat:'.2f'})
  }));

  const top8  = d.products.slice(0,8);
  const xlabs = top8.map(p=>`P-${p.product_id}`);
  P('soldVsStockChart', [
    { name:'Total Sold', x:xlabs, y:top8.map(p=>p.total_sold), type:'bar',
      marker:{color:C.navy, opacity:0.80, line:{width:0}},
      hovertemplate:'<b>%{x}</b><br>Sold: <b>%{y:,}</b><extra></extra>' },
    { name:'Stock Qty', x:xlabs, y:top8.map(p=>p.stock_qty), type:'bar',
      marker:{color:C.blue, opacity:0.80, line:{width:0}},
      hovertemplate:'<b>%{x}</b><br>Stock: <b>%{y:,}</b><extra></extra>' }
  ], mkLayout('soldVsStockChart', {
    barmode:'group', margin:{t:40,r:16,b:56,l:56,pad:4},
    showlegend:true,
    legend:{ orientation:'h', x:0.5, xanchor:'center', y:1.0, yanchor:'bottom',
             font:{size:11}, bgcolor:'rgba(0,0,0,0)' },
    xaxis: ax(null, {tickangle:-25, tickfont:{size:10}}),
    yaxis: ax('Units')
  }));
}

function exportCSV() {
  if (activeLocation)
    window.location.href = `/api/region_stock/export/${encodeURIComponent(activeLocation)}`;
}

/* ═══════════════════════════════════════════════════════════════
   TAB 4 — ANALYTICS
═══════════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  show('analyticsLoading'); hide('analyticsContent');
  try {
    const d = await (await fetch('/api/analytics')).json();
    hide('analyticsLoading');
    renderAnalyticsMeta(d);
    show('analyticsContent');
    // Two rAF frames give Bootstrap time to finish layout before Plotly measures dims
    requestAnimationFrame(() => requestAnimationFrame(() => renderAnalyticsCharts(d)));
  } catch(e) {
    hide('analyticsLoading');
    $el('analyticsContent').innerHTML =
      `<div class="section-card alert-custom">Failed to load analytics data.</div>`;
    show('analyticsContent');
  }
}

function renderAnalyticsMeta(d) {
  const rc = d.region_comparison || [];
  d._rc = rc; // stash for charts phase

  $el('analyticsKpiRow').innerHTML = `
    <div class="col-md-2"><div class="kpi-card">${kpi('Total Users',d.total_users.toLocaleString(),'In dataset')}</div></div>
    <div class="col-md-2"><div class="kpi-card success-border">${kpi('Total Sessions',d.total_sessions.toLocaleString(),'Analyzed')}</div></div>
    <div class="col-md-2"><div class="kpi-card warning-border">${kpi('Avg Impulse Score',d.avg_impulse_score,'Model average')}</div></div>
    <div class="col-md-2"><div class="kpi-card danger-border">${kpi('Clusters',3,'3-segment model')}</div></div>
    <div class="col-md-2"><div class="kpi-card" style="border-left-color:#9b59b6">${kpi('Regions',rc.length,'Locations tracked')}</div></div>
    <div class="col-md-2"><div class="kpi-card" style="border-left-color:#1abc9c">${kpi('Model AUC','0.95','Leak-free validated')}</div></div>`;

  // Nudge playbook cards are pure HTML — no pixel measurement needed
  if (d.nudge_playbook) {
    const el = $el('nudgePlaybookCards');
    if (el) {
      const ratingCls = r => 'pb-' + r.toLowerCase().replace(/[^a-z]/g,'').substring(0,9);
      el.innerHTML = Object.entries(d.nudge_playbook).map(([k, pb]) => {
        const ci   = CL[parseInt(k)] || CL[0];
        const rows = Object.entries(pb.tactics).map(([tac, rating]) =>
          `<div class="pb-row">
            <span class="pb-tactic">${tac}</span>
            <span class="pb-rating ${ratingCls(rating)}">${rating}</span>
          </div>`).join('');
        return `<div class="col-md-4">
          <div class="playbook-card" style="border-top:4px solid ${ci.col}">
            <div class="pb-header">
              <div class="pb-name" style="color:${ci.col}">${ci.name}</div>
              <div class="pb-size">${ci.size}</div>
            </div>
            <div class="pb-goal">${pb.primary_goal}</div>
            <div class="pb-lift"><strong>${pb.expected_lift}</strong> &middot; ${pb.nudge_cost} nudge cost</div>
            <div class="pb-tactics">${rows}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Region summary table — pure HTML, no pixel measurement needed
  const rc2 = rc;
  if (rc2.length) {
    if (DT.region) { try{DT.region.destroy();}catch(e){} $('#regionSummaryTable tbody').empty(); }
    const tb = $('#regionSummaryTable tbody');
    rc2.forEach(r => {
      const rat = r.avg_ml_score>=0.65
        ? '<span class="priority priority-high">High</span>'
        : r.avg_ml_score>=0.45
          ? '<span class="priority priority-medium">Medium</span>'
          : '<span class="priority priority-low">Low</span>';
      tb.append(`<tr>
        <td style="font-weight:600">${r.location}</td>
        <td>${r.num_users.toLocaleString()}</td>
        <td>${r.num_sessions.toLocaleString()}</td>
        <td style="font-family:'Roboto Mono',monospace;font-weight:700">${r.avg_ml_score.toFixed(3)}</td>
        <td>${r.total_sold.toLocaleString()}</td>
        <td>${rat}</td>
      </tr>`);
    });
    DT.region = $('#regionSummaryTable').DataTable({
      pageLength:15, dom:'Bfrtip',
      buttons:[{extend:'csv',text:'Export CSV',className:'btn btn-sm btn-outline-secondary'}],
      order:[[3,'desc']], language:{search:'Search:'}
    });
  }
}

function renderAnalyticsCharts(d) {
  const rc = d._rc || [];

  /* 1. Cluster donut */
  P('clusterPieChart',
    [makePie(Object.keys(d.cluster_distribution), Object.values(d.cluster_distribution), C.cluster, 0.50)],
    pieLayout('clusterPieChart'));

  /* 2. Score distribution */
  if (d.score_distribution && Object.keys(d.score_distribution).length) {
    const bins = Object.keys(d.score_distribution);
    const vals = Object.values(d.score_distribution);
    P('scoreDistChart', [{
      x:bins, y:vals, type:'bar',
      marker:{color:[C.red,C.orange,C.blue,C.green], opacity:0.87, line:{width:0}},
      hovertemplate:'Range <b>%{x}</b><br>Records: <b>%{y:,}</b><extra></extra>'
    }], mkLayout('scoreDistChart', {
      margin:{t:16,r:16,b:52,l:64,pad:4},
      xaxis: ax('Impulse Score Range', {tickfont:{size:11}}),
      yaxis: ax('Record Count')
    }));
  }

  /* 3. Cluster threshold bar — text inside bars */
  P('clusterScoreBar', [{
    x:['Steady\nConverters','Hesitant\nBrowsers','Nudge-Responsive\nImpulsives'],
    y:[0.52, 0.17, 0.68], type:'bar',
    marker:{color:C.cluster, opacity:0.87, line:{width:0}},
    text:['0.52','0.17','0.68'],
    textposition:'inside', insidetextanchor:'middle',
    textfont:{size:13, color:'#fff', family:'Roboto, sans-serif'},
    hovertemplate:'<b>%{x}</b><br>Threshold: <b>%{y:.2f}</b><extra></extra>'
  }], mkLayout('clusterScoreBar', {
    margin:{t:16,r:16,b:64,l:52,pad:4},
    xaxis: ax(null, {tickfont:{size:10}}),
    yaxis: ax('Impulse Threshold', {range:[0,0.80], tickformat:'.2f'})
  }));

  /* 4. Nudge breakdown donut */
  if (d.nudge_breakdown && Object.keys(d.nudge_breakdown).length) {
    const nLabs = Object.keys(d.nudge_breakdown).map(k =>
      k.replace(/^num_/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
    P('nudgeBreakdownChart',
      [makePie(nLabs, Object.values(d.nudge_breakdown), [C.red,C.orange,C.blue,C.navy], 0.48)],
      pieLayout('nudgeBreakdownChart'));
  }

  /* 5. Cluster avg impulse score */
  if (d.cluster_avg_scores && Object.keys(d.cluster_avg_scores).length) {
    const casKeys = Object.keys(d.cluster_avg_scores);
    const casVals = Object.values(d.cluster_avg_scores);
    P('clusterAvgScoreChart', [{
      x:casKeys, y:casVals, type:'bar',
      marker:{color:C.cluster, opacity:0.87, line:{width:0}},
      hovertemplate:'<b>%{x}</b><br>Avg Impulse Score: <b>%{y:.3f}</b><extra></extra>'
    }], mkLayout('clusterAvgScoreChart', {
      margin:{t:16,r:16,b:72,l:52,pad:4},
      xaxis: ax(null, {tickfont:{size:10}, tickangle:-10}),
      yaxis: ax('Avg Impulse Score', {range:[0,1.0], tickformat:'.2f'})
    }));
  }

  if (!rc.length) return;

  const regions   = rc.map(r => r.location);
  const numUsers  = rc.map(r => r.num_users);
  const numSess   = rc.map(r => r.num_sessions);
  const avgScores = rc.map(r => r.avg_ml_score);

  /* 6. Scatter */
  P('engagementScatterChart', [{
    x: numSess, y: avgScores, text: regions,
    mode:'markers', type:'scatter',
    marker:{ size:10, color:avgScores.map(s=>s>=0.65?C.green:s>=0.45?C.blue:C.orange), opacity:0.87, line:{width:1.5, color:'#fff'} },
    hovertemplate:'<b>%{text}</b><br>Sessions: %{x:,}<br>Impulse Score: %{y:.3f}<extra></extra>'
  }], mkLayout('engagementScatterChart', {
    margin:{t:16,r:16,b:52,l:60,pad:4},
    xaxis: ax('Sessions'),
    yaxis: ax('Avg Impulse Score', {tickformat:'.2f'})
  }));

  /* 7. Region bars */
  const rbl = (divId, yTitle, yExtra) => mkLayout(divId, {
    margin:{t:16,r:16,b:90,l:60,pad:4},
    xaxis: ax(null, {tickangle:-40, tickfont:{size:10}}),
    yaxis: ax(yTitle, yExtra || {})
  });

  P('regionUsersChart', [{
    x:regions, y:numUsers, type:'bar',
    marker:{color:C.blue, opacity:0.87, line:{width:0}},
    hovertemplate:'<b>%{x}</b><br>Users: <b>%{y:,}</b><extra></extra>'
  }], rbl('regionUsersChart','Users'));

  P('regionSessionsChart', [{
    x:regions, y:numSess, type:'bar',
    marker:{color:C.navy, opacity:0.85, line:{width:0}},
    hovertemplate:'<b>%{x}</b><br>Sessions: <b>%{y:,}</b><extra></extra>'
  }], rbl('regionSessionsChart','Sessions'));

  P('regionScoreChart', [{
    x:regions, y:avgScores, type:'bar',
    marker:{color:avgScores.map(s=>s>=0.65?C.green:s>=0.45?C.blue:C.orange), opacity:0.87, line:{width:0}},
    hovertemplate:'<b>%{x}</b><br>Impulse Score: <b>%{y:.3f}</b><extra></extra>'
  }], rbl('regionScoreChart','Avg Impulse Score', {range:[0,1.0], tickformat:'.2f'}));
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  loadSessionReco();

  let analyticsReady = false;
  $el('analyticsTab').addEventListener('click', () => {
    if (!analyticsReady) { analyticsReady = true; loadAnalytics(); }
  });

  let stockReady = false;
  $el('stockTab').addEventListener('click', () => {
    if (!stockReady) { stockReady = true; setTimeout(loadStock, 80); }
  });

  /*
    // Bootstrap fires 'shown.bs.tab' after the pane is fully visible.
    // With responsive:true, Plotly.Plots.resize() re-measures and fills the container.
  */
  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      setTimeout(resizeAll, 80);
    });
  });

  window.addEventListener('resize', () => {
    clearTimeout(window._rt);
    window._rt = setTimeout(resizeAll, 160);
  });
});
