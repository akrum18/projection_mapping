// 2D overlay drawing shared by editor (handles) and output (outlines/test pattern).
export function drawTestPattern(ctx, w, h) {
  ctx.save();
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  const step = Math.max(40, Math.round(w / 24));
  for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  ctx.lineWidth = 4; ctx.strokeStyle = "#ff8800";
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(h / 18)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(`${w} × ${h}`, w / 2, h / 2);
  ctx.restore();
}

// corners in canvas pixels. opts: { selected, handles, corner (selected corner idx), labels }
export function drawOutlines(ctx, state, w, h, opts = {}) {
  ctx.save();
  state.surfaces.forEach((sf, i) => {
    const c = sf.corners.map(([x, y]) => [x * w, y * h]);
    const sel = sf.id === opts.selected;
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.strokeStyle = sel ? "#ff8800" : sf.visible ? "rgba(0,255,180,0.9)" : "rgba(160,160,160,0.7)";
    ctx.setLineDash(sf.visible ? [] : [6, 6]);
    ctx.beginPath();
    c.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    // top edge marker so you can tell orientation
    ctx.strokeStyle = sel ? "#ffd080" : "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); ctx.lineTo(c[1][0], c[1][1]); ctx.stroke();
    if (opts.labels !== false) {
      const cx = c.reduce((a, p) => a + p[0], 0) / 4, cy = c.reduce((a, p) => a + p[1], 0) / 4;
      ctx.font = `${Math.max(11, Math.round(h / 45))}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = `${i + 1}. ${sf.name}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(cx - tw / 2, cy - 10, tw, 20);
      ctx.fillStyle = sel ? "#ffb060" : "#fff"; ctx.fillText(label, cx, cy);
    }
    if (opts.handles && sel) {
      c.forEach((p, k) => {
        const hot = k === opts.corner;
        ctx.beginPath(); ctx.arc(p[0], p[1], hot ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = hot ? "#ff8800" : "#fff"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(["TL", "TR", "BR", "BL"][k], p[0] + (k === 1 || k === 2 ? 18 : -18), p[1] + (k >= 2 ? 14 : -14));
      });
    }
  });
  ctx.restore();
}
