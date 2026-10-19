// Поля «без угадываний»: расстановка мин, которую от первого тапа можно пройти одной логикой.
//
// Решатель знает то же, что игрок: открытые цифры и общее число мин. Правила:
// 1) у цифры осталось мин 0 — закрытые соседи безопасны; столько же, сколько закрытых — все мины;
// 2) закрытые соседи цифры A — подмножество соседей цифры B: разница несёт B−A мин;
// 3) общий счёт: оставшиеся мины = 0 или = числу закрытых клеток.
// Если решатель упёрся, мина с границы открытой области переносится вглубь закрытой части,
// и решение продолжается.

const MAX_ATTEMPTS = 40;
const MAX_REPAIRS = 80;

const UNKNOWN = 0;
const SAFE = 1;
const MINE = 2;

export function buildNeighbors(width, height) {
	const list = [];
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const nb = [];
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dy === 0) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && nx < width && ny >= 0 && ny < height) nb.push(ny * width + nx);
				}
			}
			list.push(Int32Array.from(nb));
		}
	}
	return list;
}

// Расстановка мин (Uint8Array, 1 — мина) или null, если за MAX_ATTEMPTS не вышло.
export function generate(width, height, mineCount, first, rng, neighbors) {
	let repairsTotal = 0;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const mines = randomLayout(width * height, mineCount, first, rng, neighbors);
		if (!mines) return null;
		const solver = new Solver(mines, mineCount, neighbors);
		const ok = solver.solve(first, rng, MAX_REPAIRS);
		repairsTotal += solver.repairs;
		// Если мины переносились, итог перепроверяем с нуля: решение шло по промежуточным расстановкам.
		if (ok && (solver.repairs === 0 || isSolvable(solver.mines, mineCount, first, neighbors))) {
			return solver.mines;
		}
	}
	return null;
}

export function isSolvable(mines, mineCount, first, neighbors) {
	return new Solver(Uint8Array.from(mines), mineCount, neighbors).solve(first, null, 0);
}

export function randomLayout(n, mineCount, first, rng, neighbors) {
	const excluded = new Set([first, ...neighbors[first]]);
	const candidates = [];
	for (let i = 0; i < n; i++) if (!excluded.has(i)) candidates.push(i);
	if (candidates.length < mineCount) return null;
	const mines = new Uint8Array(n);
	for (let k = 0; k < mineCount; k++) {
		const r = rng.range(k, candidates.length - 1);
		const tmp = candidates[k];
		candidates[k] = candidates[r];
		candidates[r] = tmp;
		mines[candidates[k]] = 1;
	}
	return mines;
}

class Solver {
	constructor(layout, mineCount, neighbors) {
		this.mines = layout;
		this.mineTotal = mineCount;
		this.nbs = neighbors;
		const n = layout.length;
		this.safeTotal = n - mineCount;
		this.counts = new Int16Array(n);
		this.known = new Uint8Array(n);
		this.knownMines = 0;
		this.revealed = 0;
		this.repairs = 0;
		this.queue = [];
		this.queued = new Uint8Array(n);
		// Цифры, чьё ограничение изменилось с прошлого прохода правила 2.
		this.dirty = new Uint8Array(n);
		this.dirtyList = [];
		for (let i = 0; i < n; i++) {
			let c = 0;
			for (const nb of neighbors[i]) c += layout[nb];
			this.counts[i] = c;
		}
	}

	// rng == null или maxRepairs == 0 — только проверка, без переносов мин.
	solve(first, rng, maxRepairs) {
		if (this.mines[first] === 1) return false;
		this.reveal(first);
		for (;;) {
			this.deduce();
			if (this.revealed >= this.safeTotal) return true;
			if (rng === null || this.repairs >= maxRepairs || !this.repair(rng)) return false;
			this.repairs++;
		}
	}

	deduce() {
		for (;;) {
			this.drainQueue();
			if (this.revealed >= this.safeTotal) return;
			if (this.subsetPass()) continue;
			if (this.globalPass()) continue;
			return;
		}
	}

	push(i) {
		if (this.known[i] === SAFE && this.queued[i] === 0) {
			this.queued[i] = 1;
			this.queue.push(i);
		}
	}

	pushAround(i) {
		for (const nb of this.nbs[i]) this.push(nb);
	}

	touch(x) {
		if (this.dirty[x] === 0) {
			this.dirty[x] = 1;
			this.dirtyList.push(x);
		}
		for (const nb of this.nbs[x]) {
			if (this.dirty[nb] === 0) {
				this.dirty[nb] = 1;
				this.dirtyList.push(nb);
			}
		}
	}

	reveal(start) {
		if (this.known[start] !== UNKNOWN) return;
		const stack = [start];
		this.known[start] = SAFE;
		while (stack.length) {
			const c = stack.pop();
			this.revealed++;
			this.touch(c);
			this.push(c);
			this.pushAround(c);
			if (this.counts[c] !== 0) continue;
			for (const nb of this.nbs[c]) {
				if (this.known[nb] === UNKNOWN) {
					this.known[nb] = SAFE;
					stack.push(nb);
				}
			}
		}
	}

