// Выбор сложности «Классики»: шесть ступеней с рекордами, опция «Без угадываний», «Играть».
import { h, label, displayLabel, diffRow, toggle, roundButton, pillButton, screenRoot, Icon } from "./widgets.js";
import { Save } from "../save.js";
import { Difficulty } from "../core/config.js";
import { Pal } from "../palette.js";

export class DifficultyScreen {
	constructor(app) {
		this.app = app;
		this.el = h("div", "screen difficulty");
		this.selected = Math.max(0, Math.min(Save.settings.classic_difficulty, Difficulty.count() - 1));
		Pal.current.setClassic(this.selected);
		app.applyColors();
		const pal = Pal.current;
		const root = screenRoot(this.el, 32, 16);
		this.title = displayLabel("КЛАССИКА", 64, pal.isBlocks() ? pal.text : pal.accent);
		root.append(this.title);
		root.append(label("Выберите сложность · рекорд — лучшее время", 24, pal.muted, "center", 400));
		this.list = h("div", "scroll list");
		root.append(this.list);
		root.append(toggle("Без угадываний", Save.settings.no_guess, (on) => {
			Save.setSetting("no_guess", on);
			this.fillRows();
		}));
		const note = label("Поле всегда решается логикой, без 50/50. Рекорды — отдельные.", 22, pal.muted, "left", 400);
		note.classList.add("wrap");
		root.append(note);
		const go = h("div", "go-row");
		go.append(roundButton(Icon.BACK, () => app.showMenu(), 92));
		const play = pillButton("Играть", () => this.play(), 36);
		play.classList.add("grow");
		go.append(play, h("div", "spacer-92"));
		root.append(go);
		this.fillRows();
	}

	fillRows() {
		this.list.innerHTML = "";
		const ng = Save.settings.no_guess;
		for (let i = 0; i < Difficulty.count(); i++) {
			this.list.append(diffRow(i, Save.bestTime(Difficulty.recordKey(i, ng)), i === this.selected, () => this.select(i)));
		}
	}

	// Повторный тап по выбранной строке — сразу в игру.
	select(i) {
		if (i === this.selected) {
			this.play();
			return;
		}
		this.selected = i;
		Save.settings.classic_difficulty = i;
		Pal.current.setClassic(i);
		this.app.applyColors();
		this.fillRows();
	}

	play() {
		Save.settings.classic_difficulty = this.selected;
		Save.saveSettings();
		this.app.showClassic(this.selected);
	}

	handleBack() {
		this.app.showMenu();
		return true;
	}

	destroy() {}
}
