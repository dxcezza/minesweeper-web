// Детерминированный генератор (mulberry32): одно зерно — одно и то же поле.

export class Rng {
	constructor(seed) {
		this.state = seed >>> 0;
	}

	// 32-битное целое без знака.
	randi() {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (t ^ (t >>> 14)) >>> 0;
	}

	// [0, 1)
	randf() {
		return this.randi() / 4294967296;
	}

	// Целое из [from, to] включительно.
	range(from, to) {
		return from + Math.floor(this.randf() * (to - from + 1));
	}
}

export function randomSeed() {
	return (Math.random() * 4294967296) >>> 0;
}

// Смешивание чисел в зерно (как hash([run_seed, stage]) в Godot-версии).
export function hashSeed(...parts) {
	let h = 2166136261;
	for (const p of parts) {
		h = Math.imul(h ^ (p >>> 0), 16777619);
		h ^= h >>> 13;
	}
	return h >>> 0;
}
