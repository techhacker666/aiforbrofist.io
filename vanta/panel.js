// [VANTA] панель-агент прямо в редакторе: Gemini-мозг, лог, ввод
(() => {
    const MODEL = 'gemini-2.0-flash';
    let key = '';

    try { chrome.storage.local.get(['vanta_key'], r => { key = r.vanta_key || ''; if (key) setup.hidden(); }); } catch (e) {}

    // ---- стили ----
    const st = document.createElement('style');
    st.textContent = `
    #vantaPanel { position:fixed; right:10px; top:10px; z-index:999999; width:340px;
        background:rgba(12,14,18,.95); border:1px solid #2e4; border-radius:10px;
        font-family:monospace; color:#dfe; box-shadow:0 6px 24px rgba(0,0,0,.6); }
    #vantaHead { padding:8px 12px; color:#9fe6a0; font-size:12px; cursor:move; user-select:none;
        display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #233; }
    #vantaHead b { cursor:pointer; color:#e6a09f; }
    #vantaLog { max-height:200px; overflow-y:auto; padding:6px 12px; font-size:11px; line-height:1.5; }
    #vantaLog .u { color:#cfe8d2; margin-top:5px; }
    #vantaLog .a { color:#8fbf92; }
    #vantaLog .e { color:#e6a09f; }
    #vantaLog .i { color:#6a8f6f; }
    #vantaIn { display:flex; gap:6px; padding:8px; }
    #vantaCmd { flex:1; background:#0a0c10; color:#dfe; border:1px solid #3a5; border-radius:6px;
        padding:7px; font:12px monospace; outline:none; }
    #vantaGo { background:#143; color:#9fe6a0; border:1px solid #2e4; border-radius:6px;
        padding:0 12px; cursor:pointer; font:12px monospace; }
    #vantaKeyRow { display:flex; gap:6px; padding:8px; }
    #vantaKey { flex:1; background:#0a0c10; color:#dfe; border:1px solid #3a5; border-radius:6px;
        padding:7px; font:12px monospace; outline:none; }
    `;
    document.documentElement.appendChild(st);

    // ---- каркас ----
    const panel = document.createElement('div');
    panel.id = 'vantaPanel';
    panel.innerHTML = `
        <div id="vantaHead"><span>VANTA · агент</span><b id="vantaX">×</b></div>
        <div id="vantaKeyRow"><input id="vantaKey" type="password" placeholder="Gemini ключ (AIza…)">
            <button id="vantaSave" style="background:#143;color:#9fe6a0;border:1px solid #2e4;border-radius:6px;padding:7px 10px;cursor:pointer;font:11px monospace">ok</button></div>
        <div id="vantaLog"></div>
        <div id="vantaIn"><input id="vantaCmd" placeholder="построй домик с деревом…">
            <button id="vantaGo">▶</button></div>
    `;
    document.body.appendChild(panel);

    const $ = id => document.getElementById(id);
    const logBox = $('vantaLog'), cmd = $('vantaCmd'), keyRow = $('vantaKeyRow');

    function log(m, cls) {
        const d = document.createElement('div');
        d.className = cls || 'a';
        d.textContent = m;
        logBox.appendChild(d);
        logBox.scrollTop = 1e6;
    }
    const setup = { hidden() { keyRow.style.display = 'none'; } };
    $('vantaSave').onclick = () => {
        key = $('vantaKey').value.trim();
        if (!key.startsWith('AIza')) return log('ключ Gemini начинается с AIza… (aistudio.google.com → Get API key)', 'e');
        try { chrome.storage.local.set({ vanta_key: key }); } catch (e) {}
        keyRow.style.display = 'none';
        log('ключ сохранён — пиши задачу', 'i');
    };
    $('vantaX').onclick = () => panel.style.display = 'none';

    // перетаскивание
    (() => {
        let dx = 0, dy = 0, drag = false;
        $('vantaHead').addEventListener('mousedown', e => { drag = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop; e.preventDefault(); });
        document.addEventListener('mousemove', e => { if (drag) { panel.style.left = (e.clientX - dx) + 'px'; panel.style.top = (e.clientY - dy) + 'px'; panel.style.right = 'auto'; } });
        document.addEventListener('mouseup', () => drag = false);
    })();

    // ---- канал к мосту (мост в том же окне слушает message) ----
    let rid = 0;
    const pending = new Map();
    function rpc(op, extra) {
        return new Promise((resolve, reject) => {
            const id = ++rid;
            pending.set(id, { resolve, reject });
            window.postMessage(Object.assign({ __vantaCmd: true, rid: id, op }, extra), '*');
            setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('мост не отвечает')); } }, 5000);
        });
    }
    window.addEventListener('message', e => {
        const d = e.data || {};
        if (e.source !== window || !d.__vantaBack) return;
        const p = pending.get(d.rid);
        if (p) { pending.delete(d.rid); p.resolve(d.r); }
    });

    // ---- Gemini ----
    const SYSTEM = `Ты — агент-строитель в редакторе 2D-физики brofist.io. Мир: координаты, экран ~1700x900 при scale 1, объекты — цветные прямоугольники и круги.
Отвечай ТОЛЬКО JSON-массивом из 1-5 действий (без markdown, без пояснений):
[{"op":"spawn","shape":"rect|ball","x":0,"y":0,"w":100,"h":40,"r":24,"color":"0xRRGGBB","mass":0},
 {"op":"delete","idPrefix":"начало-id"},
 {"op":"paint","idPrefix":"...","color":"0x..."},
 {"op":"camera","x":0,"y":0},
 {"op":"done","why":"готово"}]
Стратегия: строй цельно (фундамент→стены→крыша), используй snapshot мира для координат, не ставь объекты в одну точку. mass=1 — падает, mass=0 — висит.`;

    async function think(goal, world, history) {
        const contents = [{ role: 'user', parts: [{ text: SYSTEM + '\n\nЗАДАЧА: ' + goal + '\n\nТЕКУЩИЙ МИР: ' + JSON.stringify(world) }] }];
        history.slice(-8).forEach(h => contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] }));
        contents.push({ role: 'user', parts: [{ text: 'Верни следующие 1-5 действий (JSON-массив) или [{"op":"done"}] если построено. Не дублируй уже поставленное.' }] });
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, maxOutputTokens: 2000 } })
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error.message);
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        return parts.map(p => p.text || '').join('').replace(/```json|```/g, '').trim();
    }
    function parseOps(txt) {
        const m = txt.match(/\[[\s\S]*\]/);
        const ops = JSON.parse(m ? m[0] : txt);
        return Array.isArray(ops) ? ops : [ops];
    }
    function mk(o) { return Object.assign({ x: 0, y: 0, angle: 0, radius: 0, alpha: 1, id: '', collision: true, color: '0x333333', fontSize: '', text: '', make: 3, type: 1 }, o); }

    async function run(goal) {
        let world;
        try { world = await rpc('snapshot'); }
        catch (e) { return log(e.message, 'e'); }
        const history = [];
        for (let step = 1; step <= 25; step++) {
            log('шаг ' + step + '…', 'i');
            let txt;
            try { txt = await think(goal, world, history); }
            catch (e) { return log('мозг: ' + e.message, 'e'); }
            if (!txt) { log('пустой ответ — повтори', 'e'); return; }
            history.push({ role: 'assistant', text: txt });
            let ops;
            try { ops = parseOps(txt); }
            catch (e) { log('не-JSON: ' + txt.slice(0, 150), 'e'); return; }
            for (const op of ops) {
                try {
                    if (op.op === 'spawn') {
                        const sh = op.shape === 'ball'
                            ? mk({ width: op.r * 2, height: op.r * 2, radius: op.r, color: op.color || '0x888888' })
                            : mk({ width: op.w || 100, height: op.h || 40, color: op.color || '0x666666' });
                        const r = await rpc('spawn', { spec: { x: op.x, y: op.y, angle: 0, mass: op.mass || 0, id: '', shapes: [sh] } });
                        log('spawn @' + op.x + ',' + op.y + (r.ok ? ' ✓' : ' ✗'), 'a');
                    }
                    else if (op.op === 'delete') { const r = await rpc('delete', { prefix: op.idPrefix || '' }); log('delete ' + r.deleted, 'a'); }
                    else if (op.op === 'paint') { await rpc('paint', { prefix: op.idPrefix || '', color: op.color }); log('paint ok', 'a'); }
                    else if (op.op === 'camera') { await rpc('camera', { x: op.x, y: op.y }); }
                    else if (op.op === 'done') { log('ГОТОВО: ' + (op.why || ''), 'a'); return; }
                } catch (e) { log('руки: ' + e.message, 'e'); }
            }
            world = await rpc('snapshot');
            history.push({ role: 'user', text: 'РЕЗУЛЬТАТ ШАГА: ' + JSON.stringify(world).slice(0, 1500) });
        }
        log('25 шагов исчерпано', 'e');
    }

    function handle(text) {
        if (!text.trim()) return;
        if (!key) { log('сначала ключ AIza… (aistudio.google.com — бесплатно)', 'e'); return; }
        log('» ' + text, 'u');
        run(text);
    }
    $('vantaGo').onclick = () => { const v = cmd.value; cmd.value = ''; handle(v); };
    cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = cmd.value; cmd.value = ''; handle(v); } });

    log('VANTA активна. Ключ AIza… → ok → пиши задачу.', 'i');
})();