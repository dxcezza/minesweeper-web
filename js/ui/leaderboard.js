// Рекорды двух режимов на вкладках. «Сплин» — топ-20 по очкам; «Классика» — сложность,
// статистика и топ-10 по времени (с опцией «Без угадываний» — своя таблица). Подсветка последнего результата.
import { h, label, capsLabel, displayLabel, tabs, chip, toggle, pillButton, screenRoot } from "./widgets.js";
import { Overlay } from "./overlay.js";
import { Save } from "../save.js";
import { Difficulty } from "../core/config.js";
import { Pal } from "../palette.js";
import { fmtInt, fmtTime, fmtDate } from "../format.js";

const SPLEEN = 0;
const CLASSIC = 1;

export class LeaderboardScreen {
	constructor(app, highlightId = "") {
		this.app = app;
		this.highlightId = highlightId;
		this.el = h("div", "screen leaderboard");
		this.difficulty = Math.max(0, Math.min(Save.settings.classic_difficulty, Difficulty.count() - 1));
		this.noGuess = Save.settings.no_guess;
		const classicResult = highlightId.startsWith("c");
		if (classicResult) this.selectEntryTable(highlightId);
		this.mode = classicResult || (!highlightId && Save.settings.last_mode === "classic") ? CLASSIC : SPLEEN;
		const pal = Pal.current;
		const root = screenRoot(this.el, 28, 16);
		root.append(displayLabel("РЕКОРДЫ", 60, pal.accent));
		root.append(tabs(["Сплин", "Классика"], this.mode, (k) => {
			this.mode = k;
			this.refresh();
		}));

		this.classicBar = h("div", "classic-bar");
		const flow = h("div", "chips");
		this.chips = [];
		for (let i = 0; i < Difficulty.count(); i++) {
			const c = chip(Difficulty.info(i).name, () => {
				this.difficulty = i;
				this.refresh();
			});
			flow.append(c);
			this.chips.push(c);
		}
		this.classicBar.append(flow, toggle("Без угадываний", this.noGuess, (on) => {
			this.noGuess = on;
			this.refresh();
		}, 26));
		root.append(this.classicBar);

		this.stats = h("div", "tiles");
		root.append(this.stats);
		this.headerSlot = h("div", "");
		root.append(this.headerSlot);
		this.list = h("div", "scroll table");
		root.append(this.list);

		const buttons = h("div", "button-row");
		buttons.append(pillButton("Назад", () => app.showMenu(), 28), pillButton("Сбросить", () => this.confirmReset(), 28, true));
		root.append(buttons);

		this._onChange = () => this.refresh();
		Save.on("leaderboardChanged", this._onChange);
		Save.on("classicChanged", this._onChange);
		this.refresh();
	}

	destroy() {
		Save.off("leaderboardChanged", this._onChange);
		Save.off("classicChanged", this._onChange);
	}

	handleBack() {
		if (this.confirm) {
			this.closeConfirm();
			return true;
		}
		return false;
	}

	// Открыть таблицу, где лежит результат id: нужная сложность и «без угадываний».
	selectEntryTable(id) {
		for (let i = 0; i < Difficulty.count(); i++) {
			for (const ng of [false, true]) {
				if (Save.classicEntries(Difficulty.recordKey(i, ng)).some((e) => e.id === id)) {
					this.difficulty = i;
					this.noGuess = ng;
					return;
				}
			}
		}
	}

	refresh() {
		this.list.innerHTML = "";
		this.stats.innerHTML = "";
		this.headerSlot.innerHTML = "";
		const classic = this.mode === CLASSIC;
		this.classicBar.style.display = classic ? "" : "none";
		this.chips.forEach((c, i) => c.setActive(i === this.difficulty));
		if (classic) this.refreshClassic();
		else this.refreshSpleen();
	}

	refreshSpleen() {
		const s = Save.stats;
		this.addTiles([[String(s.games), "забегов"], [String(s.wins), "побед"], [fmtInt(s.best_score), "лучший"]]);
		const widths = [40, 0, 130, 100, 112];
		this.setHeader(["#", "Имя", "Счёт", "Этапы", "Дата"], widths);
		const entries = Save.leaderboard;
		if (!entries.length) {
			this.list.append(label("Здесь появятся ваши результаты.", 26, Pal.current.muted, "center"));
			return;
		}
		entries.forEach((e, i) => {
			const me = e.id === this.highlightId;
			this.list.append(this.row([String(i + 1), e.name, fmtInt(e.score), e.won ? "★" : `${e.stages}/5`, fmtDate(e.date)], widths, me, false));
		});
	}

	refreshClassic() {
		const key = Difficulty.recordKey(this.difficulty, this.noGuess);
		const st = Save.classicStatsFor(key);
		const pct = st.games > 0 ? Math.round((100 * st.wins) / st.games) : 0;
		this.addTiles([[String(st.games), "игр"], [String(st.wins), "побед"], [`${pct}%`, "побед"], [String(st.best_streak), "серия"]]);
		const widths = [40, 0, 130, 112];
		this.setHeader(["#", "Имя", "Время", "Дата"], widths);
		const entries = Save.classicEntries(key);
		if (!entries.length) {
			this.list.append(label("Пройдите поле — здесь появится время.", 26, Pal.current.muted, "center"));
			return;
		}
		entries.forEach((e, i) => {
			const me = e.id === this.highlightId;
			this.list.append(this.row([String(i + 1), e.name, fmtTime(e.time), fmtDate(e.date)], widths, me, false));
		});
	}

	addTiles(pairs) {
		for (const [value, cap] of pairs) {
			const tile = h("div", "card tile");
			tile.append(label(value, 34, Pal.current.text, "center", 700), capsLabel(cap, 19, Pal.current.muted, "center"));
			this.stats.append(tile);
		}
	}

	setHeader(cells, widths) {
		this.headerSlot.append(this.row(cells, widths, false, true));
	}

	// Все строки в одинаковой обёртке, чтобы подсветка не сдвигала колонки.
	row(cells, widths, highlighted, isHeader) {
		const r = h("div", "lb-row" + (highlighted ? " me" : "") + (isHeader ? " head" : ""));
		cells.forEach((text, k) => {
			const c = h("div", "lb-cell" + (k >= 2 ? " right" : ""), isHeader ? text.toUpperCase() : text);
			if (widths[k] === 0) c.classList.add("grow");
			else c.style.width = widths[k] + "px";
			r.append(c);
		});
		return r;
	}

	confirmReset() {
		const classic = this.mode === CLASSIC;
		const o = new Overlay("Сбросить рекорды?", classic ? "Классика · все сложности" : "Сплин");
		o.addText("Результаты и статистика режима будут удалены. Это нельзя отменить.", 26, Pal.current.muted);
		o.addButtons([["Сбросить", () => {
			if (classic) Save.resetClassic();
			else Save.resetLeaderboard();
			this.closeConfirm();
		}], ["Отмена", () => this.closeConfirm(), true]]);
		this.confirm = o;
		this.el.append(o.el);
	}

	closeConfirm() {
		this.confirm?.remove();
		this.confirm = null;
	}
}
