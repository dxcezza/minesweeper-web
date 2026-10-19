// Экран «Классики»: одно поле выбранной сложности, секундомер вверх с первого тапа,
// без предметов, маны, Раскрытия и очков. Результат — время; рекорды на каждую сложность.
import { BoardScreen } from "./boardscreen.js";
import { Overlay } from "./overlay.js";
import { modeButton, meterBar, caption, vibrate, Icon } from "./widgets.js";
import { Board } from "../core/board.js";
import { Difficulty } from "../core/config.js";
import { randomSeed } from "../core/rng.js";
import { Save } from "../save.js";
import { Sfx, Music } from "../audio.js";
import { Pal } from "../palette.js";
import { fmtTime } from "../format.js";

// Подтверждать сброс, только если партия идёт дольше этого.
const RESTART_CONFIRM_SEC = 10;
const MAX_SECONDS = 5999;

export class ClassicScreen extends BoardScreen {
	constructor(app, difficulty) {
		super(app);
		this.difficulty = difficulty;
		this.noGuess = false;
		this.elapsed = 0;
		this.running = false;
		this.paused = false;
		this.shownSecond = -1;
		this.buildUi();
		this.newGame();
	}

	// Карточка «мины · время · рекорд», лоток «обзор · открыто · режим».
	buildUi() {
		const pal = Pal.current;
		const neon = !pal.isBlocks();
		const root = this.buildFrame();
		const row = this.buildCard(root);
		this.minesLabel = this.stat(row, Icon.FLAG, neon ? pal.danger : pal.text, "Мины", pal.text);
		this.addDivider(row);
		this.timeLabel = this.stat(row, Icon.CLOCK, neon ? pal.accent : pal.text, "Время", pal.text);
		this.addDivider(row);
		this.bestLabel = this.stat(row, Icon.TROPHY, neon ? pal.accent2 : pal.text, "Рекорд", neon ? pal.accent2 : pal.text);
		this.buildBoard(root);
		this.view.zoomStart = true;
		this.view.onZoomChanged = () => this.updateOverview();
		const tray = this.buildTray(root);
		this.overviewButton = modeButton(Icon.FIT, () => this.view.toggleOverview());
		this.overviewColumn = this.trayColumn(tray, this.overviewButton, caption("Обзор"));
		this.progress = meterBar({ max: 100 });
		this.progressLabel = caption("Открыто 0%");
		this.trayColumn(tray, this.progress, this.progressLabel).classList.add("grow");
		this.addModeColumn(tray);
	}

	newGame() {
		this.runOver = false;
		this.resultId = "";
		this.nameEdit = null;
		this.elapsed = 0;
		this.running = false;
		this.paused = false;
		this.shownSecond = -1;
		this.noGuess = Save.settings.no_guess;
		Save.settings.classic_difficulty = this.difficulty;
		Save.settings.last_mode = "classic";
		Save.saveSettings();
		// «Блоки»: у каждой сложности свой цвет, как у этапов «Сплина».
		Pal.current.setClassic(this.difficulty);
		this.app.applyColors();
		const b = new Board(Difficulty.config(this.difficulty), randomSeed());
		b.noGuess = this.noGuess;
		b.on("revealed", (cells) => this.onCellsRevealed(cells));
		b.on("mineHit", () => this.onMineHit());
		b.on("cleared", () => this.onCleared());
		this.attachBoard(b);
		const d = Difficulty.info(this.difficulty);
		this.titleLabel.textContent = d.name.toUpperCase();
		const best = Save.bestTime(Difficulty.recordKey(this.difficulty, this.noGuess));
		this.bestLabel.textContent = best >= 0 ? fmtTime(best) : "—";
		this.updateMines();
		this.updateTime();
		this.updateProgress(false);
		this.updateOverview();
		Music.playClassic(this.difficulty);
	}

	update(delta) {
		if (!this.running || this.paused || this.runOver) return;
		this.elapsed = Math.min(this.elapsed + delta, MAX_SECONDS);
		this.updateTime();
	}

	onCellsRevealed(indices) {
		if (!this.board.finished) this.running = true;
		this.updateProgress(true);
		if (indices.length >= 12) vibrate(18);
	}

	async onMineHit() {
		this.running = false;
		vibrate(200);
		if (!(await this.wait(1.2)) || this.runOver) return;
		this.finish(false);
	}

	async onCleared() {
		this.running = false;
		this.updateMines();
		this.updateProgress(true);
		if (!(await this.wait(0.45))) return;
		Sfx.play("win");
		vibrate(80);
		if (!(await this.wait(0.75))) return;
		this.closeOverlay();
		this.finish(true);
	}

