// [VANTA] мост + панель одним куском — один изолированный мир, прямые вызовы
(() => {
    let key = '';
    try { chrome.storage.local.get(['vanta_key'], r => { key = r.vanta_key || ''; }); } catch (e) {}

    // ================= мост (ждём редактор) =================
    let B = null;
    function buildBridge() {
        const gp = window.gp;
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
        return {
            spawn, snapshot,
            deleteById(p) { let n = 0; (gp.list || []).slice().forEach(b => { if (!b) return; if (String(b.id || '').startsWith(p)) { try { if (typeof gp.deleteShape === 'function') gp.deleteShape(b); } catch (e) {} try { if (b.g && b.g.parent) b.g.parent.removeChild(b.g); } catch (e) {} n++; } }); return { deleted: n }; },
            paint(p, c) { let n = 0; (gp.list || []).forEach(b => { if (!b || !String(b.id || '').startsWith(p)) return; b.shapes.forEach(s => { try { if (s.setColor) s.setColor(c); else if (s.g) s.g.tint = c; } catch (e) {} }); n++; }); return { painted: n }; },
            camera(x, y) { const g = gp.gWorld, s = g.scale.x; g.x = innerWidth / 2 - x * s; g.y = innerHeight / 2 - y * s; return { ok: true }; }
        };
    }

    // ================= панель =================
    function buildPanel() {
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
        #vantaModel { background:#0a0c10; color:#8fbf92; border:1px solid #3a5; border-radius:6px;
            padding:6px 8px; font:10px monospace; width:calc(100% - 16px); box-sizing:border-box; margin:0 8px 4px; display:block; }
        `;
        document.documentElement.appendChild(st);

        const panel = document.createElement('div');
        panel.id = 'vantaPanel';
        panel.innerHTML = `
            <div id="vantaHead"><span>VANTA · агент (OpenRouter)</span><b id="vantaX">×</b></div>
            <div id="vantaKeyRow"><input id="vantaKey" type="password" placeholder="ключ sk-or-v1-… (openrouter.ai/keys)">
                <button id="vantaSave" style="background:#143;color:#9fe6a0;border:1px solid #2e4;border-radius:6px;padding:7px 10px;cursor:pointer;font:11px monospace">ok</button></div>
            <select id="vantaModel">
                <option value="deepseek/deepseek-chat-v3.1:free">DeepSeek V3.1 (free)</option>
                <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (free)</option>
                <option value="qwen/qwen3-coder:free">Qwen3 Coder (free)</option>
                <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (free)</option>
                <option value="anthropic/claude-3.7-sonnet">Claude 3.7 Sonnet (платно)</option>
                <option value="openai/gpt-4o">GPT-4o (платно)</option>
            </select>
            <div id="vantaLog"></div>
            <div id="vantaIn"><input id="vantaCmd" placeholder="построй домик с деревом…">
                <button id="vantaGo">▶</button></div>
        `;
        document.body.appendChild(panel);

        const $ = id => document.getElementById(id);
        const logBox = $('vantaLog'), cmd = $('vantaCmd'), keyRow = $('vantaKeyRow'), modelSel = $('vantaModel');
        try { const saved = localStorage.getItem('vanta_model'); if (saved) modelSel.value = saved; } catch (e) {}
        modelSel.addEventListener('change', () => { try { localStorage.setItem('vanta_model', modelSel.value); } catch (e) {} });
        if (key) keyRow.style.display = 'none';

        function log(m, cls) {
            const d = document.createElement('div');
            d.className = cls || 'a';
            d.textContent = m;
            logBox.appendChild(d);
            logBox.scrollTop = 1e6;
        }
        $('vantaSave').onclick = () => {
            key = $('vantaKey').value.trim();
            if (!key.startsWith('sk-or-')) return log('ключ OpenRouter начинается с sk-or-…', 'e');
            try { chrome.storage.local.set({ vanta_key: key }); } catch (e) {}
            keyRow.style.display = 'none';
            log('ключ сохранён — пиши задачу', 'i');
        };
        $('vantaX').onclick = () => panel.style.display = 'none';

        (() => {
            let dx = 0, dy = 0, drag = false;
            $('vantaHead').addEventListener('mousedown', e => { drag = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop; e.preventDefault(); });
            document.addEventListener('mousemove', e => { if (drag) { panel.style.left = (e.clientX - dx) + 'px'; panel.style.top = (e.clientY - dy) + 'px'; panel.style.right = 'auto'; } });
            document.addEventListener('mouseup', () => drag = false);
        })();

        const SYSTEM = `Ты — агент-строитель в редакторе 2D-физики brofist.io. Мир: координаты, экран ~1700x900 при scale 1, объекты — цветные прямоугольники и круги.
Отвечай ТОЛЬКО JSON-массивом из 1-5 действий (без markdown, без пояснений):
[{"op":"spawn","shape":"rect|ball","x":0,"y":0,"w":100,"h":40,"r":24,"color":"0xRRGGBB","mass":0},
 {"op":"delete","idPrefix":"начало-id"},
 {"op":"paint","idPrefix":"...","color":"0x..."},
 {"op":"camera","x":0,"y":0},
 {"op":"done","why":"готово"}]
Стратегия: строй цельно (фундамент→стены→крыша), используй snapshot для координат, не ставь объекты в одну точку. mass=1 — падает, mass=0 — висит.`;

        async function think(goal, world, history) {
            const messages = [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: 'ЗАДАЧА: ' + goal + '\n\nТЕКУЩИЙ МИР: ' + JSON.stringify(world) }
            ];
            history.slice(-8).forEach(h => messages.push({ role: h.role, content: h.text }));
            messages.push({ role: 'user', content: 'Верни следующие 1-5 действий (JSON-массив) или [{"op":"done"}]. Не дублируй поставленное.' });
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                body: JSON.stringify({ model: modelSel.value, messages, temperature: 0.2, max_tokens: 2000 })
            });
            const j = await res.json();
            if (j.error) throw new Error(j.error.message || 'ошибка OpenRouter');
            return (((j.choices || [])[0] || {}).message || {}).content ? j.choices[0].message.content.replace(/```json|```/g, '').trim() : '';
        }
        function parseOps(txt) {
            const m = txt.match(/\[[\s\S]*\]/);
            const ops = JSON.parse(m ? m[0] : txt);
            return Array.isArray(ops) ? ops : [ops];
        }
        const mkp = o => Object.assign({ x: 0, y: 0, angle: 0, radius: 0, alpha: 1, id: '', collision: true, color: '0x333333', fontSize: '', text: '', make: 3, type: 1 }, o);

        async function run(goal) {
            if (!B) { log('мост ещё не готов — подожди пару секунд', 'e'); return; }
            let world;
            try { world = B.snapshot(); } catch (e) { log('снапшот: ' + e.message, 'e'); return; }
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
                                ? mkp({ width: op.r * 2, height: op.r * 2, radius: op.r, color: op.color || '0x888888' })
                                : mkp({ width: op.w || 100, height: op.h || 40, color: op.color || '0x666666' });
                            const r = B.spawn({ x: op.x, y: op.y, angle: 0, mass: op.mass || 0, id: '', shapes: [sh] });
                            log('spawn @' + op.x + ',' + op.y + (r.ok ? ' ✓' : ' ✗'), 'a');
                        }
                        else if (op.op === 'delete') { const r = B.deleteById(op.idPrefix || ''); log('delete ' + r.deleted, 'a'); }
                        else if (op.op === 'paint') { B.paint(op.idPrefix || '', op.color); log('paint ok', 'a'); }
                        else if (op.op === 'camera') { B.camera(op.x, op.y); }
                        else if (op.op === 'done') { log('ГОТОВО: ' + (op.why || ''), 'a'); return; }
                    } catch (e) { log('руки: ' + e.message, 'e'); }
                }
                world = B.snapshot();
                history.push({ role: 'user', text: 'РЕЗУЛЬТАТ ШАГА: ' + JSON.stringify(world).slice(0, 1500) });
            }
            log('25 шагов исчерпано', 'e');
        }

        function handle(text) {
            if (!text.trim()) return;
            if (!key) { log('сначала ключ sk-or-… (openrouter.ai/keys — бесплатно)', 'e'); return; }
            log('» ' + text, 'u');
            run(text);
        }
        $('vantaGo').onclick = () => { const v = cmd.value; cmd.value = ''; handle(v); };
        cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = cmd.value; cmd.value = ''; handle(v); } });

        log('VANTA готова. Ключ → ok → модель → задача.', 'i');
    }

    // ---- старт ----
    (function boot(tries) {
        if (window.gp && window.gp.gWorld && window.editor) {
            B = buildBridge();
            buildPanel();
            console.log('%c[VANTA] мост + панель готовы', 'color:#0a0');
            return;
        }
        if (tries > 240) return console.warn('[VANTA] редактор так и не прогрузился');
        setTimeout(() => boot(tries + 1), 250);
    })(0);
})();