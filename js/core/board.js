// Логика одного поля: генерация мин, открытие, аккорд, флаги, Раскрытие и предметы.
// Не зависит от отрисовки.
import { Emitter } from "./emitter.js";
import { Rng } from "./rng.js";
import { Item } from "./config.js";
import { generate, buildNeighbors } from "./noguess.js";

export const State = { HIDDEN: 0, REVEALED: 1, FLAGGED: 2, CONFIRMED: 3 };
export const MAX_ITEMS_ON_BOARD = 3;

// Фоновая генерация «без угадываний»: один воркер на всю игру.
let worker = null;
let nextJob = 1;
const jobs = new Map();

function getWorker() {
	if (worker === null) {
		try {
			worker = new Worker(new URL("./noguess_worker.js", import.meta.url), { type: "module" });
			worker.onmessage = (e) => {
				const job = jobs.get(e.data.id);
				if (!job) return;
				jobs.delete(e.data.id);
				job.done = true;
				job.layout = e.data.layout;
				for (const fn of job.waiters) fn();
			};
		} catch {
			worker = false;
		}
	}
	return worker || null;
}

// Броски на появление предметов: 1 бросок после первого открытия + 1 за каждые K клеток.
class ItemSpawner {
	constructor(cfg, seed) {
		this.config = cfg;
		this.rollsDone = 0;
		this.rng = new Rng(seed);
	}

	static rollsDueFor(revealedSafe, every) {
		return revealedSafe <= 0 ? 0 : 1 + Math.floor(revealedSafe / every);
	}

	takeRolls(revealedSafe) {
		const result = [];
		const due = ItemSpawner.rollsDueFor(revealedSafe, this.config.rollEveryCells);
		while (this.rollsDone < due) {
			result.push(this.roll());
			this.rollsDone++;
		}
		return result;
	}

	roll() {
		const c = this.config;
		const total = c.weightClarity + c.weightClock + c.weightEmpty;
		let r = this.rng.randf() * total;
		if (r < c.weightClarity) return Item.CLARITY;
		r -= c.weightClarity;
		if (r < c.weightClock) return Item.CLOCK;
		return Item.NONE;
	}
}

export class Board extends Emitter {
	constructor(cfg, seed) {
		super();
		this.config = cfg;
		this.width = cfg.width;
		this.height = cfg.height;
		this.mineCount = cfg.mines;
		const n = this.width * this.height;
		this.mines = new Uint8Array(n);
		this.counts = new Uint8Array(n);
		this.state = new Uint8Array(n);
		// Глубина заливки, на которой клетка открылась (0 — клетка касания). Для волны анимации.
		this.revealDepth = new Uint8Array(n);
		// index -> тип предмета. Предмет всегда лежит на клетке фронта.
		this.items = new Map();
		// index -> сколько кликов мимо предмет ещё переживёт.
		this.itemLife = new Map();
		this.generated = false;
		this.finished = false;
		this.won = false;
		this.explodedIndex = -1;
		this.revealedSafe = 0;
		// «Без угадываний» (Классика): задать до первого тапа.
		this.noGuess = false;
		this._mineRng = new Rng(seed);
		this._itemRng = new Rng(seed + 7919);
		this.spawner = new ItemSpawner(cfg, seed + 104729);
		this._neighbors = buildNeighbors(this.width, this.height);
		this._pregen = null;
	}

	// --- Геометрия ---

	cellCount() {
		return this.width * this.height;
	}

	safeCount() {
		return this.width * this.height - this.mineCount;
	}

	indexOf(x, y) {
		return y * this.width + x;
	}

	neighbors(i) {
		return this._neighbors[i];
	}

