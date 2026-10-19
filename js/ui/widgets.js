// Элементы интерфейса. Раскладка общая для всех пресетов, стиль — из Pal.current и CSS-переменных:
// «Блоки» — объёмные блоки и тонкие серые рамки, неон — светящиеся контуры. Размеры — для ширины 720.
import { Pal, PRESETS, STAGE_COLORS } from "../palette.js";
import { Color } from "../color.js";
import { Icon, iconCanvas, drawIcon } from "../icons.js";
import { drawBlock } from "../blocks.js";
import { Sfx } from "../audio.js";
import { Save } from "../save.js";
import { Difficulty } from "../core/config.js";
import { fmtTime } from "../format.js";

// Элемент с классом и детьми.
export function h(tag, cls = "", ...children) {
	const el = document.createElement(tag);
	if (cls) el.className = cls;
	for (const c of children) {
		if (c === null || c === undefined || c === false) continue;
		el.append(c instanceof Node ? c : String(c));
	}
	return el;
}

export function label(text, size = 28, color = null, align = "left", weight = 700) {
	const el = h("div", "label", text);
	el.style.fontSize = size + "px";
	el.style.fontWeight = Math.min(weight, 700);
	el.style.textAlign = align;
	if (color) el.style.color = color instanceof Color ? color.css() : color;
	return el;
}

// Крупный заголовок с неоновым свечением цвета color.
export function displayLabel(text, size, color = null) {
	const el = label(text, size, color, "center", 700);
	el.classList.add("display");
	glow(el, color ?? Pal.current.text, size);
	return el;
}

// Свечение текста.
export function glow(el, color, size) {
	const g = Pal.current.glow;
	if (g <= 0) return;
	const c = color instanceof Color ? color : Pal.current.text;
	el.style.textShadow = `0 0 ${Math.max(4, size * 0.28 * g)}px ${c.css(0.55 * g)}`;
}

// Мелкая подпись капслоком с разрядкой.
export function capsLabel(text, size = 21, color = null, align = "left") {
	const el = label(text.toUpperCase(), size, color ?? Pal.current.muted, align, 700);
	el.classList.add("caps");
	return el;
}

export function caption(text) {
	return capsLabel(text, 19, null, "center");
}

export function header(text) {
	return capsLabel(text, 20, Pal.current.accent);
}

function clickSound(el, sound = "ui") {
	el.addEventListener("click", () => Sfx.play(sound));
}

// Главная кнопка. «Блоки» — объёмный блок цвета этапа, неон — светящаяся «таблетка».
export function pillButton(text, callback, size = 30, secondary = false) {
	const b = h("button", "pill" + (secondary ? " secondary" : ""), text.toUpperCase());
	b.style.fontSize = size + "px";
	b.style.height = Math.round(size * 2.6) + "px";
	b.style.minWidth = (secondary ? 200 : 300) + "px";
	b.style.padding = `0 ${Math.round(size * 1.3)}px`;
	clickSound(b);
	b.addEventListener("click", () => callback());
	return b;
}

// Простая кнопка-контур.
export function plainButton(text, callback, size = 28, height = 84) {
	const b = h("button", "plain", text);
	b.style.fontSize = size + "px";
	b.style.height = height + "px";
	clickSound(b);
	b.addEventListener("click", () => callback());
	return b;
}

// Круглая кнопка с иконкой: пауза и сброс в шапке, разделы в меню.
export function roundButton(kind, callback, px = 88) {
	const b = h("button", "round");
	b.style.width = b.style.height = px + "px";
	const inner = px - 6 - (px - 6) * 0.56;
	b.append(iconCanvas(kind, inner, Pal.current.text.css(), Pal.current.bg.css()));
	clickSound(b);
	b.addEventListener("click", () => callback());
	return b;
}

// Круглая кнопка режима (лопата / флаг); активная обведена акцентом.
export function modeButton(kind, callback) {
	const b = h("button", "mode");
	const px = 88;
	const pal = Pal.current;
	const inner = (px - 6) * 0.46;
	let col = pal.text;
	if (kind === Icon.FLAG) col = pal.danger;
	const normal = iconCanvas(kind, inner, col.css());
	b.append(normal);
	// В неоне активная лопата — цвета акцента.
	let active = null;
	if (kind !== Icon.FLAG && !pal.isBlocks()) {
		active = iconCanvas(kind, inner, pal.accent.css(), null, "icon active-icon");
		b.append(active);
	}
	clickSound(b, "mode");
	b.addEventListener("click", () => callback());
	b.setActive = (on) => b.classList.toggle("active", on);
	return b;
}