	seconds() {
		return Math.floor(this.elapsed);
	}

	finish(won) {
		if (this.runOver) return;
		this.runOver = true;
		this.running = false;
		this.closeOverlay();
		const d = Difficulty.info(this.difficulty);
		const saved = Save.submitClassic(this.difficulty, this.noGuess, won, this.seconds());
		this.resultId = saved.id;
		const st = saved.stats;
		let sub = `${d.name} · ${d.w}×${d.h} · ${d.mines} мин`;
		if (this.noGuess) sub += " · без угадываний";
		const o = new Overlay(won ? "Поле очищено" : "Подрыв", sub);
		const pal = Pal.current;
		if (won) {
			o.addTotal("ВРЕМЯ", fmtTime(this.seconds()));
			o.addRow("Прошлый рекорд", saved.prevBest >= 0 ? fmtTime(saved.prevBest) : "—");
			o.addRow("Победы на сложности", `${st.wins} из ${st.games} · ${Math.round((100 * st.wins) / Math.max(st.games, 1))}%`);
			if (saved.rank === 0) Sfx.play("record");
			if (saved.rank >= 0) {
				o.addText(saved.rank === 0 ? "Новый рекорд!" : `Место в таблице: ${saved.rank + 1}`, 30, pal.accent2);
				this.addNameRow(o);
			} else {
				this.nameEdit = null;
			}
		} else {
			Sfx.play("lose");
			this.nameEdit = null;
			let flags = 0;
			let right = 0;
			const b = this.board;
			for (let i = 0; i < b.cellCount(); i++) {
				if (b.isFlag(i)) {
					flags++;
					right += b.mines[i];
				}
			}
			o.addRow("Время", fmtTime(this.seconds()));
			o.addRow("Открыто клеток", `${b.revealedSafe} из ${b.safeCount()} · ${Math.floor((100 * b.revealedSafe) / Math.max(b.safeCount(), 1))}%`);
			o.addRow("Флаги верно", `${right} из ${flags}`);
		}
		o.addButton("Ещё раз", () => {
			this.commitName();
			this.closeOverlay();
			this.newGame();
		});
		o.addButtons([["Сложность", () => {
			this.commitName();
			this.app.showDifficulty();
		}, true], ["В меню", () => this.onResultsMenu(), true]]);
		this.showOverlay(o);
	}

	// Сброс: сразу новое поле; подтверждение — только если партия идёт дольше RESTART_CONFIRM_SEC.
	confirmRestart() {
		if (this.overlay || this.runOver || (this.board && this.board.finished)) return;
		if (!this.running || this.elapsed < RESTART_CONFIRM_SEC) {
			this.newGame();
			return;
		}
		this.setTimerPaused(true);
		this.pauseOpen = true;
		const o = new Overlay("Новое поле?", "Текущая партия не засчитается");
		o.addButtons([["Заново", () => this.onPauseRestart()], ["Отмена", () => this.resume(), true]]);
		this.showOverlay(o);
	}

	// --- Пауза ---

	setTimerPaused(paused) {
		this.paused = paused;
	}

	pauseSubtitle() {
		return `${Difficulty.info(this.difficulty).name} · ${fmtTime(this.seconds())}`;
	}

	fillPause(o) {
		o.addButtons([["Заново", () => this.onPauseRestart(), true], ["Сложность", () => this.app.showDifficulty(), true]]);
		o.addText("Поле скрыто, пока игра на паузе.", 22, Pal.current.muted);
	}

	onPauseRestart() {
		this.closeOverlay();
		this.newGame();
	}

	// --- HUD ---

	updateMines() {
		if (this.board) this.minesLabel.textContent = String(this.board.flagsLeft());
	}

	updateTime() {
		const s = this.seconds();
		if (s === this.shownSecond) return;
		this.shownSecond = s;
		this.timeLabel.textContent = fmtTime(s);
	}

	updateProgress(animate) {
		const b = this.board;
		const pct = Math.floor((100 * b.revealedSafe) / Math.max(b.safeCount(), 1));
		this.progress.setValue(pct, animate);
		this.progressLabel.textContent = `ОТКРЫТО ${pct}%`;
	}

	// «Обзор» нужен только полям, которые целиком не помещаются с удобной клеткой.
	updateOverview() {
		if (!this.overviewColumn || !this.view) return;
		const needed = this.view.canOverview();
		this.overviewColumn.style.display = needed ? "" : "none";
		this.overviewButton.setActive(needed && !this.view.isZoomed());
	}
}
