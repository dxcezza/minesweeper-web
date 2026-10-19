// Стиль «Блоки»: объёмный блок с фаской и тёмный пустой слот сетки.
import { WHITE, BLACK } from "./color.js";

const shadeCache = new Map();

// Оттенки граней: верх, лево, право, низ, центр сверху, центр снизу.
function shades(color) {
	const key = color.css();
	let s = shadeCache.get(key);
	if (!s) {
		if (shadeCache.size > 64) shadeCache.clear();
		s = [color.lerp(WHITE, 0.38), color.lerp(WHITE, 0.16), color.lerp(BLACK, 0.18), color.lerp(BLACK, 0.34),
			color.lerp(WHITE, 0.06), color.lerp(BLACK, 0.05)].map((c) => c.css(1));
		shadeCache.set(key, s);
	}
	return s;
}

function quad(g, pts, color) {
	g.fillStyle = color;
	g.beginPath();
	g.moveTo(pts[0], pts[1]);
	g.lineTo(pts[2], pts[3]);
	g.lineTo(pts[4], pts[5]);
	g.lineTo(pts[6], pts[7]);
	g.closePath();
	g.fill();
}

export function drawBlock(g, x, y, w, h, color, scale = 1, alpha = 1) {
	if (scale <= 0.01 || alpha <= 0) return;
	const cx = x + w / 2;
	const cy = y + h / 2;
	w *= scale;
	h *= scale;
	x = cx - w / 2;
	y = cy - h / 2;
	const b = w * 0.15;
	const ex = x + w;
	const ey = y + h;
	const sh = shades(color);
	g.save();
	g.globalAlpha *= alpha;
	// Грани встык: без сглаживания между ними видны бы были щели.
	quad(g, [x, y, ex, y, ex - b, y + b, x + b, y + b], sh[0]);
	quad(g, [x, y, x + b, y + b, x + b, ey - b, x, ey], sh[1]);
	quad(g, [ex, y, ex, ey, ex - b, ey - b, ex - b, y + b], sh[2]);
	quad(g, [x, ey, x + b, ey - b, ex - b, ey - b, ex, ey], sh[3]);
	const grad = g.createLinearGradient(0, y + b, 0, ey - b);
	grad.addColorStop(0, sh[4]);
	grad.addColorStop(1, sh[5]);
	g.fillStyle = grad;
	g.fillRect(x + b - 0.3, y + b - 0.3, w - 2 * b + 0.6, h - 2 * b + 0.6);
	g.restore();
}

export function drawSlot(g, x, y, w, h) {
	g.fillStyle = "#1b1b1b";
	g.beginPath();
	g.roundRect(x, y, w, h, 8);
	g.fill();
	g.strokeStyle = "#232323";
	g.lineWidth = 1;
	g.beginPath();
	g.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 7.5);
	g.stroke();
}