// Кнопка Раскрытия: синий блок с белым глазом или светящийся контурный квадрат с глазом-контуром.
export function echoButton(callback, px = 104) {
	const b = h("button", "echo");
	b.style.width = b.style.height = px + "px";
	const c = document.createElement("canvas");
	b.append(c);
	b.pressedState = false;
	b.disabledState = false;
	b.redraw = () => {
		const pal = Pal.current;
		const scale = Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
		const pad = 16;
		const size = px + pad * 2;
		c.width = Math.ceil(size * scale);
		c.height = Math.ceil(size * scale);
		c.style.width = c.style.height = size + "px";
		c.style.margin = `-${pad}px`;
		const g = c.getContext("2d");
		g.setTransform(scale, 0, 0, scale, 0, 0);
		g.clearRect(0, 0, size, size);
		g.translate(pad, pad);
		const r = { x: 6, y: 6, w: px - 12, h: px - 12 };
		const a = b.disabledState ? 0.4 : 1;
		if (b.pressedState) {
			for (let k = 0; k < 3; k++) {
				const grow = 3 + k * 4;
				g.strokeStyle = pal.mana.css((0.22 - k * 0.06) * 0.9);
				g.lineWidth = 3;
				g.beginPath();
				g.roundRect(r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, 24 + grow);
				g.stroke();
			}
		}
		const ins = r.w * 0.17;
		if (pal.isBlocks()) {
			drawBlock(g, r.x, r.y, r.w, r.h, pal.mana, 1, a);
			drawIcon(g, Icon.ECHO, r.x + ins, r.y + ins, r.w - ins * 2, r.h - ins * 2, `rgba(255,255,255,${a})`, pal.mana.lerp(Color.hex("ffffff"), 0.06).css());
			return;
		}
		g.beginPath();
		g.roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 24.5);
		if (b.pressedState) {
			g.fillStyle = pal.mana.css(0.16);
			g.fill();
		}
		g.strokeStyle = pal.mana.css(a);
		g.lineWidth = 3;
		g.stroke();
		drawIcon(g, Icon.ECHO, r.x + ins, r.y + ins, r.w - ins * 2, r.h - ins * 2, pal.mana.css(a));
	};
	b.setPressed = (on) => {
		b.pressedState = on;
		b.redraw();
	};
	b.setDisabled = (on) => {
		if (b.disabledState === on) return;
		b.disabledState = on;
		b.classList.toggle("disabled", on);
		b.redraw();
	};
	b.addEventListener("click", () => callback());
	b.redraw();
	return b;
}

// Полоса-шкала: жёлоб с рамкой, заливка; мана — цвет маны и риски через step.
export function meterBar({ mana = false, max = 100, step = 0 } = {}) {
	const el = h("div", "meter" + (mana ? " mana" : ""));
	const fill = h("div", "meter-fill");
	el.append(fill);
	el.max = max;
	el.value = 0;
	const ticks = h("div", "meter-ticks");
	el.append(ticks);
	el.setStep = (s) => {
		ticks.innerHTML = "";
		if (s <= 0) return;
		const segs = Math.round(el.max / s);
		for (let k = 1; k < segs; k++) {
			const t = h("i");
			t.style.left = (100 * k) / segs + "%";
			ticks.append(t);
		}
	};
	el.setValue = (v, animate = true) => {
		el.value = v;
		fill.style.transition = animate ? "width 0.35s cubic-bezier(0.33, 1, 0.68, 1)" : "none";
		fill.style.width = Math.max(0, Math.min(1, v / Math.max(el.max, 1))) * 100 + "%";
		fill.classList.toggle("empty", v <= 0);
	};
	el.setStep(step);
	el.setValue(0, false);
	return el;
}

