// Состояние текущего забега «Сплина»: этап, время, мана, счёт.
// Время забега начинается с 3:00, переносится между этапами и растёт только от Часов.
import { Emitter } from "./core/emitter.js";
import { Board } from "./core/board.js";
import { STAGES, Item, Score } from "./core/config.js";
import { randomSeed, hashSeed } from "./core/rng.js";
import { Save } from "./save.js";

export const START_TIME_SEC = 180;
export const MAX_MANA = 250;
export const ECHO_COST = 50;

class GameSession extends Emitter {
	constructor() {
		super();
		this.stageIndex = 0;
		this.timeLeft = START_TIME_SEC;
		this.mana = MAX_MANA;
		this.cellsRevealed = 0;
		this.stagesCleared = 0;
		this.combo = 0;
		this.comboPoints = 0;
		this.lastOpen = {};
		this._lastOpenMs = -1e9;
		this.runSeed = 0;
		this.playedSec = 0;
		this.runActive = false;
		this.timerRunning = false;
		this.paused = false;
		this.board = null;
	}

	newRun() {
		this.runSeed = randomSeed();
		this.stageIndex = 0;
		this.timeLeft = START_TIME_SEC;
		this.mana = MAX_MANA;
		this.cellsRevealed = 0;
		this.stagesCleared = 0;
		this.combo = 0;
		this.comboPoints = 0;
		this.lastOpen = {};
		this._lastOpenMs = -1e9;
		this.playedSec = 0;
		this.runActive = true;
		this.timerRunning = false;
		this.paused = false;
		this.board = null;
		this.emit("time", this.secondsLeft());
		this.emit("mana", this.mana);
		this.emit("score", this.currentScore());
	}

	createBoard() {
		const b = new Board(STAGES[this.stageIndex], hashSeed(this.runSeed, this.stageIndex));
		b.on("revealed", (cells) => this._onRevealed(cells));
		b.on("itemPicked", (_i, type) => this._onItemPicked(type));
		b.on("mineHit", () => {
			this.timerRunning = false;
			this.combo = 0;
		});
		b.on("cleared", () => {
			this.stagesCleared++;
			this.timerRunning = false;
			this.emit("score", this.currentScore());
		});
		this.board = b;
		this.timerRunning = false;
		this.combo = 0;
		return b;
	}

	// Вызывается каждый кадр.
	tick(delta) {
		if (!this.runActive || !this.timerRunning || this.paused) return;
		const before = this.secondsLeft();
		this.timeLeft -= delta;
		this.playedSec += delta;
		if (this.timeLeft <= 0) {
			this.timeLeft = 0;
			this.timerRunning = false;
			this.emit("time", 0);
			this.emit("timeUp");
			return;
		}
		if (this.secondsLeft() !== before) this.emit("time", this.secondsLeft());
	}

	secondsLeft() {
		return Math.ceil(this.timeLeft);
	}

	currentScore() {
		return Score.live(this.cellsRevealed, this.stagesCleared, this.comboPoints);
	}

	stageCount() {
		return STAGES.length;
	}

	hasNextStage() {
		return this.stageIndex + 1 < STAGES.length;
	}

	nextStage() {
		this.stageIndex++;
	}

	canEcho() {
		return this.mana >= ECHO_COST;
	}

	spendEcho() {
		if (!this.canEcho()) return false;
		this.mana -= ECHO_COST;
		this.emit("mana", this.mana);
		return true;
	}

	finishRun(won) {
		this.runActive = false;
		this.timerRunning = false;
		const secs = this.secondsLeft();
		const b = Score.breakdown(this.cellsRevealed, this.stagesCleared, secs, won, this.comboPoints);
		return {
			score: b.total,
			won,
			stages: this.stagesCleared,
			cells: this.cellsRevealed,
			time_left: secs,
			duration: Math.round(this.playedSec),
			date: Save.nowString(),
			seed: this.runSeed,
			breakdown: b,
		};
	}

	abortRun() {
		this.runActive = false;
		this.timerRunning = false;
		this.paused = false;
	}

	// Открытие клеток: продлевает или начинает серию, начисляет бонус.
	registerOpen(cells, nowMs) {
		this.combo = nowMs - this._lastOpenMs < Score.COMBO_WINDOW_MS ? this.combo + 1 : 1;
		this._lastOpenMs = nowMs;
		const base = cells * Score.PER_CELL;
		const bonus = Score.comboBonus(base, this.combo);
		this.comboPoints += bonus;
		this.lastOpen = { cells, combo: this.combo, mult: Score.comboMultiplier(this.combo), base, bonus, points: base + bonus };
		return this.lastOpen;
	}

	_onRevealed(cells) {
		this.cellsRevealed += cells.length;
		this.registerOpen(cells.length, performance.now());
		if (this.board && !this.board.finished) this.timerRunning = true;
		this.emit("score", this.currentScore());
	}

	_onItemPicked(type) {
		if (type === Item.CLARITY) {
			this.mana = Math.min(this.mana + Item.CLARITY_MANA, MAX_MANA);
			this.emit("mana", this.mana);
		} else if (type === Item.CLOCK) {
			this.timeLeft += Item.CLOCK_SECONDS;
			this.emit("time", this.secondsLeft());
		}
	}
}

export const Session = new GameSession();
