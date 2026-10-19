// Экран «Сплина»: 5 этапов подряд, время тает, предметы, Раскрытие, очки и комбо.
// Общая раскладка, ввод и пауза — в BoardScreen.
import { BoardScreen } from "./boardscreen.js";
import { Overlay } from "./overlay.js";
import { echoButton, meterBar, caption, bump, vibrate, Icon } from "./widgets.js";
import { Session, ECHO_COST, MAX_MANA } from "../session.js";
import { State } from "../core/board.js";
import { Item, Score } from "../core/config.js";
import { Save, LEADERBOARD_MAX } from "../save.js";
import { Sfx, Music } from "../audio.js";
import { Pal } from "../palette.js";
import { T } from "../boardview.js";
import { fmtInt, fmtTime } from "../format.js";

// Комбо показывается в подписи карточки счёта вместо «СЧЁТ».
const COMBO_SHOW_SEC = 1.0;

export class GameScreen extends BoardScreen {
	constructor(app) {
		super(app);
		this.scoreShown = 0;
		this.echoArmed = false;
		this.comboToken = 0;
		this.buildUi();
		this._handlers = [
			["time", (s) => this.onTimeChanged(s)],
			["mana", (m) => this.onManaChanged(m)],
			["score", (s) => this.onScoreChanged(s)],
			["timeUp", () => this.onTimeUp()],
		];
		for (const [n, fn] of this._handlers) Session.on(n, fn);
		this.newRun();
	}

	destroy() {
		super.destroy();
		for (const [n, fn] of this._handlers) Session.off(n, fn);
		cancelAnimationFrame(this._scoreAnim);
		if (Session.runActive) Session.abortRun();
	}

	// Карточка «счёт · время · мины», лоток «Раскрытие · мана · режим».
	buildUi() {
		const pal = Pal.current;
		const neon = !pal.isBlocks();
		const root = this.buildFrame();
		const row = this.buildCard(root);
		this.scoreLabel = this.stat(row, Icon.STAR, neon ? pal.accent2 : pal.text, "Счёт", neon ? pal.accent2 : pal.text);
		this.addDivider(row);
		this.timeLabel = this.stat(row, Icon.CLOCK, neon ? pal.accent : pal.text, "Время", pal.text);
		this.addDivider(row);
		this.minesLabel = this.stat(row, Icon.FLAG, neon ? pal.danger : pal.text, "Мины", pal.text);
		this.buildBoard(root);
		const tray = this.buildTray(root);
		this.echoButton = echoButton(() => this.onEchoPressed());
		this.trayColumn(tray, this.echoButton, caption(`Раскрытие · ${ECHO_COST}`));
		this.manaBar = meterBar({ mana: true, max: MAX_MANA, step: ECHO_COST });
		this.manaLabel = caption("Мана 250");
		this.trayColumn(tray, this.manaBar, this.manaLabel).classList.add("grow");
		this.addModeColumn(tray);
	}

	showCombo(combo, mult) {
		const cap = this.scoreLabel.caption;
		let text = `КОМБО ${combo} · ${Score.formatMultiplier(mult)}`;
		if (mult >= Score.COMBO_MAX_MULT) text += " MAX";
		cap.textContent = text;
		Sfx.playCombo(combo);
		const pal = Pal.current;
		cap.style.color = pal.accent2.lerp(pal.danger, Math.max(0, Math.min(1, (combo - 2) / 6))).css();
		bump(cap);
		const token = ++this.comboToken;
		setTimeout(() => {
			if (token === this.comboToken && this.alive) this.hideCombo();
		}, COMBO_SHOW_SEC * 1000);
	}

	hideCombo() {
		this.comboToken++;
		const cap = this.scoreLabel.caption;
		cap.textContent = "СЧЁТ";
		cap.style.color = Pal.current.muted.css();
	}

	// Сброс забега — через подтверждение, чтобы не потерять прогресс случайным тапом.
	confirmRestart() {
		if (this.overlay || this.runOver || (this.board && this.board.finished)) return;
		this.setEcho(false);
		this.setTimerPaused(true);
		this.pauseOpen = true;
		const o = new Overlay("Начать заново?", "Забег сбросится");
		o.addButtons([["Заново", () => this.onPauseRestart()], ["Отмена", () => this.resume(), true]]);
		this.showOverlay(o);
	}

	// --- Ход забега ---

	newRun() {
		this.runOver = false;
		this.resultId = "";
		this.nameEdit = null;
		if (Save.settings.last_mode !== "spleen") Save.setSetting("last_mode", "spleen");
		Session.newRun();
		this.startStage();
	}