// Ячейка карточки статистики: иконка, крупное значение, подпись капслоком.
export function statCell(kind, iconColor, captionText, valueColor) {
	const v = h("div", "stat");
	v.append(iconCanvas(kind, 34, iconColor.css(), Pal.current.bg.css()));
	const value = label("0", 50, valueColor, "center", 700);
	value.classList.add("stat-value");
	if (!Pal.current.isBlocks()) glow(value, valueColor, 50);
	v.append(value);
	const cap = capsLabel(captionText, 19, null, "center");
	v.append(cap);
	value.caption = cap;
	return { el: v, value };
}

// Карточка режима в меню: название, описание, рекорд справа. Последний выбранный режим обведён.
export function modeCard(title, desc, record, recordCaption, highlighted, callback) {
	const b = h("button", "mode-card" + (highlighted ? " highlighted" : ""));
	const left = h("div", "mc-left", h("div", "mc-title", title.toUpperCase()), h("div", "mc-desc", desc));
	const right = h("div", "mc-right", h("div", "mc-record", record), h("div", "mc-cap", recordCaption.toUpperCase()));
	b.append(left, right);
	clickSound(b);
	b.addEventListener("click", () => callback());
	return b;
}

// Строка сложности «Классики»: превью поля, название, размер и мины, шкала ступени, рекорд.
export function diffRow(index, best, selected, callback) {
	const pal = Pal.current;
	const blocks = pal.isBlocks();
	const d = Difficulty.info(index);
	const col = blocks ? pal.classicColors[index] : pal.accent;
	const b = h("button", "diff-row" + (selected ? " selected" : ""));
	b.style.setProperty("--row-color", col.css());
	const box = 92;
	const c = document.createElement("canvas");
	const scale = Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
	c.width = c.height = Math.ceil(box * scale);
	c.style.width = c.style.height = box + "px";
	const g = c.getContext("2d");
	g.setTransform(scale, 0, 0, scale, 0, 0);
	const p = Math.min((box - 6) / d.w, (box - 6) / d.h);
	const ox = (box - d.w * p) / 2;
	const oy = (box - d.h * p) / 2;
	for (let y = 0; y < d.h; y++) {
		for (let x = 0; x < d.w; x++) {
			const cc = blocks
				? col.lerp((x + y) % 2 === 0 ? Color.hex("ffffff") : Color.hex("000000"), 0.12)
				: pal.hiddenAt((x / Math.max(d.w - 1, 1) + y / Math.max(d.h - 1, 1)) * 0.5);
			g.fillStyle = cc.css(1);
			g.fillRect(ox + x * p, oy + y * p, p - 0.8, p - 0.8);
		}
	}
	const steps = h("div", "dr-steps");
	for (let k = 0; k < Difficulty.count(); k++) steps.append(h("i", k <= index ? "on" : ""));
	const mid = h("div", "dr-mid",
		h("div", "dr-name", d.name.toUpperCase()),
		h("div", "dr-meta", `${d.w}×${d.h} · ${d.mines} мин · ${Difficulty.densityText(index)}%`),
		steps);
	const right = h("div", "dr-right", h("div", "dr-best", best >= 0 ? fmtTime(best) : "—"), h("div", "dr-cap", "РЕКОРД"));
	b.append(c, mid, right);
	clickSound(b, "mode");
	b.addEventListener("click", () => callback());
	return b;
}

// Переключатель вкладок-«таблетка».
export function tabs(names, index, onChange) {
	const el = h("div", "tabs");
	const items = names.map((n, k) => {
		const t = h("button", "tab" + (k === index ? " on" : ""), n.toUpperCase());
		t.addEventListener("click", () => {
			if (k === el.selected) return;
			el.selected = k;
			items.forEach((it, j) => it.classList.toggle("on", j === k));
			Sfx.play("mode");
			onChange(k);
		});
		return t;
	});
	el.selected = index;
	el.append(...items);
	return el;
}

// Чип-фильтр (сложность в рекордах).
export function chip(text, callback) {
	const b = h("button", "chip", text.toUpperCase());
	clickSound(b, "mode");
	b.addEventListener("click", () => callback());
	b.setActive = (on) => b.classList.toggle("on", on);
	return b;
}

// Переключатель «вкл/выкл» с подписью на всю ширину.
export function toggle(text, on, onChange, size = 28) {
	const el = h("label", "toggle");
	el.style.fontSize = size + "px";
	const input = h("input");
	input.type = "checkbox";
	input.checked = on;
	input.addEventListener("change", () => {
		Sfx.play("mode");
		onChange(input.checked);
	});
	el.append(h("span", "toggle-text", text), input, h("span", "switch"));
	return el;
}

