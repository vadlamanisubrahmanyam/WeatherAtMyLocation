/* Small canvas chart helper: horizontally scrolling line/bar charts on one y-axis, with tap tooltips. */
'use strict';
const Charts = (() => {
  const INK_MUTED = '#8aa2c8', GRID = 'rgba(255,255,255,0.07)', DAY = 'rgba(255,255,255,0.14)', SURFACE = '#0f1c30';

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function niceRange(min, max, o) {
    if (o.zeroBase) min = Math.min(0, min);
    if (o.yMin != null) min = Math.min(min, o.yMin);
    if (o.yMax != null) max = Math.max(max, o.yMax);
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { min -= 1; max += 1; }
    const step = niceStep((max - min) / 4);
    return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
  }
  function roundTopRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  /**
   * opts: { canvas, scrollEl, tipEl, n, colWidth, height, series:[{name,color,values,type,colors?}],
   *         hidden:Set, labels:[str], xLabel:(i)=>str|null, dayBreaks:[i], yFmt, tipFmt, zeroBase, yMin, yMax }
   */
  function draw(o) {
    const c = o.canvas, ctx = c.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const padL = 6, padR = 6, padT = 16, padB = 24;
    const avail = Math.max(200, o.scrollEl.clientWidth);
    let col = o.colWidth;
    if (o.n * col + padL + padR < avail) col = (avail - padL - padR) / o.n;
    const W = Math.round(o.n * col + padL + padR), H = o.height || 190;
    c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    o._col = col; o._padL = padL;

    const vis = o.series.filter((s) => !(o.hidden && o.hidden.has(s.name)));
    let mn = Infinity, mx = -Infinity;
    vis.forEach((s) => s.values.forEach((v) => { if (v != null && !isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }));
    const r = niceRange(mn, mx, o);
    const y = (v) => padT + (H - padT - padB) * (1 - (v - r.min) / (r.max - r.min));
    const x = (i) => padL + col * (i + 0.5);

    // grid + y labels (repeated at each day start so they stay visible while scrolling)
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    const labelXs = [0];
    (o.dayBreaks || []).forEach((i) => { if ((i - labelXs[labelXs.length - 1]) * col >= 90) labelXs.push(i); });
    for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    }
    (o.dayBreaks || []).forEach((i) => {
      const xx = Math.round(padL + col * i) + 0.5;
      ctx.strokeStyle = DAY;
      ctx.beginPath(); ctx.moveTo(xx, padT - 10); ctx.lineTo(xx, H - padB); ctx.stroke();
    });
    // x labels
    ctx.fillStyle = INK_MUTED;
    ctx.textAlign = 'center';
    for (let i = 0; i < o.n; i++) {
      const t = o.xLabel(i);
      if (t) ctx.fillText(t, x(i), H - 8);
    }
    ctx.textAlign = 'left';

    // bars first, then lines on top
    const base = y(Math.max(r.min, 0));
    vis.filter((s) => s.type === 'bar').forEach((s) => {
      const bw = Math.max(2, col - 2);
      s.values.forEach((v, i) => {
        if (v == null || isNaN(v) || v <= 0) return;
        const top = y(v);
        ctx.fillStyle = s.colors ? s.colors[i] : s.color;
        roundTopRect(ctx, x(i) - bw / 2, top, bw, Math.max(1, base - top), bw >= 6 ? 4 : 1);
        ctx.fill();
      });
    });
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    vis.filter((s) => s.type !== 'bar').forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      let pen = false;
      s.values.forEach((v, i) => {
        if (v == null || isNaN(v)) { pen = false; return; }
        if (!pen) { ctx.moveTo(x(i), y(v)); pen = true; } else ctx.lineTo(x(i), y(v));
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // y labels last so marks never hide them (small surface plate behind each)
    ctx.font = '10px system-ui, sans-serif';
    for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
      const yy = Math.round(y(v)) + 0.5, t = o.yFmt(v), tw = ctx.measureText(t).width;
      labelXs.forEach((i) => {
        const lx = padL + col * i + 3;
        ctx.fillStyle = 'rgba(15,28,48,0.8)'; ctx.fillRect(lx - 2, yy - 13, tw + 4, 12);
        ctx.fillStyle = INK_MUTED; ctx.fillText(t, lx, yy - 3);
      });
    }

    // crosshair + tooltip
    const tip = o.tipEl;
    if (o.sel != null && o.sel >= 0 && o.sel < o.n) {
      const sx = x(o.sel);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, padT - 6); ctx.lineTo(Math.round(sx) + 0.5, H - padB); ctx.stroke();
      vis.filter((s) => s.type !== 'bar').forEach((s) => {
        const v = s.values[o.sel];
        if (v == null || isNaN(v)) return;
        ctx.beginPath(); ctx.arc(sx, y(v), 4, 0, Math.PI * 2);
        ctx.fillStyle = s.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = SURFACE; ctx.stroke();
      });
      if (tip) {
        const rows = vis.map((s) => {
          const v = s.values[o.sel];
          const sw = s.colors ? s.colors[o.sel] : s.color;
          return `<div class="tt-r"><i style="background:${sw}"></i>${s.name}<b>${v == null || isNaN(v) ? '—' : o.tipFmt(v, s)}</b></div>`;
        }).join('');
        tip.innerHTML = `<div class="tt-h">${o.labels[o.sel]}</div>${rows}`;
        tip.style.display = 'block';
        const wrapW = o.scrollEl.clientWidth, px = sx - o.scrollEl.scrollLeft;
        const tw = tip.offsetWidth;
        let left = px + 12;
        if (left + tw > wrapW) left = px - tw - 12;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = (o.scrollEl.offsetTop + 8) + 'px';
      }
    } else if (tip) tip.style.display = 'none';
  }

  /** Render and wire tap/hover selection. Re-calling with new opts replaces the chart. */
  function mount(o) {
    o.sel = o.sel == null ? null : o.sel;
    o.canvas._chart = o;
    draw(o);
    if (!o.canvas._wired) {
      o.canvas._wired = true;
      const pick = (ev) => {
        const ch = o.canvas._chart, rect = ch.canvas.getBoundingClientRect();
        const i = Math.floor((ev.clientX - rect.left - ch._padL) / ch._col);
        ch.sel = Math.max(0, Math.min(ch.n - 1, i));
        draw(ch);
      };
      o.canvas.addEventListener('click', pick);
      o.canvas.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') pick(ev); });
      o.canvas.addEventListener('pointerleave', (ev) => {
        if (ev.pointerType !== 'mouse') return;
        const ch = o.canvas._chart; ch.sel = null; draw(ch);
      });
      o.scrollEl.addEventListener('scroll', () => { const ch = o.canvas._chart; if (ch.sel != null) draw(ch); }, { passive: true });
    }
    return o;
  }
  return { mount, draw };
})();