	startStage() {
		// «Блоки»: у каждого этапа свой цвет блоков и кнопок.
		Pal.current.setStage(Session.stageIndex);
		this.app.applyColors();
		this.echoButton.redraw();
		const b = Session.createBoard();
		b.on("revealed", (cells) => this.onCellsRevealed(cells));
		b.on("mineDefused", () => this.onMineDefused());
		b.on("mineHit", () => this.onMineHit());
		b.on("cleared", () => this.onCleared());
		b.on("itemPicked", (_i, type) => bump(type === Item.CLOCK ? this.timeLabel : this.manaLabel));
		this.attachBoard(b);
		this.scoreLabel.style.visibility = Save.settings.show_score ? "visible" : "hidden";
		this.setEcho(false);
		this.manaBar.setValue(Session.mana, false);
		this.updateAll();
		Music.playSpleen(Session.stageIndex, false);
	}

	// Любой тап — «клик» для предметов. Взведённое Раскрытие забирает тап.
	interceptTap(i) {
		this.board.registerClick(i);
		if (this.echoArmed) {
			this.echo(i);
			return true;
		}
		return false;
	}

	secondaryBlocked() {
		return this.echoArmed;
	}

	// Очки и комбо: серию и бонус считает Session (он подписан на поле раньше экрана).
	onCellsRevealed(indices) {
		const o = Session.lastOpen;
		this.view.showPoints(indices[0], o.points, indices.length, o.combo);
		if (o.combo >= 2) this.showCombo(o.combo, o.mult);
		if (indices.length >= 12) vibrate(18);
	}

	echo(i) {
		if (this.board.state[i] !== State.HIDDEN) return;
		if (!Session.spendEcho()) {
			this.setEcho(false);
			return;
		}
		this.setEcho(false);
		Music.duck();
		Sfx.play("cast");
		vibrate(20);
		const eb = this.echoButton.getBoundingClientRect();
		const vb = this.view.canvas.getBoundingClientRect();
		const k = vb.width > 0 ? this.view.w / vb.width : 1;
		this.view.playEcho(i, (eb.left + eb.width / 2 - vb.left) * k, (eb.top + eb.height / 2 - vb.top) * k);
		if (this.board.echoProbe(i) === 1) {
			this.view.popupText(i, "МИНА ОБЕЗВРЕЖЕНА", Pal.current.mana, performance.now() + T.ECHO, true, 1.6);
		}
	}

	onMineDefused() {
		this.updateMines();
		bump(this.minesLabel);
		vibrate(60);
	}

	onEchoPressed() {
		this.setEcho(!this.echoArmed && Session.canEcho() && this.canAct());
		if (this.echoArmed) Sfx.play("arm");
	}

	setEcho(armed) {
		this.echoArmed = armed;
		this.echoButton.setPressed(armed);
		this.view.highlightTargets = armed;
	}

	onFlagModeChanged() {
		this.setEcho(false);
	}

	beforeOverlay() {
		this.setEcho(false);
	}

	async onMineHit() {
		this.setEcho(false);
		this.hideCombo();
		vibrate(200);
		if (!(await this.wait(1.2)) || this.runOver) return;
		this.finishRun(false, "Поражение…");
	}

	async onTimeUp() {
		if (!this.board || this.runOver) return;
		this.board.finished = true;
		this.setEcho(false);
		Music.stop(0.3);
		Sfx.play("timeup");
		this.view.showLoss = true;
		this.view.shake();
		vibrate(200);
		if (!(await this.wait(0.8)) || this.runOver) return;
		this.finishRun(false, "Время вышло");
	}

	async onCleared() {
		this.setEcho(false);
		this.updateAll();
		if (!(await this.wait(0.45))) return;
		Sfx.play(Session.hasNextStage() ? "stage" : "win");
		vibrate(80);
		if (!(await this.wait(0.9))) return;
		this.closeOverlay();
		if (Session.hasNextStage()) this.showStageClear();
		else this.finishRun(true, "Победа!");
	}

	showStageClear() {
		const o = new Overlay("Этап пройден", `Этап ${Session.stageIndex + 1} из ${Session.stageCount()}`);
		o.addRow("Пройден этап", "+" + fmtInt(Score.PER_STAGE), 28, Pal.current.accent2);
		o.addRow("Осталось времени", fmtTime(Session.secondsLeft()));
		o.addRow("Мана", `${Session.mana} / ${MAX_MANA}`);
		o.addRow("Счёт", fmtInt(Session.currentScore()));
		o.addButton("Продолжить", () => {
			this.closeOverlay();
			Session.nextStage();
			this.startStage();
		});
		this.showOverlay(o);
	}

