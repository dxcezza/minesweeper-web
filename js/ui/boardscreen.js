// Общее для игровых экранов «Сплин» и «Классика»: шапка «пауза · заголовок · сброс», карточка статистики,
// поле, лоток с режимом «копать / флаг», ввод по полю, пауза (поле скрыто), оверлеи и имя для рекорда.
import { h, roundButton, displayLabel, modeButton, caption, statCell, vibrate, screenRoot, Icon } from "./widgets.js";
import { Overlay } from "./overlay.js";
import { BoardView } from "../boardview.js";
import { State } from "../core/board.js";
import { Item } from "../core/config.js";
import { Save, MAX_NAME_LENGTH } from "../save.js";
import { Sfx, Music } from "../audio.js";
import { Pal } from "../palette.js";

export const TRAY_H = 104;

export class BoardScreen {
	constructor(app) {
		this.app = app;
		this.el = h("div", "screen board-screen");
		this.board = null;
		this.view = null;
		this.flagMode = false;
		this.runOver = false;
		this.overlay = null;
		this.pauseOpen = false;
		this.resultId = "";
		this.nameEdit = null;
		// Тап ждёт фоновой генерации поля «без угадываний»: остальной ввод не принимается.
		this.waitingGeneration = false;
		// Автофлаг ставит несколько флагов разом: один звук вместо пачки щелчков.
		this.autoFlagging = false;
		this.alive = true;
	}

	destroy() {
		this.alive = false;
		this.view?.destroy();
		this.commitName();
	}

	// Вкладка свернута или окно потеряло фокус — пауза.
	onFocusLost() {
		if (!this.overlay && !this.runOver && this.board && this.board.generated && !this.board.finished) this.openPause();
	}

	// Esc / «Назад». true — обработано здесь.
	handleBack() {
		if (this.pauseOpen) {
			this.resume();
			return true;
		}
		if (!this.overlay && !this.runOver) {
			this.openPause();
			return true;
		}
		this.commitName();
		return false;
	}

	// --- Построение интерфейса ---

	buildFrame() {
		const root = screenRoot(this.el, 20, 14);
		const top = h("div", "top-bar");
		top.append(roundButton(Icon.PAUSE, () => this.openPause()));
		this.titleLabel = displayLabel("", 56);
		this.titleLabel.classList.add("grow");
		top.append(this.titleLabel);
		top.append(roundButton(Icon.RESTART, () => this.confirmRestart()));
		root.append(top);
		return root;
	}

	buildCard(root) {
		const row = h("div", "card stat-card");
		root.append(row);
		return row;
	}

	stat(row, kind, iconColor, captionText, valueColor) {
		const s = statCell(kind, iconColor, captionText, valueColor);
		row.append(s.el);
		return s.value;
	}

	addDivider(row) {
		row.append(h("div", "divider"));
	}

	buildBoard(root) {
		this.view = new BoardView();
		this.view.el.classList.add("grow");
		this.view.onTap = (i) => this.onCellTapped(i);
		this.view.onLongPress = (i) => this.onCellLongPressed(i);
		this.view.onSecondary = (i) => this.onCellSecondary(i);
		this.view.onPressed = (i) => this.onCellPressed(i);
		root.append(this.view.el);
	}

	buildTray(root) {
		const tray = h("div", "tray");
		root.append(tray);
		return tray;
	}

	// Колонка «Режим»: лопата и флаг.
	addModeColumn(tray) {
		const modes = h("div", "modes");
		this.digButton = modeButton(Icon.SHOVEL, () => this.setFlagMode(false));
		this.flagButton = modeButton(Icon.FLAG, () => this.setFlagMode(true));
		modes.append(this.digButton, this.flagButton);
		this.trayColumn(tray, modes, caption("Режим"));
	}

	// Колонка лотка: элемент по центру слота TRAY_H, подписи всех колонок на одной линии.
	trayColumn(tray, item, cap) {
		const col = h("div", "tray-col", h("div", "tray-slot", item), cap);
		tray.append(col);
		return col;
	}

	// Новое поле на экране: подписки, настройки ввода, режим «копать».
	attachBoard(b) {
		this.board = b;
		this.connectSounds(b);
		this.waitingGeneration = false;
		this.view.waitingCell = -1;
		b.on("flag", () => this.updateMines());
		this.view.setBoard(b);
		this.view.longPressMs = Save.settings.long_press_ms;
		this.flagMode = false;
		this.updateModeButtons();
	}

	// Звуки поля. Звуки исхода (этап, победа) включают наследники.
	connectSounds(b) {
		b.on("revealed", (cells) => Sfx.playOpen(cells.length));
		b.on("flag", (i) => {
			if (!this.autoFlagging) Sfx.play(b.isFlag(i) ? "flag" : "unflag");
		});
		b.on("mineHit", () => {
			Music.stop(0.08);
			Sfx.play("explode");
		});
		b.on("mineDefused", () => {
			Music.duck();
			Sfx.play("defuse");
		});
		b.on("cleared", () => Music.stop(0.5));
		b.on("itemSpawned", () => Sfx.play("spawn"));
		b.on("itemPicked", (_i, t) => {
			Music.duck();
			Sfx.play(t === Item.CLOCK ? "clock" : "clarity");
		});
		b.on("itemMoved", () => Sfx.play("hop"));
		b.on("itemExpired", () => Sfx.play("expire"));
	}

	// --- Ввод по полю ---

	canAct() {
		return this.board && !this.board.finished && !this.overlay && !this.waitingGeneration;
	}

	// Палец коснулся закрытой клетки до первого открытия: поле «без угадываний» начинает генерироваться в фоне.
	onCellPressed(i) {
		const b = this.board;
		if (b && b.noGuess && !b.generated && !this.flagMode && b.state[i] === State.HIDDEN) b.pregenerate(i);
	}

