// Минималистичные векторные иконки, рисуются в canvas в квадрат (x, y, w, h).
import { Pal } from "./palette.js";

export const Icon = {
	FLAG: 0, MINE: 1, CLOCK: 2, MANA: 3, ECHO: 4, SHOVEL: 5, PAUSE: 6, TARGET: 7, CROSS: 8,
	RESTART: 9, STAR: 10, TROPHY: 11, HELP: 12, GEAR: 13, FIT: 14, BACK: 15,
};

const TAU = Math.PI * 2;

function line(g, a, b, color, w) {
	g.strokeStyle = color;
	g.lineWidth = w;
	g.beginPath();
	g.moveTo(a[0], a[1]);
	g.lineTo(b[0], b[1]);
	g.stroke();
}

function polyline(g, pts, color, w, closed = false) {
	g.strokeStyle = color;
	g.lineWidth = w;
	g.lineJoin = "round";
	g.beginPath();
	g.moveTo(pts[0][0], pts[0][1]);
	for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
	if (closed) g.closePath();
	g.stroke();
	g.lineJoin = "miter";
}

function fill(g, pts, color) {
	g.fillStyle = color;
	g.beginPath();
	g.moveTo(pts[0][0], pts[0][1]);
	for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
	g.closePath();
	g.fill();
}

function circle(g, c, r, color) {
	g.fillStyle = color;
	g.beginPath();
	g.arc(c[0], c[1], Math.max(r, 0), 0, TAU);
	g.fill();
}

function ring(g, c, r, color, w, a0 = 0, a1 = TAU) {
	g.strokeStyle = color;
	g.lineWidth = w;
	g.beginPath();
	g.arc(c[0], c[1], Math.max(r, 0), a0, a1);
	g.stroke();
}