	distance(a, b) {
		const w = this.width;
		return Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w)));
	}

	isFlag(i) {
		return this.state[i] === State.FLAGGED || this.state[i] === State.CONFIRMED;
	}

	// Клетка фронта: закрыта, без флага, рядом есть открытая клетка.
	isFrontier(i) {
		if (this.state[i] !== State.HIDDEN) return false;
		for (const nb of this._neighbors[i]) if (this.state[nb] === State.REVEALED) return true;
		return false;
	}

	flagsLeft() {
		let flags = 0;
		for (let i = 0; i < this.cellCount(); i++) if (this.isFlag(i)) flags++;
		return this.mineCount - flags;
	}

	// --- Фоновая генерация «без угадываний» ---

	// Палец коснулся клетки first: начинаем подбирать поле заранее, к отпусканию оно обычно готово.
	pregenerate(first) {
		if (this.generated || !this.noGuess) return;
		if (this._pregen) {
			if (this._pregen.first === first || !this._pregen.done) return;
		}
		const w = getWorker();
		if (!w) return;
		const id = nextJob++;
		const job = { id, first, done: false, layout: null, waiters: [] };
		jobs.set(id, job);
		this._pregen = job;
		w.postMessage({ id, width: this.width, height: this.height, mines: this.mineCount, first, seed: this._mineRng.randi() });
	}

	// Можно открыть first без ожидания.
	generationReady(first) {
		if (this.generated || !this.noGuess) return true;
		return !!(this._pregen && this._pregen.first === first && this._pregen.done);
	}

	// Промис: поле для first готово (или генерация в фоне недоступна — тогда считаем сами при открытии).
	whenReady(first) {
		this.pregenerate(first);
		const job = this._pregen;
		if (!job || job.first !== first || job.done) return Promise.resolve();
		return new Promise((resolve) => job.waiters.push(resolve));
	}

	// --- Действия игрока ---

	reveal(i) {
		if (this.finished || this.state[i] !== State.HIDDEN) return;
		if (!this.generated) this._generate(i);
		this._open([i]);
	}

	// Тап по цифре: если вокруг ровно N флагов — открыть остальных соседей.
	chord(i) {
		if (this.finished || this.state[i] !== State.REVEALED || this.counts[i] === 0) return;
		let flags = 0;
		const hidden = [];
		for (const nb of this._neighbors[i]) {
			if (this.isFlag(nb)) flags++;
			else if (this.state[nb] === State.HIDDEN) hidden.push(nb);
		}
		if (flags !== this.counts[i] || !hidden.length) return;
		this._open(hidden);
	}

	canChord(i) {
		if (this.state[i] !== State.REVEALED || this.counts[i] === 0) return false;
		let flags = 0;
		let hasHidden = false;
		for (const nb of this._neighbors[i]) {
			if (this.isFlag(nb)) flags++;
			else if (this.state[nb] === State.HIDDEN) hasHidden = true;
		}
		return hasHidden && flags === this.counts[i];
	}

	toggleFlag(i) {
		if (this.finished) return;
		if (this.state[i] === State.HIDDEN) {
			this.state[i] = State.FLAGGED;
			this.emit("flag", i);
			if (this.items.has(i)) {
				// Флаг на предмете — тоже клик: минус одна «жизнь». На нуле предмет исчезает,
				// иначе перепрыгивает на соседнюю клетку.
				const left = (this.itemLife.get(i) ?? Item.LIFE_CLICKS) - 1;
				if (left <= 0) {
					const type = this.items.get(i);
					this.items.delete(i);
					this.itemLife.delete(i);
					this.emit("itemExpired", i, type);
				} else {
					this.itemLife.set(i, left);
					this._relocateItem(i);
				}
			}
		} else if (this.state[i] === State.FLAGGED) {
			this.state[i] = State.HIDDEN;
			this.emit("flag", i);
		}
	}

	// Клик игрока по клетке i: каждый предмет на другой клетке теряет одну «жизнь».
	// Вызывать до самого действия, чтобы только что появившиеся предметы не теряли жизнь.
	registerClick(i) {
		if (this.finished) return;
		for (const cell of [...this.items.keys()]) {
			if (cell === i) continue;
			const left = (this.itemLife.get(cell) ?? Item.LIFE_CLICKS) - 1;
			if (left > 0) {
				this.itemLife.set(cell, left);
				continue;
			}
			const type = this.items.get(cell);
			this.items.delete(cell);
			this.itemLife.delete(cell);
			this.emit("itemExpired", cell, type);
		}
	}

	// По цифре: если все закрытые соседи обязаны быть минами — ставит на них флаги.
	autoFlag(i) {
		if (this.finished || !this.canAutoFlag(i)) return 0;
		const hidden = [];
		for (const nb of this._neighbors[i]) if (this.state[nb] === State.HIDDEN) hidden.push(nb);
		for (const cell of hidden) this.toggleFlag(cell);
		return hidden.length;
	}

	canAutoFlag(i) {
		if (this.state[i] !== State.REVEALED || this.counts[i] === 0) return false;
		let flags = 0;
		let hidden = 0;
		for (const nb of this._neighbors[i]) {
			if (this.isFlag(nb)) flags++;
			else if (this.state[nb] === State.HIDDEN) hidden++;
		}
		return hidden > 0 && flags + hidden === this.counts[i];
	}

	// Раскрытие: -1 (нельзя), 0 (клетка безопасна и открыта), 1 (мина обезврежена).
	echoProbe(i) {
		if (this.finished || this.state[i] !== State.HIDDEN) return -1;
		if (!this.generated) this._generate(i);
		if (this.mines[i] === 1) {
			this._defuse(i);
			return 1;
		}
		this._open([i]);
		return 0;
	}

	// Задать мины вручную (обучение, превью).
	setupMines(indices) {
		this.mines.fill(0);
		for (const i of indices) this.mines[i] = 1;
		this.mineCount = indices.length;
		this._computeCounts();
		this.generated = true;
	}

	// «Второй шанс»: подорвавшая мина становится флагом, игра продолжается.
	revive() {
		if (this.explodedIndex < 0) return;
		const i = this.explodedIndex;
		this.state[i] = State.FLAGGED;
		this.explodedIndex = -1;
		this.finished = false;
		this.emit("flag", i);
	}

	// --- Внутреннее ---

	// Первый тап: клетка и её соседи всегда без мин.
	_generate(first) {
		if (this.noGuess) {
			let layout = null;
			if (this._pregen && this._pregen.first === first && this._pregen.done) layout = this._pregen.layout;
			this._pregen = null;
			if (!layout) layout = generate(this.width, this.height, this.mineCount, first, this._mineRng, this._neighbors);
			if (layout) {
				this.mines = Uint8Array.from(layout);
				this._computeCounts();
				this.generated = true;
				return;
			}
		}
		let excluded = new Set([first, ...this._neighbors[first]]);
		if (this.cellCount() - excluded.size < this.mineCount) excluded = new Set([first]);
		const candidates = [];
		for (let i = 0; i < this.cellCount(); i++) if (!excluded.has(i)) candidates.push(i);
		const count = Math.min(this.mineCount, candidates.length);
		for (let k = 0; k < count; k++) {
			const r = this._mineRng.range(k, candidates.length - 1);
			const tmp = candidates[k];
			candidates[k] = candidates[r];
			candidates[r] = tmp;
			this.mines[candidates[k]] = 1;
		}
		this.mineCount = count;
		this._computeCounts();
		this.generated = true;
	}

	_computeCounts() {
		for (let i = 0; i < this.cellCount(); i++) {
			let c = 0;
			for (const nb of this._neighbors[i]) c += this.mines[nb];
			this.counts[i] = c;
		}
	}

	_open(seeds) {
		for (const s of seeds) {
			if (this.mines[s] === 1) {
				this._explode(s);
				return;
			}
		}
		const opened = [];
		const queue = [];
		for (const s of seeds) {
			if (this.state[s] === State.HIDDEN) {
				this.state[s] = State.REVEALED;
				this.revealDepth[s] = 0;
				opened.push(s);
				queue.push(s);
			}
		}
		let head = 0;
		while (head < queue.length) {
			const c = queue[head++];
			if (this.counts[c] !== 0) continue;
			for (const nb of this._neighbors[c]) {
				if (this.state[nb] === State.HIDDEN && this.mines[nb] === 0) {
					this.state[nb] = State.REVEALED;
					this.revealDepth[nb] = Math.min(this.revealDepth[c] + 1, 255);
					opened.push(nb);
					queue.push(nb);
				}
			}
		}
		if (!opened.length) return;
		this.revealedSafe += opened.length;
		for (const c of opened) {
			if (this.items.has(c)) {
				const picked = this.items.get(c);
				this.items.delete(c);
				this.itemLife.delete(c);
				this.emit("itemPicked", c, picked);
			}
		}
		this.emit("revealed", opened);
		this._rollItems(opened);
		if (this.revealedSafe >= this.safeCount()) this._win();
	}

	// Убирает мину: счётчик мин и числа соседей уменьшаются, клетка и безопасные соседи открываются.
	_defuse(i) {
		this.mines[i] = 0;
		this.mineCount--;
		for (const nb of this._neighbors[i]) this.counts[nb]--;
		this.emit("mineDefused", i);
		const seeds = new Set([i]);
		for (const nb of this._neighbors[i]) {
			if (this.state[nb] === State.HIDDEN && this.mines[nb] === 0) seeds.add(nb);
			// Открытая цифра стала нулём: её закрытые соседи теперь заведомо без мин и должны открыться,
			// иначе пустая клетка граничит с закрытыми.
			if (this.state[nb] === State.REVEALED && this.counts[nb] === 0) {
				for (const nb2 of this._neighbors[nb]) if (this.state[nb2] === State.HIDDEN) seeds.add(nb2);
			}
		}
		this._open([...seeds]);
	}

	_explode(i) {
		this.state[i] = State.REVEALED;
		this.explodedIndex = i;
		this.finished = true;
		this.emit("mineHit", i);
	}

	_win() {
		this.finished = true;
		this.won = true;
		for (let i = 0; i < this.cellCount(); i++) {
			if (this.mines[i] === 1 && this.state[i] === State.HIDDEN) this.state[i] = State.FLAGGED;
		}
		this.items.clear();
		this.itemLife.clear();
		this.emit("cleared");
	}

	_freeFrontier() {
		const result = [];
		for (let i = 0; i < this.cellCount(); i++) if (!this.items.has(i) && this.isFrontier(i)) result.push(i);
		return result;
	}

	// Свободные клетки фронта, примыкающие к клеткам, открытым этим ходом.
	_freeFrontierNear(opened) {
		const seen = new Set();
		const result = [];
		for (const c of opened) {
			for (const nb of this._neighbors[c]) {
				if (seen.has(nb)) continue;
				seen.add(nb);
				if (!this.items.has(nb) && this.isFrontier(nb)) result.push(nb);
			}
		}
		return result;
	}

	// Предметы появляются рядом с только что открытой областью. Если рядом нет места — бросок сгорает.
	_rollItems(opened) {
		for (const rolled of this.spawner.takeRolls(this.revealedSafe)) {
			if (rolled === Item.NONE || this.items.size >= MAX_ITEMS_ON_BOARD) continue;
			const free = this._freeFrontierNear(opened);
			if (!free.length) continue;
			const cell = free[this._itemRng.range(0, free.length - 1)];
			this.items.set(cell, rolled);
			this.itemLife.set(cell, Item.LIFE_CLICKS);
			this.emit("itemSpawned", cell, rolled);
		}
	}

	// Флаг на клетке с предметом: предмет перескакивает на соседнюю клетку фронта,
	// иначе — на ближайшую клетку фронта, иначе сгорает.
	_relocateItem(i) {
		const moving = this.items.get(i);
		const life = this.itemLife.get(i) ?? Item.LIFE_CLICKS;
		this.items.delete(i);
		this.itemLife.delete(i);
		let candidates = [];
		for (const nb of this._neighbors[i]) if (!this.items.has(nb) && this.isFrontier(nb)) candidates.push(nb);
		if (!candidates.length) {
			let best = Infinity;
			for (const c of this._freeFrontier()) {
				const d = this.distance(i, c);
				if (d < best) {
					best = d;
					candidates = [c];
				} else if (d === best) {
					candidates.push(c);
				}
			}
		}
		if (!candidates.length) {
			this.emit("itemMoved", i, -1);
			return;
		}
		const target = candidates[this._itemRng.range(0, candidates.length - 1)];
		this.items.set(target, moving);
		this.itemLife.set(target, life);
		this.emit("itemMoved", i, target);
	}
}