	// Открыть клетку. Пока фоновая генерация не готова, клетка пульсирует.
	async reveal(i) {
		const b = this.board;
		if (b.generationReady(i) || !b.noGuess) {
			b.reveal(i);
			return;
		}
		this.waitingGeneration = true;
		this.view.waitingCell = i;
		await b.whenReady(i);
		if (!this.alive || this.board !== b) return;
		this.waitingGeneration = false;
		this.view.waitingCell = -1;
		if (!b.finished && b.state[i] === State.HIDDEN && !this.overlay) b.reveal(i);
	}

	// Наследник может перехватить тап (Раскрытие в «Сплине»). true — тап обработан.
	interceptTap() {
		return false;
	}

	// Долгий тап и ПКМ не работают, пока взведено Раскрытие.
	secondaryBlocked() {
		return false;
	}

	onCellTapped(i) {
		if (!this.canAct() || this.interceptTap(i)) return;
		const st = this.board.state[i];
		if (st === State.REVEALED) {
			if (!Save.settings.chord || this.board.counts[i] === 0) return;
			if (this.board.canChord(i)) {
				Sfx.play("chord");
				this.board.chord(i);
			} else {
				this.deny(i);
			}
			return;
		}
		if (this.flagMode) this.toggleFlag(i);
		else if (st === State.HIDDEN) this.reveal(i);
	}

	onCellLongPressed(i) {
		if (!this.canAct() || this.secondaryBlocked() || !Save.settings.long_press_flag) return;
		const st = this.board.state[i];
		if (st === State.REVEALED) {
			this.autoFlag(i);
			return;
		}
		if (this.flagMode) {
			if (st === State.HIDDEN) this.reveal(i);
		} else {
			this.toggleFlag(i);
		}
	}

	onCellSecondary(i) {
		if (!this.canAct() || this.secondaryBlocked()) return;
		if (this.board.state[i] === State.REVEALED) this.autoFlag(i);
		else this.toggleFlag(i);
	}

	// ПКМ / удержание по цифре: флаги на всех закрытых соседях, если иначе быть не может.
	autoFlag(i) {
		if (this.board.counts[i] === 0) return;
		this.autoFlagging = true;
		const placed = this.board.autoFlag(i);
		this.autoFlagging = false;
		if (placed > 0) {
			Sfx.play("autoflag");
			vibrate(30);
		} else {
			this.deny(i);
		}
	}

	// Действие по числу невозможно: клетка вздрагивает и вспыхивает цветом ошибки.
	deny(i) {
		Sfx.play("deny");
		this.view.nudge(i);
		vibrate(15);
	}

	toggleFlag(i) {
		const st = this.board.state[i];
		if (st === State.HIDDEN || st === State.FLAGGED) {
			this.board.toggleFlag(i);
			vibrate(25);
		}
	}

	setFlagMode(on) {
		this.flagMode = on;
		this.onFlagModeChanged();
		this.updateModeButtons();
	}

	onFlagModeChanged() {}

	updateModeButtons() {
		if (!this.digButton) return;
		this.digButton.setActive(!this.flagMode);
		this.flagButton.setActive(this.flagMode);
	}

	updateMines() {}

	// --- Пауза и оверлеи ---

	setTimerPaused() {}

	pauseSubtitle() {
		return "";
	}

	showOverlay(o) {
		this.overlay = o;
		this.el.append(o.el);
	}

	openPause() {
		// После очистки/взрыва идёт пауза-празднование, следом свой оверлей — второй поверх не нужен.
		if (this.overlay || this.runOver || (this.board && this.board.finished)) return;
		this.beforeOverlay();
		this.setTimerPaused(true);
		this.pauseOpen = true;
		this.view.veiled = true;
		Music.setMuffled(true);
		Sfx.play("pause");
		const o = new Overlay("Пауза", this.pauseSubtitle());
		o.addButton("Продолжить", () => this.resume());
		this.fillPause(o);
		this.showOverlay(o);
	}

	fillPause() {}

	beforeOverlay() {}

	confirmRestart() {}

	resume() {
		Sfx.play("resume");
		this.closeOverlay();
	}

	closeOverlay() {
		if (this.pauseOpen) {
			this.setTimerPaused(false);
			this.pauseOpen = false;
			Music.setMuffled(false);
		}
		if (this.view) this.view.veiled = false;
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
	}

	// Строка «Имя» для попавшего в таблицу результата.
	addNameRow(o) {
		// Ник пришёл с сайта — вводить имя не нужно.
		if (!Save.canRename()) {
			this.nameEdit = null;
			o.addText(`Игрок: ${Save.playerName()}`, 26, Pal.current.muted);
			return;
		}
		const input = h("input", "name-edit");
		input.type = "text";
		input.maxLength = MAX_NAME_LENGTH;
		input.value = Save.settings.last_name;
		input.addEventListener("focus", () => input.select());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") input.blur();
		});
		input.addEventListener("blur", () => this.commitName());
		this.nameEdit = input;
		const lab = h("div", "label muted", "Имя");
		lab.style.fontSize = "28px";
		o.addNode(h("div", "name-row", lab, input));
	}

	commitName() {
		if (this.nameEdit && this.resultId) Save.renameEntry(this.resultId, this.nameEdit.value);
	}

	onResultsLeaderboard() {
		this.commitName();
		this.app.showLeaderboard(this.resultId);
	}

	onResultsMenu() {
		this.commitName();
		this.app.showMenu();
	}

	// Пауза между событиями (празднование, взрыв). Возвращает false, если экран уже закрыт.
	wait(sec) {
		return new Promise((resolve) => setTimeout(() => resolve(this.alive), sec * 1000));
	}
}

export { Pal };