// Ползунок с подписью и значением справа.
export function slider(text, min, max, step, value, format, onInput, onCommit = null) {
	const box = h("div", "slider-row");
	const val = label("", 26, Pal.current.muted, "right");
	const head = h("div", "slider-head", label(text, 26), val);
	const input = h("input", "slider");
	input.type = "range";
	input.min = min;
	input.max = max;
	input.step = step;
	input.value = value;
	const show = () => {
		val.textContent = format(Number(input.value));
		input.style.setProperty("--fill", ((Number(input.value) - min) / (max - min)) * 100 + "%");
	};
	input.addEventListener("input", () => {
		show();
		onInput(Number(input.value));
	});
	input.addEventListener("change", () => onCommit?.(Number(input.value)));
	show();
	box.append(head, input);
	box.input = input;
	return box;
}

// Образец пресета в «Оформлении».
export function swatch(id, selected, callback) {
	const b = h("button", "swatch" + (selected ? " selected" : ""));
	const p = PRESETS[id];
	const w = 104;
	const c = document.createElement("canvas");
	const scale = Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
	c.width = Math.ceil(w * scale);
	c.height = Math.ceil(70 * scale);
	c.style.width = w + "px";
	c.style.height = "70px";
	const g = c.getContext("2d");
	g.setTransform(scale, 0, 0, scale, 0, 0);
	const cy = 44;
	if ((p.style ?? "neon") === "blocks") {
		for (let k = 0; k < 5; k++) drawBlock(g, w / 2 - 45 + k * 18, cy - 8, 16, 16, Color.hex(STAGE_COLORS[k]));
	} else {
		const grad = g.createLinearGradient(w / 2 - 38, 0, w / 2 + 38, 0);
		grad.addColorStop(0, "#" + p.hidden_a);
		grad.addColorStop(1, "#" + p.hidden_b);
		g.fillStyle = grad;
		g.fillRect(w / 2 - 38, cy - 16, 76, 32);
	}
	b.append(c, h("div", "swatch-name", p.name));
	b.addEventListener("click", () => callback());
	return b;
}

// «САПЁР» из блоков пяти цветов этапов — заголовок меню в стиле «Блоки».
export function blockTitle(word = "САПЁР") {
	const w = 560;
	const hgt = 124;
	const c = document.createElement("canvas");
	const scale = Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
	c.width = Math.ceil(w * scale);
	c.height = Math.ceil(hgt * scale);
	c.style.width = w + "px";
	c.style.height = hgt + "px";
	c.className = "block-title";
	const g = c.getContext("2d");
	g.setTransform(scale, 0, 0, scale, 0, 0);
	const n = word.length;
	const s = 104;
	const gap = 8;
	const x0 = (w - (s * n + gap * (n - 1))) / 2;
	g.font = "700 64px Oswald, sans-serif";
	g.textAlign = "center";
	g.textBaseline = "alphabetic";
	const base = (s + (1.193 - 0.289) * 64) / 2;
	for (let k = 0; k < n; k++) {
		const x = x0 + k * (s + gap);
		const y = (hgt - s) / 2;
		drawBlock(g, x, y, s, s, Color.hex(STAGE_COLORS[k % 5]));
		g.fillStyle = "rgba(0,0,0,0.35)";
		g.fillText(word[k], x + s / 2, y + base + 4);
		g.fillStyle = "#fff";
		g.fillText(word[k], x + s / 2, y + base);
	}
	return c;
}

// Короткое «подпрыгивание» элемента HUD.
export function bump(el) {
	el.classList.remove("bump");
	void el.offsetWidth;
	el.classList.add("bump");
}

export function vibrate(ms) {
	if (Save.settings.vibration && navigator.vibrate) {
		try {
			navigator.vibrate(ms);
		} catch {
			// Браузер может запретить вибрацию без жеста — не страшно.
		}
	}
}

// Корневой контейнер экрана с полями по краям.
export function screenRoot(parent, margin = 24, gap = 16) {
	const v = h("div", "screen-root");
	v.style.padding = `${margin}px`;
	v.style.gap = gap + "px";
	parent.append(v);
	return v;
}

export { Icon };
