// Простые сигналы: on(имя, fn) и emit(имя, ...аргументы).

export class Emitter {
	constructor() {
		this._handlers = new Map();
	}

	on(name, fn) {
		if (!this._handlers.has(name)) this._handlers.set(name, []);
		this._handlers.get(name).push(fn);
		return fn;
	}

	off(name, fn) {
		const list = this._handlers.get(name);
		if (!list) return;
		const k = list.indexOf(fn);
		if (k >= 0) list.splice(k, 1);
	}

	emit(name, ...args) {
		const list = this._handlers.get(name);
		if (!list) return;
		for (const fn of [...list]) fn(...args);
	}
}
