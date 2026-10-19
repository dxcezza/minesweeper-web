// Цвет с компонентами 0..1 (как Color в Godot): смешивание, осветление, HSV, CSS-строка.

export class Color {
	constructor(r, g, b, a = 1) {
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;
	}

	static hex(s) {
		s = s.replace("#", "");
		const n = parseInt(s.slice(0, 6), 16);
		const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1;
		return new Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a);
	}

	static fromHsv(h, s, v, a = 1) {
		h = ((h % 1) + 1) % 1;
		const i = Math.floor(h * 6);
		const f = h * 6 - i;
		const p = v * (1 - s);
		const q = v * (1 - f * s);
		const t = v * (1 - (1 - f) * s);
		const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
		return new Color(r, g, b, a);
	}

	get h() {
		const { r, g, b } = this;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const d = max - min;
		if (d === 0) return 0;
		let h;
		if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		return h / 6;
	}

	get s() {
		const max = Math.max(this.r, this.g, this.b);
		return max === 0 ? 0 : (max - Math.min(this.r, this.g, this.b)) / max;
	}

	get v() {
		return Math.max(this.r, this.g, this.b);
	}

	alpha(a) {
		return new Color(this.r, this.g, this.b, a);
	}

	lerp(c, t) {
		return new Color(this.r + (c.r - this.r) * t, this.g + (c.g - this.g) * t, this.b + (c.b - this.b) * t, this.a + (c.a - this.a) * t);
	}

	lightened(k) {
		return new Color(this.r + (1 - this.r) * k, this.g + (1 - this.g) * k, this.b + (1 - this.b) * k, this.a);
	}

	darkened(k) {
		return new Color(this.r * (1 - k), this.g * (1 - k), this.b * (1 - k), this.a);
	}

	luminance() {
		return 0.2126 * this.r + 0.7152 * this.g + 0.0722 * this.b;
	}

	css(a = this.a) {
		const c = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
		return `rgba(${c(this.r)},${c(this.g)},${c(this.b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
	}

	hexString() {
		const c = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, "0");
		return "#" + c(this.r) + c(this.g) + c(this.b);
	}
}

export const WHITE = new Color(1, 1, 1);
export const BLACK = new Color(0, 0, 0);
