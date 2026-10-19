// Поле на canvas. Неон: закрытые клетки сливаются в скруглённые «острова», открытые разделены
// чёрточками, цифры и иконки светятся. «Блоки»: объёмные блоки цвета этапа. Цвета — Pal.current.
// Плюс «сок»: волна открытия, очки, искры, празднование этапа.
// Жесты: тап, долгий тап, перетаскивание, щипок. Мышь: ЛКМ = тап, ПКМ = флаг, колесо = зум.
import { State } from "./core/board.js";
import { Item, Score, stageConfig } from "./core/config.js";
import { Board } from "./core/board.js";
import { Pal } from "./palette.js";
import { Color, WHITE } from "./color.js";
import { drawIcon, Icon } from "./icons.js";
import { drawBlock, drawSlot } from "./blocks.js";
import { fmtInt } from "./format.js";

export const CELL = 64;
// Зазор между островом и соседними клетками другого типа.
const GAP = 3;
// Зазор между блоками в стиле «Блоки».
const BLOCK_GAP = 2;
const DRAG_THRESHOLD = 14;
const MAX_CELL_PX = 120;
// Клетка мельче этого (в пикселях раскладки) — тапать неудобно: с zoomStart поле открывается с зумом.
const COMFORT_CELL_PX = 48;
const ZOOM_CELL_PX = 64;

// Длительности анимаций, мс.
export const T = {
	REVEAL: 170, NUM_POP: 180, FLAG: 240, SPAWN: 220, HOP: 300, PICKUP: 360, POPUP: 520,
	EXPLODE: 620, LOSS_MINE: 200, ECHO: 200, RING: 280, EXPIRE: 320, FLASH: 380, WAVE: 16, FLAG_WAVE: 30,
};
const MAX_PARTICLES = 220;

const G_OPEN = 0;
const G_HIDDEN = 1;
const G_FLAG = 2;