	finishRun(won, title) {
		if (this.runOver) return;
		this.runOver = true;
		this.closeOverlay();
		const result = Session.finishRun(won);
		const saved = Save.submitResult(result);
		this.resultId = saved.id;
		const b = result.breakdown;
		const o = new Overlay(title);
		o.addRow(`Открытые клетки (${b.cells} × ${Score.PER_CELL})`, fmtInt(b.cellPoints));
		o.addRow(`Пройденные этапы (${b.stages} × ${fmtInt(Score.PER_STAGE)})`, fmtInt(b.stagePoints));
		if (won) o.addRow(`Оставшееся время (${b.secondsLeft} × ${Score.PER_SECOND})`, fmtInt(b.timePoints));
		if (b.comboPoints > 0) o.addRow("Бонус за комбо", "+" + fmtInt(b.comboPoints), 27, "#ffb35a");
		o.addTotal("ОБЩИЙ СЧЁТ", fmtInt(b.total));
		if (!won && title !== "Время вышло") Sfx.play("lose");
		if (saved.rank >= 0) {
			const best = saved.rank === 0;
			if (best) Sfx.play("record");
			o.addText(best ? "Новый рекорд!" : `Место в таблице: ${saved.rank + 1}`, 30, Pal.current.accent2);
			this.addNameRow(o);
		} else {
			this.nameEdit = null;
			o.addText(`Результат не попал в топ-${LEADERBOARD_MAX}`, 26, Pal.current.muted);
		}
		o.addButton("Сыграть ещё", () => {
			this.commitName();
			this.closeOverlay();
			this.newRun();
		});
		o.addButtons([["Рекорды", () => this.onResultsLeaderboard(), true], ["В меню", () => this.onResultsMenu(), true]]);
		this.showOverlay(o);
	}

	// --- Пауза ---

	setTimerPaused(paused) {
		Session.paused = paused;
	}

	pauseSubtitle() {
		return `Этап ${Session.stageIndex + 1} из ${Session.stageCount()} · ${fmtTime(Session.secondsLeft())}`;
	}

	fillPause(o) {
		o.addButtons([["Заново", () => this.onPauseRestart(), true], ["В меню", () => this.onPauseMenu(), true]]);
		o.addText("Незаконченный забег не попадает в таблицу рекордов.", 22, Pal.current.muted);
	}

	onPauseRestart() {
		this.closeOverlay();
		Session.abortRun();
		this.newRun();
	}

	onPauseMenu() {
		Session.abortRun();
		this.app.showMenu();
	}

	// --- HUD ---

	updateAll() {
		this.onTimeChanged(Session.secondsLeft());
		this.onManaChanged(Session.mana);
		this.onScoreChanged(Session.currentScore());
		this.updateMines();
		this.titleLabel.textContent = `ЭТАП ${Session.stageIndex + 1}`;
		this.updateModeButtons();
	}

	updateMines() {
		if (this.board) this.minesLabel.textContent = String(this.board.flagsLeft());
	}

	onTimeChanged(seconds) {
		// Последние 30 секунд — тик каждую секунду и музыка «паника»; Часы (+30 с) возвращают обычную.
		const hurry = seconds > 0 && seconds <= 30 && Session.timerRunning && !Session.paused;
		if (hurry) Sfx.play("tick");
		if (this.board && !this.board.finished && Session.runActive && !Session.paused && (Session.timerRunning || seconds > 30)) {
			Music.playSpleen(Session.stageIndex, hurry);
		}
		this.timeLabel.textContent = fmtTime(seconds);
		this.timeLabel.style.color = (seconds <= 30 ? Pal.current.danger : Pal.current.text).css();
	}

	onManaChanged(mana) {
		this.manaBar.setValue(mana);
		this.manaLabel.textContent = `МАНА ${mana}`;
		this.echoButton.setDisabled(mana < ECHO_COST);
	}

	// Счёт «накручивается» до нового значения и подпрыгивает.
	onScoreChanged(score) {
		cancelAnimationFrame(this._scoreAnim);
		if (score <= this.scoreShown) {
			this.setScoreShown(score);
			return;
		}
		const from = this.scoreShown;
		const t0 = performance.now();
		const step = (t) => {
			const p = Math.min(1, (t - t0) / 400);
			const e = 1 - (1 - p) * (1 - p);
			this.setScoreShown(Math.round(from + (score - from) * e));
			if (p < 1) this._scoreAnim = requestAnimationFrame(step);
		};
		this._scoreAnim = requestAnimationFrame(step);
		bump(this.scoreLabel);
	}

	setScoreShown(v) {
		this.scoreShown = v;
		this.scoreLabel.textContent = fmtInt(v);
	}
}
