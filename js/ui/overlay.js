// Лента поперёк экрана с кромками акцентного цвета поверх затемнения — для «Этап пройден», паузы и итогов.
// Перехватывает весь ввод под собой.
import { h, label, capsLabel, displayLabel, pillButton } from "./widgets.js";
import { Pal } from "../palette.js";

export class Overlay {
	constructor(titleText, subtitle = "") {
		this.el = h("div", "overlay");
		this.band = h("div", "band");
		this.content = h("div", "band-content");
		this.band.append(this.content);
		this.el.append(h("div", "dim"), this.band);
		if (subtitle) this.content.append(capsLabel(subtitle, 21, Pal.current.muted, "center"));
		const title = displayLabel(titleText.toUpperCase(), 64, Pal.current.text);
		title.classList.add("band-title");
		title.style.color = "#fff";
		this.content.append(title);
	}

	addText(text, size = 28, color = null) {
		const l = label(text, size, color, "center");
		l.classList.add("wrap");
		this.content.append(l);
		return l;
	}

	addRow(left, right, size = 27, color = null) {
		const l = label(left, size, color);
		l.classList.add("grow", "wrap");
		const r = label(right, size, color, "right", 700);
		r.classList.add("strong");
		const row = h("div", "row", l, r);
		this.content.append(row);
		return row;
	}

	// Итоговая строка: вторым акцентным цветом, крупно, с линией сверху.
	addTotal(left, right) {
		this.addSeparator();
		const l = label(left, 38, Pal.current.accent2);
		l.classList.add("grow", "strong");
		const r = label(right, 38, Pal.current.accent2, "right");
		r.classList.add("strong");
		this.content.append(h("div", "row", l, r));
	}

	addSeparator() {
		this.content.append(h("div", "separator"));
	}

	addButton(text, callback, secondary = false) {
		const b = pillButton(text, callback, 30, secondary);
		b.classList.add("center");
		this.content.append(b);
		return b;
	}

	// Несколько кнопок в ряд: [текст, колбэк, второстепенная?].
	addButtons(specs) {
		const row = h("div", "button-row");
		for (const [text, cb, secondary] of specs) {
			const b = pillButton(text, cb, 26, !!secondary);
			b.style.minWidth = "0";
			row.append(b);
		}
		this.content.append(row);
		return row;
	}

	addNode(node) {
		this.content.append(node);
	}

	remove() {
		this.el.remove();
	}
}