const FONT = "Oswald, 'Arial Narrow', sans-serif";
// Метрики Oswald: подъём и спуск в долях кегля (для центровки цифр как в Godot-версии).
const ASCENT = 1.193;
const DESCENT = 0.289;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const outBack = (p) => {
	const c1 = 2.2;
	return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const now = () => performance.now();
const rand = (a, b) => a + Math.random() * (b - a);

// Все живые поля: главный цикл кадров вызывает у них frame().
export const liveViews = new Set();

export class BoardView {
	constructor({ interactive = true } = {}) {
		this.el = document.createElement("div");
		this.el.className = "board-view";
		this.canvas = document.createElement("canvas");
		this.el.appendChild(this.canvas);
		this.g = this.canvas.getContext("2d");
		this.board = null;
		this.interactive = interactive;
		this.longPressMs = 350;
		this._highlight = false;
		this.zoomStart = false;
		this._veiled = false;
		this._waitingCell = -1;
		this._showLoss = false;
		// Колбэки экрана.
		this.onTap = null;
		this.onLongPress = null;
		this.onSecondary = null;
		this.onPressed = null;
		this.onZoomChanged = null;

		this.w = 0;
		this.h = 0;
		this.zoom = 1;
		this.minZoom = 1;
		this.maxZoom = 2;
		this.offset = { x: 0, y: 0 };
		this._shakeT0 = -1;
		this._shakePower = 0;
		this._shakeDur = 0;
		this._frame = 0;
		this.anims = new Map();
		this.fx = [];
		this.particles = [];
		this.playerFlags = new Set();
		this.waveEnd = 0;
		this._dirty = true;
		this._hiddenCache = null;
		this._hiddenKey = "";

		this._touches = new Map();
		this._pressId = null;
		this._pressPos = { x: 0, y: 0 };
		this._pressMs = 0;
		this._pressMoved = false;
		this._longFired = false;
		this._pinchDist = 0;
		this._pinchMid = { x: 0, y: 0 };
		this._pressedCell = -1;

		this._ro = new ResizeObserver(() => this._onResize());
		this._ro.observe(this.el);
		if (interactive) this._bindInput();
		this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
		liveViews.add(this);
	}

	destroy() {
		this._ro.disconnect();
		liveViews.delete(this);
	}

	get highlightTargets() {
		return this._highlight;
	}

	set highlightTargets(v) {
		this._highlight = v;
		this._dirty = true;
	}

	get veiled() {
		return this._veiled;
	}

	// Пауза: поле показывается целиком закрытым.
	set veiled(v) {
		this._veiled = v;
		this._dirty = true;
	}

	get waitingCell() {
		return this._waitingCell;
	}

	// Клетка ждёт фоновой генерации поля: мягко пульсирует.
	set waitingCell(v) {
		this._waitingCell = v;
		this._dirty = true;
	}

	get showLoss() {
		return this._showLoss;
	}

	// После проигрыша: показать мины и неверные флаги.
	set showLoss(v) {
		this._showLoss = v;
		this._dirty = true;
	}

	refresh() {
		this._dirty = true;
	}

	_onResize() {
		const w = this.el.clientWidth;
		const h = this.el.clientHeight;
		if (w <= 0 || h <= 0) return;
		const first = this.w === 0;
		this.w = w;
		this.h = h;
		this._resizeCanvas();
		if (first || this.board) this.fitBoard();
	}

	_resizeCanvas() {
		const ps = this._pixelScale();
		this.canvas.width = Math.max(1, Math.round(this.w * ps));
		this.canvas.height = Math.max(1, Math.round(this.h * ps));
		this.canvas.style.width = this.w + "px";
		this.canvas.style.height = this.h + "px";
		this._ps = ps;
		this._dirty = true;
	}

	_pixelScale() {
		return Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
	}

	// После «второго шанса»: мины снова скрыты, поле живое.
	revive() {
		for (const [j, a] of this.anims) if (a.k === "loss") this.anims.delete(j);
		this.showLoss = false;
	}

	setBoard(board) {
		this.board = board;
		this._showLoss = false;
		this.anims.clear();
		this.fx = [];
		this.particles = [];
		this.playerFlags.clear();
		this._shakeT0 = -1;
		this.waveEnd = 0;
		this._hiddenKey = "";
		board.on("revealed", (cells) => this._onRevealed(cells));
		board.on("flag", (i) => this._onFlagChanged(i));
		board.on("itemSpawned", (i) => this._onItemSpawned(i));
		board.on("itemPicked", (i, type) => this._onItemPicked(i, type));
		board.on("itemMoved", (from, to) => this._onItemMoved(from, to));
		board.on("itemExpired", (i, type) => this._onItemExpired(i, type));
		board.on("mineHit", (i) => this._onMineHit(i));
		board.on("mineDefused", (i) => this._onMineDefused(i));
		board.on("cleared", () => this._onCleared());
		this.fitBoard();
	}

	// Небольшое поле для превью оформления: острова, флаги, предметы и все цифры 1–8.
	static demoBoard() {
		const b = new Board(stageConfig(8, 5, 9), 1);
		b.setupMines([0, 1, 9, 6, 7, 15, 33, 34, 35]);
		for (const i of [2, 3, 4, 5, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30, 31]) {
			b.state[i] = State.REVEALED;
		}
		[[18, 1], [19, 2], [20, 3], [21, 4], [28, 5], [29, 6], [30, 7], [31, 8]].forEach(([i, n]) => (b.counts[i] = n));
		b.state[0] = State.FLAGGED;
		b.state[15] = State.CONFIRMED;
		b.items.set(7, Item.CLOCK);
		b.itemLife.set(7, 3);
		b.items.set(34, Item.CLARITY);
		b.itemLife.set(34, 5);
		return b;
	}

	fitBoard() {
		const b = this.board;
		if (!b || this.w <= 0 || this.h <= 0) return;
		const cw = b.width * CELL + 10;
		const ch = b.height * CELL + 10;
		this.minZoom = Math.min(this.w / cw, this.h / ch);
		this.maxZoom = Math.max(this.minZoom, MAX_CELL_PX / CELL);
		this.zoom = this.minZoom;
		if (this.zoomStart && this.canOverview()) {
			this.zoom = clamp(ZOOM_CELL_PX / CELL, this.minZoom, this.maxZoom);
			this.offset.x = (this.w - b.width * CELL * this.zoom) / 2;
			this.offset.y = (this.h - b.height * CELL * this.zoom) / 2;
		}
		this._clampOffset();
		this._dirty = true;
		this.onZoomChanged?.();
	}

	// Поле целиком мельче удобного размера клетки — есть смысл в зуме и кнопке «Обзор».
	canOverview() {
		return !!this.board && CELL * this.minZoom < COMFORT_CELL_PX;
	}

	isZoomed() {
		return this.zoom > this.minZoom * 1.01;
	}

	// «Обзор»: из зума — всё поле, из обзора — удобная клетка вокруг центра.
	toggleOverview() {
		if (!this.board) return;
		const target = this.isZoomed() ? this.minZoom : clamp(ZOOM_CELL_PX / CELL, this.minZoom, this.maxZoom);
		this._zoomAt(target / this.zoom, this.w / 2, this.h / 2);
	}

	cellAt(x, y) {
		const b = this.board;
		if (!b) return -1;
		const lx = (x - this.offset.x) / this.zoom;
		const ly = (y - this.offset.y) / this.zoom;
		if (lx < 0 || ly < 0) return -1;
		const cx = Math.floor(lx / CELL);
		const cy = Math.floor(ly / CELL);
		if (cx >= b.width || cy >= b.height) return -1;
		return cy * b.width + cx;
	}

	// Всплывающая надпись над клеткой. big — крупно, с «ударом» масштаба.
	popupText(index, text, color, t0 = -1, big = false, dy = 0) {
		this.fx.push({ k: "pop", i: index, t0: t0 < 0 ? now() : t0, text, color, big, dy });
		this._dirty = true;
	}

	// Очки за открытие: «+N» у клетки касания; крупнее при большой заливке и длинном комбо.
	showPoints(index, points, cells, combo) {
		const pal = Pal.current;
		const big = cells >= 12 || combo >= 4;
		let color = pal.text;
		if (cells >= 12 || combo >= 3) color = pal.accent2;
		if (combo >= 6) color = pal.danger.lerp(pal.accent2, 0.35);
		// Очки от кликов подряд складываются в одну растущую надпись.
		const t = now();
		for (const f of this.fx) {
			if (f.k === "pop" && f.points !== undefined && t - f.t0 < 350) {
				f.points += points;
				f.i = index;
				f.t0 = t;
				f.text = "+" + fmtInt(f.points);
				f.color = color;
				f.big = f.big || big;
				return;
			}
		}
		this.popupText(index, "+" + fmtInt(points), color, -1, big);
		this.fx[this.fx.length - 1].points = points;
		if (cells >= 12) this.shake(3 + Math.min(cells / 20, 5), 220);
	}

	// Росчерк Раскрытия от точки (координаты этого элемента) к клетке.
	playEcho(index, fromX, fromY) {
		const t = now();
		this.fx.push({ k: "streak", i: index, t0: t, from: { x: (fromX - this.offset.x) / this.zoom, y: (fromY - this.offset.y) / this.zoom } });
		this.fx.push({ k: "ring", i: index, t0: t + T.ECHO });
		this._dirty = true;
	}

	shake(power = 7, duration = 420) {
		this._shakeT0 = now();
		this._shakePower = power;
		this._shakeDur = duration;
	}

	// Ошибка: клетка покачивается и вспыхивает цветом ошибки.
	nudge(index) {
		this.anims.set(index, { k: "nudge", t0: now() });
		this._dirty = true;
	}

	// --- Реакция на события поля ---

	_onRevealed(indices) {
		const t = now();
		let maxDepth = 0;
		const chipsEvery = Math.max(1, Math.ceil(indices.length / 40));
		indices.forEach((i, k) => {
			const d = this.board.revealDepth[i];
			maxDepth = Math.max(maxDepth, d);
			const t0 = t + d * T.WAVE;
			this.anims.set(i, { k: "rev", t0 });
			if (k % chipsEvery === 0) {
				const r = this._cellRect(i);
				this._spawnSparks(r.x + CELL / 2, r.y + CELL / 2, t0, 3, this._hiddenColor(i));
			}
		});
		this.waveEnd = t + maxDepth * T.WAVE;
		this._dirty = true;
	}

	_onFlagChanged(i) {
		if (this.board.isFlag(i)) {
			this.playerFlags.add(i);
			this.anims.set(i, { k: "flag", t0: now() });
		} else {
			this.playerFlags.delete(i);
			this.anims.delete(i);
		}
		this._dirty = true;
	}

	_onItemSpawned(i) {
		this.anims.set(i, { k: "spawn", t0: Math.max(now(), this.waveEnd) + 80 });
	}

	_onItemPicked(i, type) {
		const pal = Pal.current;
		let t0 = now();
		if (this.anims.has(i)) t0 = this.anims.get(i).t0;
		this.fx.push({ k: "pick", i, t0, type });
		if (type === Item.CLOCK) this.popupText(i, `+${Item.CLOCK_SECONDS} с`, pal.accent2, t0 + 120, true);
		else this.popupText(i, `+${Item.CLARITY_MANA} маны`, pal.mana, t0 + 120, true);
	}

	_onItemMoved(from, to) {
		if (to >= 0) this.anims.set(to, { k: "hop", from, t0: now() + 60 });
		this._dirty = true;
	}

	_onItemExpired(i, type) {
		this.fx.push({ k: "expire", i, t0: now(), type });
		this._dirty = true;
	}

	// Раскрытие обезвредило мину: безопасный взрыв цветом маны, числа соседей «подпрыгивают».
	_onMineDefused(i) {
		const t = now();
		this.fx.push({ k: "boom", i, t0: t, safe: true });
		const r = this._cellRect(i);
		this._spawnSparks(r.x + CELL / 2, r.y + CELL / 2, t, 18, Pal.current.mana, 460);
		this.shake(6, 300);
		for (const nb of this.board.neighbors(i)) {
			if (this.board.state[nb] === State.REVEALED) this.anims.set(nb, { k: "recount", t0: t + 120 });
		}
		this._dirty = true;
	}

	_onMineHit(i) {
		const t = now();
		const b = this.board;
		this.fx.push({ k: "boom", i, t0: t });
		const r = this._cellRect(i);
		this._spawnSparks(r.x + CELL / 2, r.y + CELL / 2, t, 26, Pal.current.danger, 520);
		this.shake(14, 520);
		this.showLoss = true;
		for (let j = 0; j < b.cellCount(); j++) {
			if (b.mines[j] === 1 && j !== i && b.state[j] === State.HIDDEN) {
				this.anims.set(j, { k: "loss", t0: t + 120 + b.distance(i, j) * 35 });
			}
		}
	}

	// Этап пройден: флаги волной, вспышка поля, конфетти, тряска и «+4 000» по центру.
	_onCleared() {
		const pal = Pal.current;
		const b = this.board;
		const center = b.indexOf(Math.floor(b.width / 2), Math.floor(b.height / 2));
		const base = Math.max(now(), this.waveEnd) + 80;
		let last = base;
		for (let i = 0; i < b.cellCount(); i++) {
			if (b.mines[i] === 1 && b.state[i] === State.FLAGGED && !this.playerFlags.has(i)) {
				const t0 = base + b.distance(center, i) * T.FLAG_WAVE;
				this.anims.set(i, { k: "flag", t0 });
				last = Math.max(last, t0);
			}
		}
		const boomAt = last + T.FLAG * 0.6;
		this.fx.push({ k: "flash", i: center, t0: boomAt });
		this.fx.push({ k: "shake", i: center, t0: boomAt });
		this.popupText(center, "+" + fmtInt(Score.PER_STAGE), pal.accent2, boomAt, true);
		const colors = [pal.accent, pal.accent2, pal.hidden_a, pal.hidden_b, pal.danger, pal.text];
		const fw = b.width * CELL;
		const fh = b.height * CELL;
		for (let k = 0; k < 110; k++) {
			this._addParticle(rand(0, fw), rand(-20, fh * 0.25), rand(-260, 260), rand(-700, -260),
				colors[k % colors.length], 10, 6, boomAt + rand(0, 120), 1300, 900);
		}
		this._dirty = true;
	}

	_spawnSparks(x, y, t0, count, color, speed = 300) {
		for (let k = 0; k < count; k++) {
			const a = Math.random() * TAU;
			const sp = rand(speed * 0.4, speed);
			const c = k % 3 ? color : Pal.current.text;
			this._addParticle(x + rand(-12, 12), y + rand(-12, 12), Math.cos(a) * sp, Math.sin(a) * sp - 120, c, 6, 6, t0, 420, 700);
		}
	}

	_addParticle(x, y, vx, vy, color, sw, sh, t0, life, gravity) {
		if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
		this.particles.push({ x, y, vx, vy, c: color, sw, sh, t0, life, g: gravity, rot: rand(0, TAU), spin: rand(-12, 12) });
	}

	// --- Ввод ---

	_local(e) {
		const r = this.canvas.getBoundingClientRect();
		const k = r.width > 0 ? this.w / r.width : 1;
		return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
	}

	_bindInput() {
		const c = this.canvas;
		c.style.touchAction = "none";
		c.addEventListener("pointerdown", (e) => {
			if (!this.board || !this.interactive) return;
			if (e.pointerType === "mouse" && e.button === 2) {
				const p = this._local(e);
				const cell = this.cellAt(p.x, p.y);
				if (cell >= 0) this.onSecondary?.(cell);
				e.preventDefault();
				return;
			}
			if (e.pointerType === "mouse" && e.button !== 0) return;
			c.setPointerCapture?.(e.pointerId);
			const p = this._local(e);
			this._touches.set(e.pointerId, p);
			if (this._touches.size === 1) {
				this._pressId = e.pointerId;
				this._pressPos = p;
				this._pressMs = now();
				this._pressMoved = false;
				this._longFired = false;
				this._pressedCell = this.cellAt(p.x, p.y);
				if (this._pressedCell >= 0) this.onPressed?.(this._pressedCell);
				this._dirty = true;
			} else {
				this._cancelPress();
				this._startPinch();
			}
		});
		c.addEventListener("pointermove", (e) => {
			if (!this._touches.has(e.pointerId)) return;
			const p = this._local(e);
			const prev = this._touches.get(e.pointerId);
			this._touches.set(e.pointerId, p);
			if (this._touches.size >= 2) {
				this._updatePinch();
				return;
			}
			if (e.pointerId === this._pressId && !this._pressMoved) {
				if (Math.hypot(p.x - this._pressPos.x, p.y - this._pressPos.y) < DRAG_THRESHOLD) return;
				this._pressMoved = true;
				this._pressedCell = -1;
				this.offset.x += p.x - this._pressPos.x;
				this.offset.y += p.y - this._pressPos.y;
			} else {
				this.offset.x += p.x - prev.x;
				this.offset.y += p.y - prev.y;
			}
			this._clampOffset();
			this._dirty = true;
		});
		const end = (e, cancelled) => {
			if (!this._touches.has(e.pointerId)) return;
			this._touches.delete(e.pointerId);
			if (e.pointerId === this._pressId) {
				const wasTap = !cancelled && !this._pressMoved && !this._longFired;
				this._cancelPress();
				if (wasTap) {
					const p = this._local(e);
					const cell = this.cellAt(p.x, p.y);
					if (cell >= 0) this.onTap?.(cell);
				}
			}
			if (this._touches.size >= 2) this._startPinch();
		};
		c.addEventListener("pointerup", (e) => end(e, false));
		c.addEventListener("pointercancel", (e) => end(e, true));
		c.addEventListener("wheel", (e) => {
			if (!this.board) return;
			e.preventDefault();
			const p = this._local(e);
			this._zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
		}, { passive: false });
	}

	_cancelPress() {
		this._pressId = null;
		this._pressedCell = -1;
		this._dirty = true;
	}

	_twoPoints() {
		const it = this._touches.values();
		return [it.next().value, it.next().value];
	}

	_startPinch() {
		if (this._touches.size < 2) return;
		const [a, b] = this._twoPoints();
		this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
		this._pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	}

	_updatePinch() {
		const [a, b] = this._twoPoints();
		const d = Math.hypot(a.x - b.x, a.y - b.y);
		const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		if (this._pinchDist > 1) this._zoomAt(d / this._pinchDist, mid.x, mid.y);
		this.offset.x += mid.x - this._pinchMid.x;
		this.offset.y += mid.y - this._pinchMid.y;
		this._clampOffset();
		this._pinchDist = d;
		this._pinchMid = mid;
		this._dirty = true;
	}

	_zoomAt(factor, px, py) {
		const nz = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
		this.offset.x = px - (px - this.offset.x) * (nz / this.zoom);
		this.offset.y = py - (py - this.offset.y) * (nz / this.zoom);
		this.zoom = nz;
		this._clampOffset();
		this._dirty = true;
		this.onZoomChanged?.();
	}

	_clampOffset() {
		const b = this.board;
		if (!b) return;
		const pad = 8 * this.zoom;
		for (const [axis, content, size] of [["x", b.width * CELL * this.zoom, this.w], ["y", b.height * CELL * this.zoom, this.h]]) {
			if (content + pad * 2 <= size) this.offset[axis] = (size - content) / 2;
			else this.offset[axis] = clamp(this.offset[axis], size - content - pad, pad);
		}
	}

	// --- Кадр ---

	frame(t) {
		// ResizeObserver срабатывает только на кадре отрисовки — размер можно взять и самим.
		if (this.w <= 0 && this.el.isConnected) this._onResize();
		if (!this.board || this.w <= 0) return;
		if (this._pixelScale() !== this._ps) this._resizeCanvas();
		if (this._pressId !== null && !this._pressMoved && !this._longFired && t - this._pressMs >= this.longPressMs) {
			this._longFired = true;
			this._pressedCell = -1;
			this._dirty = true;
			const cell = this.cellAt(this._pressPos.x, this._pressPos.y);
			if (cell >= 0) this.onLongPress?.(cell);
		}
		if (this._isAnimating(t)) {
			this._prune(t);
			this._dirty = true;
		}
		if (!this._dirty) return;
		this._dirty = false;
		this._frame++;
		this._draw(t);
	}

	_isAnimating(t) {
		return this.anims.size > 0 || this.fx.length > 0 || this.particles.length > 0 || this.board.items.size > 0
			|| this._highlight || this._waitingCell >= 0 || (this._shakeT0 >= 0 && t - this._shakeT0 < this._shakeDur);
	}

	// Убираем завершённые анимации, чтобы поле перестало перерисовываться без нужды.
	_prune(t) {
		const durs = { rev: T.REVEAL + T.NUM_POP, flag: T.FLAG, spawn: T.SPAWN, hop: T.HOP, loss: T.LOSS_MINE, nudge: 420, recount: 420 };
		for (const [i, a] of this.anims) {
			if (t > a.t0 + (durs[a.k] ?? 0) + 50) this.anims.delete(i);
		}
		this.particles = this.particles.filter((p) => t < p.t0 + p.life);
	}

	_prog(t0, dur, t) {
		return clamp((t - t0) / dur, 0, 1);
	}

	_cellRect(i) {
		const w = this.board.width;
		return { x: (i % w) * CELL, y: Math.floor(i / w) * CELL };
	}

	_shakeOffset(t) {
		if (this._shakeT0 < 0) return [0, 0];
		const sp = this._prog(this._shakeT0, this._shakeDur, t);
		if (sp >= 1) return [0, 0];
		const k = Math.pow(1 - sp, 2);
		const n = this._frame;
		const fr = (v) => v - Math.floor(v);
		return [(fr(Math.sin(n * 12.9898) * 43758.55) * 2 - 1) * this._shakePower * k, (fr(Math.sin(n * 78.233) * 24634.63) * 2 - 1) * this._shakePower * k];
	}

	_radius() {
		return 3 + (24 - 3) * Pal.current.rounding;
	}

	// Цвет закрытой клетки: градиент палитры по диагонали поля. Считается раз на палитру и размер поля.
	_hiddenColor(i) {
		const pal = Pal.current;
		const b = this.board;
		const key = `${pal.hidden_a.css()}|${pal.hidden_b.css()}|${b.width}|${b.height}`;
		if (key !== this._hiddenKey) {
			this._hiddenKey = key;
			this._hiddenCache = [];
			for (let k = 0; k < b.cellCount(); k++) {
				const x = k % b.width;
				const y = Math.floor(k / b.width);
				this._hiddenCache.push(pal.hiddenAt((x / Math.max(b.width - 1, 1) + y / Math.max(b.height - 1, 1)) * 0.5));
			}
		}
		return this._hiddenCache[i];
	}

	_rounded(x, y, w, h, r, color) {
		const g = this.g;
		g.fillStyle = typeof color === "string" ? color : color.css();
		g.beginPath();
		g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
		g.fill();
	}

	// Текст по центру точки с масштабом и обводкой яркости outline.
	_text(text, cx, cy, fs, color, scale, outline, weight = 700) {
		if (scale <= 0.01) return;
		const g = this.g;
		g.save();
		g.translate(cx, cy);
		g.scale(scale, scale);
		g.font = `${weight} ${fs}px ${FONT}`;
		g.textAlign = "center";
		g.textBaseline = "alphabetic";
		const base = ((ASCENT - DESCENT) * fs) / 2;
		if (outline > 0) {
			g.lineJoin = "round";
			g.lineWidth = fs * 0.32;
			g.strokeStyle = color.css(color.a * 0.32 * outline);
			g.strokeText(text, 0, base);
		}
		g.fillStyle = color.css();
		g.fillText(text, 0, base);
		g.restore();
	}

	_draw(t) {
		const g = this.g;
		const b = this.board;
		const pal = Pal.current;
		const ps = this._ps;
		g.setTransform(ps, 0, 0, ps, 0, 0);
		g.clearRect(0, 0, this.w, this.h);
		// Рамка зоны не трясётся вместе с полем.
		this._drawZone(pal);
		const [sx, sy] = this._shakeOffset(t);
		g.save();
		g.translate(this.offset.x + sx, this.offset.y + sy);
		g.scale(this.zoom, this.zoom);
		this._groups = this._computeGroups(pal);
		// Видимые клетки (с запасом в одну клетку на свечение и мостики).
		const z = this.zoom;
		this._vis = {
			x0: clamp(Math.floor((-this.offset.x - sx) / (CELL * z)) - 1, 0, b.width - 1),
			y0: clamp(Math.floor((-this.offset.y - sy) / (CELL * z)) - 1, 0, b.height - 1),
			x1: clamp(Math.ceil((this.w - this.offset.x - sx) / (CELL * z)) + 1, 0, b.width - 1),
			y1: clamp(Math.ceil((this.h - this.offset.y - sy) / (CELL * z)) + 1, 0, b.height - 1),
		};
		if (pal.isBlocks()) {
			this._drawBlocksBase(pal);
		} else {
			if (pal.glow > 0) {
				this._drawGlowRuns(11, 0.1 * pal.glow);
				this._drawGlowRuns(5, 0.2 * pal.glow);
			}
			this._drawSeparators(pal);
			this._drawIslands(G_HIDDEN);
			this._drawIslands(G_FLAG);
			this._drawFillets(G_HIDDEN);
			this._drawFillets(G_FLAG);
		}
		if (!this._veiled) {
			const v = this._vis;
			for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) this._drawCellContent(y * b.width + x, t, pal);
			for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) this._drawRevealGhost(y * b.width + x, t);
			this._drawLayer(t, pal);
		}
		g.restore();
		if (!this._veiled && this.isZoomed()) this._drawMinimap(pal);
	}

	_computeGroups(pal) {
		const b = this.board;
		const n = b.cellCount();
		const groups = new Uint8Array(n);
		this._colors = new Array(n);
		const flagCol = pal.flag;
		const confirmed = pal.flag.lightened(0.12);
		for (let i = 0; i < n; i++) {
			const st = this._veiled ? State.HIDDEN : b.state[i];
			if (st === State.REVEALED) {
				groups[i] = G_OPEN;
			} else if (st === State.FLAGGED) {
				groups[i] = G_FLAG;
				this._colors[i] = flagCol;
			} else if (st === State.CONFIRMED) {
				groups[i] = G_FLAG;
				this._colors[i] = confirmed;
			} else {
				groups[i] = G_HIDDEN;
				this._colors[i] = this._hiddenColor(i);
			}
		}
		return groups;
	}

	_groupAt(x, y) {
		const b = this.board;
		if (x < 0 || y < 0 || x >= b.width || y >= b.height) return -1;
		return this._groups[y * b.width + x];
	}

	// Игровая зона: рамка на всю область. «Блоки» — тёмная панель, неон — только рамка.
	_drawZone(pal) {
		const g = this.g;
		const bw = 1.5;
		g.beginPath();
		g.roundRect(bw / 2 + 0.5, bw / 2 + 0.5, this.w - bw - 1, this.h - bw - 1, 18);
		if (pal.isBlocks()) {
			g.fillStyle = "#161616";
			g.fill();
		}
		g.strokeStyle = pal.isBlocks() ? "#2e2e2e" : pal.line.css();
		g.lineWidth = bw;
		g.stroke();
	}

	_drawBlocksBase(pal) {
		const g = this.g;
		const b = this.board;
		const v = this._vis;
		for (let y = v.y0; y <= v.y1; y++) {
			for (let x = v.x0; x <= v.x1; x++) {
				const i = y * b.width + x;
				const rx = x * CELL + BLOCK_GAP;
				const ry = y * CELL + BLOCK_GAP;
				const s = CELL - BLOCK_GAP * 2;
				const st = this._veiled ? State.HIDDEN : b.state[i];
				if (st === State.REVEALED) {
					if (i === b.explodedIndex) drawBlock(g, rx, ry, s, s, pal.danger);
					else drawSlot(g, rx, ry, s, s);
				} else if (st === State.FLAGGED || st === State.CONFIRMED) {
					drawBlock(g, rx, ry, s, s, pal.flag);
				} else {
					drawBlock(g, rx, ry, s, s, pal.hidden_a);
				}
			}
		}
	}

	// Короткие чёрточки между соседними открытыми клетками.
	_drawSeparators(pal) {
		const g = this.g;
		const seg = CELL * 0.62;
		const v = this._vis;
		g.strokeStyle = pal.line.css();
		g.lineWidth = 3;
		g.beginPath();
		for (let y = v.y0; y <= v.y1; y++) {
			for (let x = v.x0; x <= v.x1; x++) {
				if (this._groupAt(x, y) !== G_OPEN) continue;
				const cx = x * CELL + CELL / 2;
				const cy = y * CELL + CELL / 2;
				if (this._groupAt(x + 1, y) === G_OPEN) {
					g.moveTo((x + 1) * CELL, cy - seg / 2);
					g.lineTo((x + 1) * CELL, cy + seg / 2);
				}
				if (this._groupAt(x, y + 1) === G_OPEN) {
					g.moveTo(cx - seg / 2, (y + 1) * CELL);
					g.lineTo(cx + seg / 2, (y + 1) * CELL);
				}
			}
		}
		g.stroke();
	}

	// Острова: скруглённый квадрат на клетку + «мостики» к соседям той же группы + центр блока 2×2.
	_drawIslands(group) {
		const g = this.g;
		const b = this.board;
		const rad = this._radius();
		const reach = GAP + rad;
		const v = this._vis;
		for (let y = v.y0; y <= v.y1; y++) {
			for (let x = v.x0; x <= v.x1; x++) {
				if (this._groupAt(x, y) !== group) continue;
				const i = y * b.width + x;
				g.fillStyle = this._colors[i].css(1);
				const rx = x * CELL;
				const ry = y * CELL;
				const same = (dx, dy) => this._groupAt(x + dx, y + dy) === group;
				// Внутренняя клетка — просто квадрат с запасом вправо и вниз (мостики к соседям).
				if (same(-1, -1) && same(0, -1) && same(1, -1) && same(-1, 0) && same(1, 0) && same(-1, 1) && same(0, 1) && same(1, 1)) {
					g.fillRect(rx, ry, CELL + reach, CELL + reach);
					continue;
				}
				g.beginPath();
				g.roundRect(rx + GAP, ry + GAP, CELL - GAP * 2, CELL - GAP * 2, Math.min(rad, CELL / 2 - GAP));
				g.fill();
				if (same(1, 0)) g.fillRect(rx + CELL - reach, ry + GAP, reach * 2, CELL - GAP * 2);
				if (same(0, 1)) g.fillRect(rx + GAP, ry + CELL - reach, CELL - GAP * 2, reach * 2);
				if (same(1, 0) && same(0, 1) && same(1, 1)) g.fillRect(rx + CELL - reach, ry + CELL - reach, reach * 2, reach * 2);
			}
		}
	}

	// Свечение островов рядами: одна скруглённая полоса на отрезок ряда и перемычка между рядами.
	_drawGlowRuns(grow, alpha) {
		const g = this.g;
		const b = this.board;
		const rad = this._radius();
		const reach = GAP + rad;
		const bg = Pal.current.bg;
		const w = b.width;
		const band = CELL - GAP * 2 + grow * 2;
		const v = this._vis;
		const groups = this._groups;
		for (let y = v.y0; y <= v.y1; y++) {
			let x = 0;
			while (x < w) {
				if (groups[y * w + x] !== G_HIDDEN) {
					x++;
					continue;
				}
				const x0 = x;
				while (x < w && groups[y * w + x] === G_HIDDEN) x++;
				const col = bg.lerp(this._colors[y * w + Math.floor((x0 + x - 1) / 2)], alpha);
				this._rounded(x0 * CELL + GAP - grow, y * CELL + GAP - grow, (x - x0) * CELL - GAP * 2 + grow * 2, band, rad + grow, col.css(1));
			}
			if (y + 1 >= b.height) continue;
			x = 0;
			while (x < w) {
				if (groups[y * w + x] !== G_HIDDEN || groups[(y + 1) * w + x] !== G_HIDDEN) {
					x++;
					continue;
				}
				const a = x;
				while (x < w && groups[y * w + x] === G_HIDDEN && groups[(y + 1) * w + x] === G_HIDDEN) x++;
				const col = bg.lerp(this._colors[y * w + Math.floor((a + x - 1) / 2)], alpha);
				g.fillStyle = col.css(1);
				g.fillRect(a * CELL + GAP - grow, (y + 1) * CELL - reach, (x - a) * CELL - GAP * 2 + grow * 2, reach * 2);
			}
		}
	}

	// Вогнутые углы островов скругляются «галтелью»: «квадрат минус четверть круга» цвета острова.
	_drawFillets(group) {
		const g = this.g;
		const b = this.board;
		const fr = Math.min(this._radius() * 0.7, CELL * 0.25);
		if (fr < 1.5) return;
		const v = this._vis;
		for (let y = v.y0; y <= v.y1; y++) {
			for (let x = v.x0; x <= v.x1; x++) {
				if (this._groupAt(x, y) !== group) continue;
				for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
					if (this._groupAt(x + dx, y) !== group || this._groupAt(x, y + dy) !== group) continue;
					if (this._groupAt(x + dx, y + dy) !== G_OPEN) continue;
					const cx = (x + (dx > 0 ? 1 : 0)) * CELL;
					const cy = (y + (dy > 0 ? 1 : 0)) * CELL;
					const qx = cx - dx * GAP;
					const qy = cy - dy * GAP;
					const ox = qx + dx * fr;
					const oy = qy + dy * fr;
					g.fillStyle = this._colors[y * b.width + x].css(1);
					g.beginPath();
					g.moveTo(qx, qy);
					g.lineTo(ox, qy);
					// Дуга от (ox, qy) к (qx, oy) вокруг центра (ox, oy) — короткая, вогнутая внутрь угла.
					const a1 = Math.atan2(qy - oy, 0);
					const a2 = Math.atan2(0, qx - ox);
					let sweep = a2 - a1;
					while (sweep > Math.PI) sweep -= TAU;
					while (sweep < -Math.PI) sweep += TAU;
					g.arc(ox, oy, fr, a1, a1 + sweep, sweep < 0);
					g.closePath();
					g.fill();
				}
			}
		}
	}

	_drawCellContent(i, t, pal) {
		const g = this.g;
		const b = this.board;
		const r = this._cellRect(i);
		let rx = r.x;
		const st = b.state[i];
		const a = this.anims.get(i);
		const kind = a ? a.k : "";
		let deny = 0;
		if (kind === "nudge") {
			const np = this._prog(a.t0, 420, t);
			rx += Math.sin(np * TAU * 4) * 7 * (1 - np);
			deny = 1 - np;
		}
		const inset = pal.isBlocks() ? BLOCK_GAP : GAP;
		const ix = rx + inset;
		const iy = r.y + inset;
		const is = CELL - inset * 2;
		const cx = rx + CELL / 2;
		const cy = r.y + CELL / 2;
		if (deny > 0) {
			this._rounded(ix, iy, is, is, this._radius(), pal.danger.css(0.22 * deny));
			g.strokeStyle = pal.danger.css(deny);
			g.lineWidth = 3;
			g.beginPath();
			g.roundRect(ix + 1.5, iy + 1.5, is - 3, is - 3, Math.max(0, this._radius() - 1.5));
			g.stroke();
		}
		if (st === State.REVEALED) {
			if (i === b.explodedIndex) {
				if (!pal.isBlocks()) this._rounded(ix, iy, is, is, this._radius(), pal.danger);
				drawIcon(g, Icon.MINE, ix + 8, iy + 8, is - 16, is - 16, pal.bg.css(), pal.danger.css());
				return;
			}
			const n = b.counts[i];
			if (n > 0) {
				const q = kind === "rev" ? this._prog(a.t0 + T.REVEAL * 0.3, T.NUM_POP, t) : 1;
				if (q > 0) {
					let sc = q < 1 ? outBack(q) : 1;
					let col = pal.numberColor(n);
					if (deny > 0) col = col.lerp(pal.danger, deny);
					if (kind === "recount") {
						const rp = this._prog(a.t0, 420, t);
						if (rp > 0) {
							sc = 1 + 0.5 * Math.sin(Math.PI * rp) * (1 - rp);
							col = col.lerp(WHITE, 0.7 * (1 - rp));
						}
					}
					this._text(String(n), cx, cy, 40, col, sc, pal.outline, 700);
				}
			}
			return;
		}
		if (b.isFlag(i)) {
			const p = kind === "flag" ? this._prog(a.t0, T.FLAG, t) : 1;
			if (p > 0) {
				const sc = p < 1 ? 1 + 0.6 * (1 - outBack(p)) : 1;
				const half = CELL * 0.32 * sc;
				const wrong = this._showLoss && b.mines[i] === 0;
				const col = st === State.CONFIRMED ? pal.accent2 : pal.danger;
				const al = clamp(p * 3, 0, 1);
				if (pal.glow > 0) {
					g.fillStyle = col.css(0.18 * pal.glow * al);
					g.beginPath();
					g.arc(cx, cy, CELL * 0.3, 0, TAU);
					g.fill();
				}
				drawIcon(g, Icon.FLAG, cx - half, cy - half, half * 2, half * 2, col.css(al));
				if (wrong) drawIcon(g, Icon.CROSS, ix + 6, iy + 6, is - 12, is - 12, pal.text.css());
			}
		} else if (this._showLoss && b.mines[i] === 1) {
			const p = kind === "loss" ? this._prog(a.t0, T.LOSS_MINE, t) : 1;
			if (p > 0) {
				const half = CELL * 0.36 * outBack(p);
				drawIcon(g, Icon.MINE, cx - half, cy - half, half * 2, half * 2, pal.bg.darkened(0.2).css(), this._hiddenColor(i).css());
			}
		}
	}

	// Открытая клетка в первые миллисекунды: «призрак» закрытого квадрата сжимается и гаснет.
	_drawRevealGhost(i, t) {
		const b = this.board;
		if (b.state[i] !== State.REVEALED || i === b.explodedIndex) return;
		const a = this.anims.get(i);
		if (!a || a.k !== "rev") return;
		const p = this._prog(a.t0, T.REVEAL, t);
		if (p >= 1) return;
		const e = outCubic(p);
		const r = this._cellRect(i);
		const pal = Pal.current;
		if (pal.isBlocks()) {
			const ins = BLOCK_GAP + 4 * e;
			drawBlock(this.g, r.x + ins, r.y + ins, CELL - ins * 2, CELL - ins * 2, pal.hidden_a, p > 0 ? 1 + 0.15 * e : 1, 1 - e);
			return;
		}
		const s = 1 - 0.45 * e;
		const size = (CELL - GAP * 2) * s;
		let col = this._hiddenColor(i);
		if (p > 0) col = col.lerp(WHITE, 0.45 * (1 - p));
		this._rounded(r.x + CELL / 2 - size / 2, r.y + CELL / 2 - size / 2, size, size, this._radius() * s, col.css(1 - e));
	}

	// Слой поверх поля: предметы, подсветка целей Раскрытия, нажатая клетка, частицы, всплывающий текст.
	_drawLayer(t, pal) {
		const g = this.g;
		const b = this.board;
		const ts = t / 1000;
		const inset = pal.isBlocks() ? BLOCK_GAP : GAP;
		const hopping = new Set();
		for (const [i, a] of this.anims) if (a.k === "hop" && this._prog(a.t0, T.HOP, t) < 1) hopping.add(i);
		for (const [i, type] of b.items) {
			if (hopping.has(i)) continue;
			const a = this.anims.get(i);
			const p = a && a.k === "spawn" ? this._prog(a.t0, T.SPAWN, t) : 1;
			if (p > 0) {
				const r = this._cellRect(i);
				const bob = Math.sin(ts * 2.4 + i) * 1.6;
				const sc = p < 1 ? outBack(p) : 1;
				this._drawItem(r.x, r.y + bob, type, sc, 1, pal);
				this._drawLifeBadge(r, b.itemLife.get(i) ?? Item.LIFE_CLICKS, sc, ts, pal);
			}
		}
		if (this._highlight) {
			const pulse = 0.55 + 0.45 * Math.abs(Math.sin(ts * 4));
			const v = this._vis;
			for (let y = v.y0; y <= v.y1; y++) {
				for (let x = v.x0; x <= v.x1; x++) {
					const i = y * b.width + x;
					if (b.state[i] !== State.HIDDEN) continue;
					const on = pal.onHidden(this._hiddenColor(i));
					drawIcon(g, Icon.TARGET, x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2, on.css(pulse));
				}
			}
		}
		if (this._waitingCell >= 0 && this._waitingCell < b.cellCount()) {
			const pulse = 0.5 + 0.5 * Math.sin(ts * 12);
			const r = this._cellRect(this._waitingCell);
			this._rounded(r.x + inset, r.y + inset, CELL - inset * 2, CELL - inset * 2, this._radius(), `rgba(255,255,255,${0.12 + 0.2 * pulse})`);
		}
		if (this._pressedCell >= 0 && this._pressedCell < b.cellCount()) {
			const r = this._cellRect(this._pressedCell);
			this._rounded(r.x + inset, r.y + inset, CELL - inset * 2, CELL - inset * 2, this._radius(), "rgba(255,255,255,0.22)");
		}
		for (const i of hopping) {
			if (!b.items.has(i)) continue;
			const a = this.anims.get(i);
			const p = this._prog(a.t0, T.HOP, t);
			const from = this._cellRect(a.from);
			const to = this._cellRect(i);
			const e = outCubic(p);
			this._drawItem(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - Math.sin(Math.PI * p) * CELL * 0.9, b.items.get(i), 1, 1, pal);
		}
		this._drawParticles(t);
		this._drawFx(t, pal);
	}

	// Предмет: тёмная «таблетка» с цветной иконкой поверх острова.
	_drawItem(x, y, type, scale, alpha, pal) {
		if (scale <= 0.01 || alpha <= 0) return;
		const g = this.g;
		const col = type === Item.CLOCK ? pal.accent2 : pal.mana;
		const cx = x + CELL / 2;
		const cy = y + CELL / 2;
		const rad = CELL * 0.34 * scale;
		g.fillStyle = pal.bg.css(0.88 * alpha);
		g.beginPath();
		g.arc(cx, cy, rad, 0, TAU);
		g.fill();
		if (pal.glow > 0) {
			g.strokeStyle = col.css(0.2 * pal.glow * alpha);
			g.lineWidth = 4;
			g.beginPath();
			g.arc(cx, cy, rad + 5, 0, TAU);
			g.stroke();
		}
		const ir = rad * 0.82;
		g.save();
		g.globalAlpha = alpha;
		drawIcon(g, type === Item.CLOCK ? Icon.CLOCK : Icon.MANA, cx - ir, cy - ir, ir * 2, ir * 2, col.css(1), pal.bg.css(1));
		g.restore();
	}

	// Сколько кликов мимо предмет ещё переживёт — цифра в углу; на последнем мигает.
	_drawLifeBadge(r, life, scale, ts, pal) {
		const s = 22 * scale;
		if (s < 8) return;
		const g = this.g;
		const cx = r.x + CELL - GAP - s / 2 - 1;
		const cy = r.y + GAP + s / 2 + 1;
		let bg = pal.bg;
		if (life === 1) bg = pal.danger.lerp(pal.bg, 0.5 + 0.5 * Math.sin(ts * 9));
		g.fillStyle = bg.css(1);
		g.beginPath();
		g.arc(cx, cy, s / 2, 0, TAU);
		g.fill();
		g.font = `700 ${Math.round(s * 0.78)}px ${FONT}`;
		g.textAlign = "center";
		g.textBaseline = "alphabetic";
		g.fillStyle = (life <= 2 ? pal.danger : pal.text).css(1);
		g.fillText(String(life), cx, cy + s * 0.3);
	}

	_drawParticles(t) {
		const g = this.g;
		for (const p of this.particles) {
			if (t < p.t0) continue;
			const el = (t - p.t0) / 1000;
			const k = clamp(el / (p.life / 1000), 0, 1);
			g.save();
			g.translate(p.x + p.vx * el, p.y + p.vy * el + 0.5 * p.g * el * el);
			g.rotate(p.rot + p.spin * el);
			g.fillStyle = p.c.css(1 - k * k);
			g.fillRect(-p.sw / 2, -p.sh / 2, p.sw, p.sh);
			g.restore();
		}
	}

	_drawFx(t, pal) {
		const g = this.g;
		const b = this.board;
		const alive = [];
		for (const f of this.fx) {
			const r = this._cellRect(f.i);
			const cx = r.x + CELL / 2;
			const cy = r.y + CELL / 2;
			let keep = true;
			switch (f.k) {
				case "boom": {
					const p = this._prog(f.t0, T.EXPLODE, t);
					keep = p < 1;
					if (!keep) break;
					const e = outCubic(p);
					const col = f.safe ? pal.mana : pal.danger;
					if (p < 0.2) {
						g.fillStyle = pal.text.css(0.6 * (1 - p / 0.2));
						g.beginPath();
						g.arc(cx, cy, (CELL * 2.2 * p) / 0.2, 0, TAU);
						g.fill();
					}
					g.fillStyle = col.css(0.35 * (1 - p));
					g.beginPath();
					g.arc(cx, cy, CELL * (0.4 + 1.4 * e), 0, TAU);
					g.fill();
					g.strokeStyle = col.css(1 - p);
					g.lineWidth = 6 * (1 - p) + 1;
					g.beginPath();
					g.arc(cx, cy, CELL * (0.5 + 2.2 * e), 0, TAU);
					g.stroke();
					if (f.safe && p < 0.6) {
						const ins = GAP + 8 - 20 * e;
						drawIcon(g, Icon.MINE, r.x + ins, r.y + ins, CELL - ins * 2, CELL - ins * 2, pal.text.css(1 - p / 0.6), pal.bg.css(1 - p / 0.6));
					}
					break;
				}
				case "pick": {
					const p = this._prog(f.t0, T.PICKUP, t);
					keep = p < 1;
					if (keep && t >= f.t0) {
						const e = outCubic(p);
						this._drawItem(r.x, r.y - CELL * 0.8 * e, f.type, 1 + 0.9 * e, 1 - p, pal);
					}
					break;
				}
				case "expire": {
					const p = this._prog(f.t0, T.EXPIRE, t);
					keep = p < 1;
					if (keep) {
						this._drawItem(r.x, r.y, f.type, 1 - 0.7 * p, 1 - p, pal);
						g.strokeStyle = pal.muted.css(0.7 * (1 - p));
						g.lineWidth = 3;
						g.beginPath();
						g.arc(cx, cy, CELL * (0.2 + 0.5 * p), 0, TAU);
						g.stroke();
					}
					break;
				}
				case "pop": {
					const p = this._prog(f.t0, T.POPUP, t);
					keep = p < 1;
					if (keep && t >= f.t0) this._drawPop(f, r, p, pal);
					break;
				}
				case "ring": {
					const p = this._prog(f.t0, T.RING, t);
					keep = p < 1;
					if (keep && p > 0) {
						g.strokeStyle = pal.mana.css(1 - p);
						g.lineWidth = 4;
						g.beginPath();
						g.arc(cx, cy, CELL * (0.3 + 0.9 * outCubic(p)), 0, TAU);
						g.stroke();
					}
					break;
				}
				case "flash": {
					const p = this._prog(f.t0, T.FLASH, t);
					keep = p < 1;
					if (keep && p > 0) this._rounded(-6, -6, b.width * CELL + 12, b.height * CELL + 12, 16, pal.accent.css(0.35 * (1 - p)));
					break;
				}
				case "shake":
					keep = t < f.t0;
					if (!keep) this.shake(16, 560);
					break;
				case "streak": {
					const total = T.ECHO + 160;
					const p = this._prog(f.t0, total, t);
					keep = p < 1;
					if (!keep) break;
					const head = clamp((p * total) / T.ECHO, 0, 1);
					const tail = clamp((p * total - 100) / T.ECHO, 0, 1);
					const from = f.from;
					const to = { x: cx, y: cy };
					const ctrl = { x: (from.x + to.x) / 2 - 40 / this.zoom, y: Math.min(from.y, to.y) - 60 / this.zoom };
					const pts = [];
					for (let k = 0; k <= 16; k++) {
						const s = tail + (head - tail) * (k / 16);
						const ax = from.x + (ctrl.x - from.x) * s;
						const ay = from.y + (ctrl.y - from.y) * s;
						const bx = ctrl.x + (to.x - ctrl.x) * s;
						const by = ctrl.y + (to.y - ctrl.y) * s;
						pts.push([ax + (bx - ax) * s, ay + (by - ay) * s]);
					}
					g.lineCap = "round";
					g.lineJoin = "round";
					for (const [w, c] of [[12, pal.mana.css(0.35)], [4, pal.mana.lerp(WHITE, 0.5).css(1)]]) {
						g.strokeStyle = c;
						g.lineWidth = w / this.zoom;
						g.beginPath();
						g.moveTo(pts[0][0], pts[0][1]);
						for (const q of pts) g.lineTo(q[0], q[1]);
						g.stroke();
					}
					g.lineCap = "butt";
					break;
				}
			}
			if (keep) alive.push(f);
		}
		this.fx = alive;
	}

	// Всплывающий текст: «удар» масштаба, подъём и затухание. Размер — в пикселях раскладки.
	_drawPop(f, r, p, pal) {
		const g = this.g;
		const b = this.board;
		const base = (f.big ? 32 : 24) / this.zoom;
		let punch = 1;
		if (p < 0.14) punch = 0.6 + 0.4 * outBack(p / 0.14);
		const fs = clamp(base * punch, 14, 120);
		const alpha = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6;
		const rise = CELL * (f.big ? 0.9 : 0.7) * outCubic(p);
		g.font = `700 ${fs}px ${FONT}`;
		g.textAlign = "center";
		g.textBaseline = "alphabetic";
		// Держим надпись внутри поля, чтобы у края её не обрезало.
		const half = g.measureText(f.text).width / 2 + 6 / this.zoom;
		const fw = b.width * CELL;
		const x = clamp(r.x + CELL / 2, Math.min(half, fw / 2), Math.max(fw - half, fw / 2));
		const y = clamp(r.y + CELL * (0.3 + (f.dy || 0)) - rise, fs, b.height * CELL - 4 / this.zoom);
		g.lineJoin = "round";
		g.lineWidth = fs * 0.22;
		g.strokeStyle = pal.bg.css(0.75 * alpha);
		g.strokeText(f.text, x, y);
		if (pal.glow > 0) {
			g.lineWidth = fs * 0.6;
			g.strokeStyle = f.color.css(0.18 * pal.glow * alpha);
			g.strokeText(f.text, x, y);
			g.lineWidth = fs * 0.22;
			g.strokeStyle = pal.bg.css(0.75 * alpha);
			g.strokeText(f.text, x, y);
		}
		g.fillStyle = f.color.css(alpha);
		g.fillText(f.text, x, y);
	}

	// Мини-карта: всё поле и рамка видимой части. Координаты — раскладки.
	_drawMinimap(pal) {
		const g = this.g;
		const b = this.board;
		const k = Math.min(150 / b.width, 190 / b.height);
		const mw = b.width * k;
		const mh = b.height * k;
		const [ox, oy] = this._minimapOrigin(mw, mh);
		g.fillStyle = pal.bg.css(0.92);
		g.beginPath();
		g.roundRect(ox - 10, oy - 10, mw + 20, mh + 20, 12);
		g.fill();
		g.strokeStyle = pal.line.css();
		g.lineWidth = 2;
		g.beginPath();
		g.roundRect(ox - 9, oy - 9, mw + 18, mh + 18, 11);
		g.stroke();
		const openCol = pal.isBlocks() ? "#2a2a2a" : pal.line.css(1);
		for (let i = 0; i < b.cellCount(); i++) {
			let col;
			const st = b.state[i];
			if (st === State.REVEALED) col = i === b.explodedIndex ? pal.danger.css(1) : openCol;
			else if (st === State.FLAGGED || st === State.CONFIRMED) col = pal.danger.css(1);
			else col = (pal.isBlocks() ? pal.hidden_a : this._hiddenColor(i)).css(1);
			g.fillStyle = col;
			g.fillRect(ox + (i % b.width) * k, oy + Math.floor(i / b.width) * k, k - 0.6, k - 0.6);
		}
		const z = CELL * this.zoom;
		const vx = clamp(-this.offset.x / z, 0, b.width);
		const vy = clamp(-this.offset.y / z, 0, b.height);
		const vx2 = clamp((-this.offset.x + this.w) / z, 0, b.width);
		const vy2 = clamp((-this.offset.y + this.h) / z, 0, b.height);
		g.strokeStyle = "#fff";
		g.lineWidth = 3;
		g.strokeRect(ox + vx * k, oy + vy * k, (vx2 - vx) * k, (vy2 - vy) * k);
	}

	// Правый верхний угол, если под ним не оказался угол поля; иначе — свободный угол.
	_minimapOrigin(mw, mh) {
		const m = 22;
		const b = this.board;
		const cw = b.width * CELL * this.zoom;
		const ch = b.height * CELL * this.zoom;
		const cell = CELL * this.zoom;
		const o = this.offset;
		const corners = [
			[[this.w - mw - m, m], [o.x + cw - cell, o.y]],
			[[m, m], [o.x, o.y]],
			[[this.w - mw - m, this.h - mh - m], [o.x + cw - cell, o.y + ch - cell]],
			[[m, this.h - mh - m], [o.x, o.y + ch - cell]],
		];
		for (const [pos, c] of corners) {
			const ax = pos[0] - 10;
			const ay = pos[1] - 10;
			const intersects = ax < c[0] + cell && ax + mw + 20 > c[0] && ay < c[1] + cell && ay + mh + 20 > c[1];
			if (!intersects) return pos;
		}
		return corners[0][0];
	}
}