	markMine(i) {
		if (this.known[i] !== UNKNOWN) return;
		this.known[i] = MINE;
		this.knownMines++;
		this.touch(i);
		this.pushAround(i);
	}

	// Правило 1 по очереди «затронутых» цифр.
	drainQueue() {
		const known = this.known;
		let head = 0;
		while (head < this.queue.length) {
			const i = this.queue[head++];
			this.queued[i] = 0;
			let unknown = 0;
			let flagged = 0;
			for (const nb of this.nbs[i]) {
				const k = known[nb];
				if (k === UNKNOWN) unknown++;
				else if (k === MINE) flagged++;
			}
			if (unknown === 0) continue;
			const left = this.counts[i] - flagged;
			if (left === 0) {
				for (const nb of this.nbs[i]) if (known[nb] === UNKNOWN) this.reveal(nb);
			} else if (left === unknown) {
				for (const nb of this.nbs[i]) if (known[nb] === UNKNOWN) this.markMine(nb);
			}
		}
		this.queue.length = 0;
	}

	constraint(i) {
		const unknown = [];
		let flagged = 0;
		for (const nb of this.nbs[i]) {
			const k = this.known[nb];
			if (k === UNKNOWN) unknown.push(nb);
			else if (k === MINE) flagged++;
		}
		return [unknown, this.counts[i] - flagged];
	}

	// Правило 2: пары цифр, у которых закрытые соседи одной входят в соседей другой.
	subsetPass() {
		if (this.dirtyList.length === 0) return false;
		const changed = new Set();
		for (const d of this.dirtyList) {
			this.dirty[d] = 0;
			changed.add(d);
		}
		this.dirtyList = [];
		const cons = new Map();
		for (const d of changed) {
			for (const nb of this.nbs[d]) {
				for (const c2 of this.nbs[nb]) {
					if (!cons.has(c2) && this.known[c2] === SAFE && this.counts[c2] > 0) {
						const c = this.constraint(c2);
						cons.set(c2, c[0].length ? c : null);
					}
				}
			}
		}
		for (const [k, v] of cons) if (v === null) cons.delete(k);
		let progress = false;
		for (const [a, ca] of cons) {
			const ua = ca[0];
			const ma = ca[1];
			const seen = new Set();
			for (const u of ua) {
				for (const b of this.nbs[u]) {
					if (b === a || seen.has(b) || !cons.has(b)) continue;
					seen.add(b);
					if (!changed.has(a) && !changed.has(b)) continue;
					const cb = cons.get(b);
					const ub = cb[0];
					if (ub.length <= ua.length) continue;
					let inside = true;
					for (const x of ua) {
						if (!ub.includes(x)) {
							inside = false;
							break;
						}
					}
					if (!inside) continue;
					const diff = [];
					for (const x of ub) if (!ua.includes(x) && this.known[x] === UNKNOWN) diff.push(x);
					if (!diff.length) continue;
					const dm = cb[1] - ma;
					if (dm === 0) {
						for (const x of diff) this.reveal(x);
						progress = true;
					} else if (dm === diff.length) {
						for (const x of diff) this.markMine(x);
						progress = true;
					}
				}
			}
		}
		return progress;
	}

	// Правило 3: общий счёт мин.
	globalPass() {
		const unknown = [];
		for (let i = 0; i < this.known.length; i++) if (this.known[i] === UNKNOWN) unknown.push(i);
		if (!unknown.length) return false;
		const left = this.mineTotal - this.knownMines;
		if (left === 0) {
			for (const c of unknown) this.reveal(c);
			return true;
		}
		if (left === unknown.length) {
			for (const c of unknown) this.markMine(c);
			return true;
		}
		return false;
	}

	// Переносит мину с границы открытой области в закрытую глубину. false — переносить некуда.
	repair(rng) {
		const frontierMines = [];
		const deepFree = [];
		for (let i = 0; i < this.known.length; i++) {
			if (this.known[i] !== UNKNOWN) continue;
			let atFrontier = false;
			for (const nb of this.nbs[i]) {
				if (this.known[nb] === SAFE) {
					atFrontier = true;
					break;
				}
			}
			if (atFrontier) {
				if (this.mines[i] === 1) frontierMines.push(i);
			} else if (this.mines[i] === 0) {
				deepFree.push(i);
			}
		}
		if (!frontierMines.length || !deepFree.length) return false;
		const from = frontierMines[rng.range(0, frontierMines.length - 1)];
		const to = deepFree[rng.range(0, deepFree.length - 1)];
		this.mines[from] = 0;
		this.mines[to] = 1;
		this.touch(from);
		this.touch(to);
		for (const nb of this.nbs[from]) {
			this.counts[nb]--;
			this.push(nb);
		}
		for (const nb of this.nbs[to]) {
			this.counts[nb]++;
			this.push(nb);
		}
		return true;
	}
}
