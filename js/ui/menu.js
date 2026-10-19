// Главное меню: заголовок, превью поля, карточки режимов «Сплин» и «Классика», круглые кнопки разделов.
import { h, label, displayLabel, blockTitle, modeCard, roundButton, screenRoot, Icon } from "./widgets.js";
import { BoardView } from "../boardview.js";
import { Save } from "../save.js";
import { Player } from "../player.js";
import { Difficulty } from "../core/config.js";
import { Pal } from "../palette.js";
import { fmtInt, fmtTime } from "../format.js";

export class MainMenu {
	constructor(app) {
		this.app = app;
		this.el = h("div", "screen menu");
		const pal = Pal.current;
		pal.setStage(0);
		app.applyColors();
		const root = screenRoot(this.el, 32, 18);

		if (pal.isBlocks()) {
			root.append(label("С П Л И Н", 56, pal.text, "center", 700));
			const bt = blockTitle();
			bt.classList.add("center");
			root.append(bt);
		} else {
			const title = h("div", "menu-title");
			title.append(displayLabel("СПЛИН", 120, pal.hidden_a), displayLabel("САПЁР", 120, pal.hidden_b));
			root.append(title);
		}

		const tag = label("Пять полей на время или одно — на скорость.", 26, pal.muted, "center", 400);
		tag.classList.add("wrap");
		root.append(tag);
		// Ник с сайта, на котором встроена игра.
		this.playerLabel = label("", 24, pal.accent2, "center", 600);
		root.append(this.playerLabel);
		this._onPlayer = () => this.showPlayer();
		Player.on("changed", this._onPlayer);
		this.showPlayer();

		this.preview = new BoardView({ interactive: false });
		this.preview.el.style.height = "280px";
		this.preview.el.style.flex = "none";
		this.preview.setBoard(BoardView.demoBoard());
		root.append(this.preview.el);

		root.append(h("div", "grow"));

		// Два режима вместо одной кнопки «Играть»; последний выбранный обведён.
		const lastClassic = Save.settings.last_mode === "classic";
		const bestScore = Save.leaderboard.length ? Save.leaderboard[0].score : 0;
		root.append(modeCard("Сплин", "5 полей подряд · время тает · предметы и Раскрытие",
			bestScore > 0 ? fmtInt(bestScore) : "—", "Рекорд", !lastClassic, () => app.showGame()));
		const diff = Math.max(0, Math.min(Save.settings.classic_difficulty, Difficulty.count() - 1));
		const bestTime = Save.bestTime(Difficulty.recordKey(diff, Save.settings.no_guess));
		root.append(modeCard("Классика", "6 сложностей · секундомер · чистый сапёр",
			bestTime >= 0 ? fmtTime(bestTime) : "—", Difficulty.info(diff).name, lastClassic, () => app.showDifficulty()));

		const links = h("div", "links");
		links.append(
			roundButton(Icon.TROPHY, () => app.showLeaderboard(""), 92),
			roundButton(Icon.HELP, () => app.showHelp(), 92),
			roundButton(Icon.GEAR, () => app.showSettings(), 92),
		);
		root.append(links);
	}

	showPlayer() {
		this.playerLabel.textContent = Player.known() ? `Играет ${Save.playerName()}` : "";
		this.playerLabel.style.display = Player.known() ? "" : "none";
	}

	destroy() {
		this.preview.destroy();
		Player.off("changed", this._onPlayer);
	}
}
