// [VANTA ext] авто-мост: ставится в редактор, отвечает агенту через postMessage
(function wait(tries) {
    if (window.gp && window.gp.gWorld && window.editor) return inject();
    if (tries > 200) return console.warn('[VANTA ext] редактор не прогрузился');
    setTimeout(() => wait(tries + 1), 250);
})(0);

function inject() {
    if (window.__VANTA_BRIDGE) return;
    const gp = window.gp;
    const mk = o => Object.assign({ x: 0, y: 0, angle: 0, radius: 0, alpha: 1, id: '', collision: true, color: '0x333333', fontSize: '', text: '', make: 3, type: 1 }, o);
    function spawn(spec) {
        const before = new Set(gp.list || []);
        let nb = null;
        try { nb = gp.createShape(spec, gp); } catch (e) {}
        if (!nb) nb = (gp.list || []).find(x => x && !before.has(x)) || null;
        if (nb && window.editor && typeof window.editor.attachInteraction === 'function') { try { window.editor.attachInteraction(nb); } catch (e) {} }
        return nb ? { ok: true, id: String(nb.id || ''), x: Math.round(nb.getX ? nb.getX() : nb.x), y: Math.round(nb.getY ? nb.getY() : nb.y) } : { ok: false };
    }
    function kindOf(b) {
        const id = String(b.id || '');
        if ((b.shapes || []).some(s => /^leaver:/.test(s.id || ''))) return 'lever';
        if ((b.shapes || []).some(s => /^button:/.test(s.id || ''))) return 'button';
        if (/^gate/.test(id)) return 'gate';
        if (/^door/.test(id)) return 'door';
        if (/^platform/.test(id)) return 'platform';
        if ((b.shapes || []).some(s => s.id === 'spawn')) return 'spawn';
        if ((b.shapes || []).some(s => String(s.id || '').startsWith('checkpoint'))) return 'checkpoint';
        if ((b.shapes || []).some(s => s.type === 3)) return 'text';
        return b.shapes[0] && b.shapes[0].radius ? 'ball' : 'rect';
    }
    function snapshot() {
        const out = [];
        (gp.list || []).forEach(b => {
            if (!b || !b.shapes) return;
            const x = b.getX ? b.getX() : b.x, y = b.getY ? b.getY() : b.y;
            const s0 = b.shapes[0] || {};
            out.push({ id: String(b.id || '').slice(0, 24), kind: kindOf(b), x: Math.round(x), y: Math.round(y),
                w: Math.round(s0.width || (s0.radius || 10) * 2), h: Math.round(s0.height || (s0.radius || 10) * 2),
                color: s0.getColor ? s0.getColor() : (s0.color || '') });
        });
        return { count: out.length, bodies: out.slice(0, 150) };
    }
    window.__VANTA_BRIDGE = {
        spawn, snapshot,
        deleteById(p) { let n = 0; (gp.list || []).slice().forEach(b => { if (!b) return; if (String(b.id || '').startsWith(p)) { try { if (typeof gp.deleteShape === 'function') gp.deleteShape(b); } catch (e) {} try { if (b.g && b.g.parent) b.g.parent.removeChild(b.g); } catch (e) {} n++; } }); return { deleted: n }; },
        paint(p, c) { let n = 0; (gp.list || []).forEach(b => { if (!b || !String(b.id || '').startsWith(p)) return; b.shapes.forEach(s => { try { if (s.setColor) s.setColor(c); else if (s.g) s.g.tint = c; } catch (e) {} }); n++; }); return { painted: n }; },
        camera(x, y) { const g = gp.gWorld, s = g.scale.x; g.x = innerWidth / 2 - x * s; g.y = innerHeight / 2 - y * s; return { ok: true }; },
        view() { const g = gp.gWorld; return { camX: Math.round(g.x), camY: Math.round(g.y), scale: +g.scale.x.toFixed(2) }; }
    };
    window.addEventListener('message', e => {
        const d = e.data || {};
        if (!d.__vantaExt) return;
        const B = window.__VANTA_BRIDGE;
        if (!B) { e.source.postMessage({ __vantaBack: true, rid: d.rid, r: { ok: false, err: 'bridge not ready' } }, '*'); return; }
        let r = { ok: false };
        try {
            if (d.op === 'spawn') r = B.spawn(d.spec);
            else if (d.op === 'snapshot') r = B.snapshot();
            else if (d.op === 'delete') r = B.deleteById(d.prefix);
            else if (d.op === 'paint') r = B.paint(d.prefix, d.color);
            else if (d.op === 'camera') r = B.camera(d.x, d.y);
            else if (d.op === 'view') r = B.view();
        } catch (err) { r = { ok: false, err: String(err) }; }
        e.source.postMessage({ __vantaBack: true, rid: d.rid, r }, '*');
    });
    try { window.parent.postMessage({ __vantaExtReady: true }, '*'); } catch (e) {}
    console.log('%c[VANTA ext] мост установлен', 'color:#0a0');
}