function bezier(a, c, b, t) {
	const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
	const q = [c[0] + (b[0] - c[0]) * t, c[1] + (b[1] - c[1]) * t];
	return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

function rotate(v, a) {
	const c = Math.cos(a);
	const s = Math.sin(a);
	return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

// color, hole — CSS-строки; hole = null — без «отверстия».
export function drawIcon(g, kind, x, y, w, h, color, hole = null) {
	const s = Math.min(w, h);
	const ox = x + w / 2 - s / 2;
	const oy = y + h / 2 - s / 2;
	const P = (px, py) => [ox + px * s, oy + py * s];
	const R = (v, a) => {
		const r = rotate([v[0] - 0.5, v[1] - 0.5], a);
		return [ox + (0.5 + r[0]) * s, oy + (0.5 + r[1]) * s];
	};
	g.save();
	g.lineCap = "butt";
	switch (kind) {
		case Icon.FLAG:
			line(g, P(0.37, 0.18), P(0.37, 0.84), color, s * 0.075);
			fill(g, [P(0.37, 0.16), P(0.78, 0.34), P(0.37, 0.53)], color);
			line(g, P(0.24, 0.84), P(0.52, 0.84), color, s * 0.075);
			break;
		case Icon.MINE: {
			const c = P(0.5, 0.5);
			for (let k = 0; k < 8; k++) {
				const d = [Math.cos((k * TAU) / 8), Math.sin((k * TAU) / 8)];
				const n = [-d[1], d[0]];
				const pt = (a, b) => [c[0] + d[0] * s * a + n[0] * s * b, c[1] + d[1] * s * a + n[1] * s * b];
				fill(g, [pt(0.2, 0.06), pt(0.36, 0.05), pt(0.36, -0.05), pt(0.2, -0.06)], color);
			}
			circle(g, c, s * 0.27, color);
			if (hole) {
				g.fillStyle = hole;
				g.fillRect(c[0] - s * 0.055, c[1] - s * 0.055, s * 0.11, s * 0.11);
			}
			break;
		}
		case Icon.CLOCK: {
			const c = P(0.5, 0.54);
			ring(g, c, s * 0.29, color, s * 0.075);
			line(g, c, [c[0], c[1] - s * 0.17], color, s * 0.07);
			line(g, c, [c[0] + s * 0.13, c[1]], color, s * 0.07);
			line(g, P(0.42, 0.12), P(0.58, 0.12), color, s * 0.075);
			break;
		}
		case Icon.MANA:
			potion(g, ox, oy, s, color);
			break;
		case Icon.ECHO: {
			// «Раскрытие» — глаз. С hole — залитый, без него — контурный.
			const eye = [];
			for (let k = 0; k <= 24; k++) eye.push(bezier(P(0.05, 0.5), P(0.5, 0.08), P(0.95, 0.5), k / 24));
			for (let k = 1; k < 24; k++) eye.push(bezier(P(0.95, 0.5), P(0.5, 0.92), P(0.05, 0.5), k / 24));
			const c = P(0.5, 0.5);
			if (hole) {
				fill(g, eye, color);
				circle(g, c, s * 0.215, hole);
				circle(g, c, s * 0.13, color);
			} else {
				polyline(g, eye, color, s * 0.075, true);
				ring(g, c, s * 0.2, color, s * 0.06);
				circle(g, c, s * 0.1, color);
			}
			break;
		}
		case Icon.SHOVEL: {
			const a = -Math.PI / 4;
			line(g, R([0.5, 0.14], a), R([0.5, 0.56], a), color, s * 0.08);
			line(g, R([0.38, 0.14], a), R([0.62, 0.14], a), color, s * 0.08);
			fill(g, [[0.35, 0.55], [0.65, 0.55], [0.65, 0.72], [0.5, 0.9], [0.35, 0.72]].map((v) => R(v, a)), color);
			break;
		}
		case Icon.PAUSE:
			line(g, P(0.39, 0.3), P(0.39, 0.7), color, s * 0.11);
			line(g, P(0.61, 0.3), P(0.61, 0.7), color, s * 0.11);
			break;
		case Icon.TARGET: {
			const i = 0.1;
			const l = 0.22;
			for (const [cx, cy] of [[i, i], [1 - i, i], [1 - i, 1 - i], [i, 1 - i]]) {
				const dx = cx < 0.5 ? 1 : -1;
				const dy = cy < 0.5 ? 1 : -1;
				const p = P(cx, cy);
				line(g, p, [p[0] + dx * l * s, p[1]], color, s * 0.06);
				line(g, p, [p[0], p[1] + dy * l * s], color, s * 0.06);
			}
			break;
		}
		case Icon.CROSS:
			line(g, P(0.2, 0.2), P(0.8, 0.8), color, s * 0.09);
			line(g, P(0.8, 0.2), P(0.2, 0.8), color, s * 0.09);
			break;
		case Icon.RESTART:
			ring(g, P(0.5, 0.5), s * 0.32, color, s * 0.1, -Math.PI * 0.25, Math.PI * 1.55);
			fill(g, [P(0.86, 0.14), P(0.86, 0.42), P(0.6, 0.3)], color);
			break;
		case Icon.STAR: {
			circle(g, P(0.5, 0.5), s * 0.42, color);
			const pts = [];
			const c = P(0.5, 0.52);
			for (let k = 0; k < 10; k++) {
				const r = s * (k % 2 === 0 ? 0.25 : 0.11);
				const a = (k * Math.PI) / 5;
				pts.push([c[0] + Math.sin(a) * r, c[1] - Math.cos(a) * r]);
			}
			fill(g, pts, hole ?? "#000");
			break;
		}
		case Icon.TROPHY: {
			const cup = [];
			for (let k = 0; k <= 12; k++) cup.push(bezier(P(0.27, 0.15), P(0.27, 0.56), P(0.5, 0.58), k / 12));
			for (let k = 1; k <= 12; k++) cup.push(bezier(P(0.5, 0.58), P(0.73, 0.56), P(0.73, 0.15), k / 12));
			fill(g, cup, color);
			ring(g, P(0.27, 0.3), s * 0.11, color, s * 0.07, Math.PI * 0.5, Math.PI * 1.5);
			ring(g, P(0.73, 0.3), s * 0.11, color, s * 0.07, -Math.PI * 0.5, Math.PI * 0.5);
			fill(g, [P(0.455, 0.56), P(0.545, 0.56), P(0.545, 0.72), P(0.455, 0.72)], color);
			fill(g, [P(0.37, 0.72), P(0.63, 0.72), P(0.69, 0.85), P(0.31, 0.85)], color);
			break;
		}
		case Icon.HELP: {
			const w2 = s * 0.1;
			const hook = [];
			const c = P(0.5, 0.36);
			const rad = s * 0.17;
			for (let k = 0; k <= 20; k++) {
				const a = Math.PI * 1.05 + (Math.PI * 2.32 - Math.PI * 1.05) * (k / 20);
				hook.push([c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad]);
			}
			hook.push(P(0.5, 0.57), P(0.5, 0.63));
			g.lineCap = "round";
			polyline(g, hook, color, w2);
			g.lineCap = "butt";
			circle(g, P(0.5, 0.81), s * 0.068, color);
			break;
		}
		case Icon.GEAR: {
			const c = P(0.5, 0.5);
			const gear = [];
			const teeth = 8;
			const step = TAU / teeth;
			for (let k = 0; k < teeth; k++) {
				const base = k * step - Math.PI * 0.5;
				for (const [r, o] of [[0.33, -0.34], [0.44, -0.2], [0.44, 0.2], [0.33, 0.34]]) {
					const a = base + o * step;
					gear.push([c[0] + Math.cos(a) * s * r, c[1] + Math.sin(a) * s * r]);
				}
			}
			if (hole) {
				fill(g, gear, color);
				circle(g, c, s * 0.13, hole);
			} else {
				polyline(g, gear, color, s * 0.07, true);
				ring(g, c, s * 0.13, color, s * 0.07);
			}
			break;
		}
		case Icon.FIT: {
			const w2 = s * 0.085;
			for (const [cx, cy] of [[0.17, 0.17], [0.83, 0.17], [0.83, 0.83], [0.17, 0.83]]) {
				const p = P(cx, cy);
				const dx = Math.sign(0.5 - cx);
				const dy = Math.sign(0.5 - cy);
				polyline(g, [[p[0] + dx * s * 0.2, p[1]], p, [p[0], p[1] + dy * s * 0.2]], color, w2);
			}
			g.strokeStyle = color;
			g.lineWidth = w2 * 0.8;
			const q = P(0.38, 0.38);
			g.strokeRect(q[0], q[1], s * 0.24, s * 0.24);
			break;
		}
		case Icon.BACK:
			polyline(g, [P(0.6, 0.22), P(0.32, 0.5), P(0.6, 0.78)], color, s * 0.1);
			break;
	}
	g.restore();
}

// Зелье маны: наклонённая колба-конус, синяя жидкость, пробка.
// «Блоки» — цветная иллюстрация, неоновые пресеты — светящийся контур цвета color.
function potion(g, ox, oy, s, color) {
	const k = s / 24;
	const tf = (vx, vy) => {
		const r = rotate([vx - 12, vy - 13], 0.22);
		return [ox + (12 + r[0]) * k, oy + (13 + r[1]) * k];
	};
	const map = (list) => list.map(([a, b]) => tf(a, b));
	const body = map([[9.8, 9.6], [14.2, 9.6], [20.6, 19.4], [20.4, 21.4], [19.4, 21.6], [4.6, 21.6], [3.6, 21.4], [3.4, 19.4]]);
	const neck = map([[9.8, 5.6], [14.2, 5.6], [14.2, 9.8], [9.8, 9.8]]);
	const liquid = map([[7.4, 13.4], [16.6, 13.4], [20.6, 19.4], [20.4, 21.4], [19.4, 21.6], [4.6, 21.6], [3.6, 21.4], [3.4, 19.4]]);
	if (!Pal.current.isBlocks()) {
		g.globalAlpha *= 0.55;
		fill(g, liquid, color);
		g.globalAlpha /= 0.55;
		polyline(g, body, color, Math.max(1.5, s * 0.065), true);
		polyline(g, neck, color, Math.max(1.5, s * 0.065), true);
		line(g, tf(9.1, 5.4), tf(14.9, 5.4), "rgb(153,163,181)", Math.max(1.5, s * 0.07));
		return;
	}
	fill(g, body, "rgba(204,224,255,0.28)");
	fill(g, neck, "rgba(204,224,255,0.28)");
	const grad = g.createLinearGradient(0, oy + s * 0.5, 0, oy + s);
	grad.addColorStop(0, "#3a7bff");
	grad.addColorStop(1, "#0b2a96");
	fill(g, liquid, grad);
	fill(g, map([[12, 9.6], [14.2, 9.6], [21, 20.4], [13.2, 21.6]]), "rgba(5,13,48,0.28)");
	polyline(g, body, "rgba(232,240,252,0.9)", Math.max(1, s * 0.04), true);
	polyline(g, neck, "rgba(232,240,252,0.9)", Math.max(1, s * 0.04), true);
	line(g, tf(5.6, 19.6), tf(10.4, 11.2), "rgba(255,255,255,0.85)", Math.max(1, s * 0.045));
	line(g, tf(12, 9.8), tf(13.2, 21.4), "rgba(232,240,252,0.55)", Math.max(1, s * 0.03));
	fill(g, map([[10.4, 2.2], [13.8, 2.2], [13.8, 5.0], [10.4, 5.0]]), "#3b2a22");
	line(g, tf(9.1, 5.5), tf(14.9, 5.5), "#c7ccd6", s * 0.08);
}

// Иконка как отдельный элемент разметки: <canvas> нужного размера с учётом плотности пикселей.
export function iconCanvas(kind, px, color, hole = null, className = "icon") {
	const c = document.createElement("canvas");
	c.className = className;
	c.style.width = px + "px";
	c.style.height = px + "px";
	c.dataset.kind = kind;
	paintIconCanvas(c, kind, px, color, hole);
	return c;
}

export function paintIconCanvas(c, kind, px, color, hole = null) {
	const scale = Math.min(4, (window.devicePixelRatio || 1) * (window.__uiScale || 1));
	c.width = Math.ceil(px * scale);
	c.height = Math.ceil(px * scale);
	const g = c.getContext("2d");
	g.setTransform(scale, 0, 0, scale, 0, 0);
	g.clearRect(0, 0, px, px);
	drawIcon(g, kind, 0, 0, px, px, color, hole);
}
