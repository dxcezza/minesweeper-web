// «Как играть»: интерактивное обучение на маленьких полях (открытие, флаг, тап по цифре, предметы,
// Раскрытие) и вкладка с правилами текстом.
import { h, label, capsLabel, displayLabel, tabs, echoButton, meterBar, caption, roundButton, pillButton, bump, vibrate, screenRoot, Icon } from "./widgets.js";
import { BoardView } from "../boardview.js";
import { Board, State } from "../core/board.js";
import { Item, stageConfig } from "../core/config.js";
import { ECHO_COST, MAX_MANA } from "../session.js";
import { Sfx } from "../audio.js";
import { Pal } from "../palette.js";
import { fmtTime } from "../format.js";

const LESSONS = [
	{ title: "Открытие", hint: "Тапните по любой закрытой клетке. Первое открытие всегда безопасно." },
	{ title: "Флаг на мину", hint: "У единиц вверху справа одна закрытая соседка — там мина. Поставьте на неё флаг: долгое нажатие (мышью — правая кнопка)." },
	{ title: "Тап по цифре", hint: "Мина уже под флагом. Тапните по подсвеченной единице — остальные её соседи откроются сами." },
	{ title: "Предметы", hint: "Предметы лежат на закрытых клетках. Откройте обе: Ясность даёт +25 маны, Часы — +30 секунд. Число на значке — сколько тапов мимо предмет ещё выдержит." },
	{ title: "Раскрытие", hint: "Не уверены в клетке? Нажмите «Раскрытие» (50 маны), затем подсвеченную клетку: мина там обезвредится без вреда." },
];
const DONE_TEXT = [
	"Цифра — сколько мин среди 8 соседей. Пустые клетки открываются целыми областями.",
	"Флаг защищает клетку от случайного тапа и помогает считать мины.",
	"Флагов вокруг цифры столько же, сколько мин, — соседи открылись разом.",
	"В «Сплине» Ясность пополняет ману, а Часы добавляют время к забегу.",
	"Мина обезврежена: числа рядом уменьшились, счётчик мин тоже.",
];
// Поле уроков 6×5: мины в клетках 4 (верх справа) и 28 (низ справа).
const W = 6;
const H = 5;
const MINES = [4, 28];

function rulesHtml(pal) {
	const a = pal.accent.hexString();
	const m = pal.mana.hexString();
	const d = pal.danger.hexString();
	const g = pal.accent2.hexString();
	const head = (t) => `<p class="rules-head" style="color:${a}">${t}</p>`;
	return `
${head("РЕЖИМЫ")}
<p><b>Сплин</b> — 5 минных полей подряд на время, с предметами и Раскрытием. Наступили на мину или кончилось время — забег окончен.</p>
<p><b>Классика</b> — одно поле выбранной сложности, без предметов и Раскрытия. Секундомер идёт с первого тапа, рекорд — лучшее время.</p>
${head("ПОЛЕ")}
<p><b>Закрытая клетка</b> — под ней может оказаться мина. А может и не оказаться.</p>
<p><b>Открытая клетка с числом</b> — показывает, сколько мин в соседних клетках (их до 8).</p>
<p><b>Пустая открытая клетка</b> — рядом мин нет, поэтому такие клетки открываются сразу целыми областями.</p>
<p>Первое открытие на каждом этапе всегда безопасно.</p>
<p>Цвета поля меняются в разделе «Оформление», правила от этого не зависят.</p>
${head("УПРАВЛЕНИЕ")}
<p>• <b>Тап по закрытой клетке</b> — открыть её.</p>
<p>• <b>Долгое нажатие</b> (мышью — правая кнопка) — поставить или снять флаг.</p>
<p>• <b>Тап по числу</b> — открыть соседей, если вокруг уже стоит столько же флагов. Если флагов не столько, число вздрогнет и вспыхнет <span style="color:${d}">цветом ошибки</span>.</p>
<p>• <b>Долгое нажатие по числу</b> — расставить флаги, если все закрытые соседи точно мины. Если вариантов несколько, число тоже вспыхнет цветом ошибки.</p>
<p>• <b>Кнопка режима</b> (лопата / флаг) меняет тап и долгое нажатие местами.</p>
<p>• Двумя пальцами или колесом мыши — приблизить поле. Пальцем или мышью — сдвинуть большое поле.</p>
<p>• На паузе поле скрыто, а время стоит. Esc — пауза.</p>
${head("КЛАССИКА")}
<p>Шесть сложностей: от «Разминки» 8×10 до «Экстрима» 20×34. Чем выше ступень, тем больше поле и плотнее мины.</p>
<p>Большие поля открываются крупно: двигайте поле, мини-карта в углу показывает, где вы. Кнопка «Обзор» показывает поле целиком.</p>
<p><b>Без угадываний</b> — поле всегда решается логикой, без ситуаций 50/50. Рекорды с этой опцией и без неё — отдельные.</p>
${head("РАСКРЫТИЕ")}
<p>Стоит 50 маны (запас — 250). Нажмите кнопку Раскрытия (глаз), затем закрытую клетку.</p>
<p>Если под ней мина, Раскрытие её обезвреживает: мина исчезает, клетка и безопасные соседи открываются, числа рядом и счётчик мин уменьшаются.</p>
<p>Если мины нет — клетка просто откроется.</p>
<p>Мана не восстанавливается сама и переходит на следующий этап.</p>
${head("ПРЕДМЕТЫ")}
<p>Появляются на закрытых клетках вплотную к только что открытой области. Чтобы подобрать — откройте клетку.</p>
<p>• <span style="color:${m}">Ясность</span> (зелье) — +25 маны.</p>
<p>• <span style="color:${g}">Часы</span> — +30 секунд.</p>
<p style="color:${d}">Внимание: клетка с предметом может быть заминирована!</p>
<p>Число на значке — сколько кликов предмет ещё выдержит. Каждый тап по другой клетке (даже по числу, которое ничего не открыло) отнимает одно.</p>
<p>Флаг на клетке с предметом тоже считается кликом: предмет теряет одно деление и перепрыгивает на соседнюю клетку. На нуле предмет исчезает.</p>
${head("ВРЕМЯ")}
<p>Забег начинается с 3:00. Оставшееся время переходит на следующий этап и растёт только от Часов.</p>
${head("ОЧКИ И КОМБО")}
<p>15 за каждую открытую клетку, 4 000 за пройденный этап и 20 за каждую оставшуюся секунду — если пройдены все 5 этапов.</p>
<p>Открывайте клетки быстро: каждое открытие меньше чем через 1,8 с после прошлого продлевает комбо. Каждый шаг серии добавляет +10 % к очкам за открытие, максимум ×2 — с 11-го шага подряд.</p>`;
}

export class HelpScreen {
	constructor(app) {
		this.app = app;
		this.el = h("div", "screen help");
		this.alive = true;
		Pal.current.setStage(0);
		app.applyColors();
		const pal = Pal.current;
		const root = screenRoot(this.el, 28, 16);
		root.append(displayLabel("КАК ИГРАТЬ", 60, pal.accent));
		root.append(tabs(["Обучение", "Правила"], 0, (k) => {
			this.tutorial.style.display = k === 0 ? "" : "none";
			this.rules.style.display = k === 1 ? "" : "none";
		}));

		this.tutorial = h("div", "tutorial grow");
		root.append(this.tutorial);
		this.stepLabel = capsLabel("", 19, pal.muted, "center");
		this.titleLabel = displayLabel("", 44);
		this.hintLabel = label("", 26, pal.text, "center", 400);
		this.hintLabel.classList.add("wrap", "hint");
		this.view = new BoardView();
		this.view.el.classList.add("grow");
		this.view.el.style.minHeight = "360px";
		this.view.onTap = (i) => this.onTap(i);
		this.view.onLongPress = (i) => this.onSecondary(i);
		this.view.onSecondary = (i) => this.onSecondary(i);

		// Лоток урока: Раскрытие, мана и время — для уроков 4–5.
		this.extras = h("div", "extras");
		this.echoButton = echoButton(() => this.onEchoPressed(), 88);
		this.manaBar = meterBar({ mana: true, max: MAX_MANA, step: ECHO_COST });
		this.counterLabel = caption("");
		this.extras.append(this.echoButton, h("div", "extras-col grow", this.manaBar, this.counterLabel));

		this.statusLabel = label("", 26, pal.accent2, "center", 600);
		this.statusLabel.classList.add("wrap", "status");
		const nav = h("div", "nav");
		nav.append(
			roundButton(Icon.BACK, () => this.startLesson(Math.max(this.lesson - 1, 0)), 80),
			roundButton(Icon.RESTART, () => this.startLesson(this.lesson), 80),
		);
		this.nextButton = pillButton("Дальше", () => this.onNext(), 28);
		this.nextButton.style.minWidth = "260px";
		nav.append(this.nextButton);
		this.tutorial.append(this.stepLabel, this.titleLabel, this.hintLabel, this.view.el, this.extras, this.statusLabel, nav);

		this.rules = h("div", "scroll rules grow");
		this.rules.innerHTML = rulesHtml(pal);
		this.rules.style.display = "none";
		root.append(this.rules);

		const back = pillButton("В меню", () => app.showMenu(), 28, true);
		back.classList.add("center");
		root.append(back);
		this.startLesson(0);
	}

	destroy() {
		this.alive = false;
		this.view.destroy();
	}

	handleBack() {
		return false;
	}

	// --- Уроки ---

	startLesson(index) {
		this.lesson = index;
		this.lessonDone = false;
		this.echoArmed = false;
		this.mana = 100;
		this.time = 160;
		this.picked = 0;
		const b = new Board(stageConfig(W, H, MINES.length, { weightClarity: 0, weightClock: 0 }), 7 + index);
		if (index > 0) {
			b.setupMines(MINES);
			// Закрыты: мины, правый край верха (уроки 3–5) и угол внизу справа. Остальное открыто.
			const hidden = [4, 28, 29, 22, 23];
			if (index >= 2) hidden.push(5, 11);
			for (let i = 0; i < b.cellCount(); i++) {
				if (!hidden.includes(i)) {
					b.state[i] = State.REVEALED;
					b.revealedSafe++;
				}
			}
			if (index === 2) b.state[4] = State.FLAGGED;
			if (index === 3) {
				b.items.set(5, Item.CLARITY);
				b.itemLife.set(5, Item.LIFE_CLICKS);
				b.items.set(22, Item.CLOCK);
				b.itemLife.set(22, Item.LIFE_CLICKS);
			}
		}
		this.board = b;
		b.on("revealed", (cells) => {
			Sfx.playOpen(cells.length);
			this.onRevealed();
		});
		b.on("flag", (i) => {
			Sfx.play(b.isFlag(i) ? "flag" : "unflag");
			if (this.lesson === 1 && i === 4 && b.state[4] === State.FLAGGED) this.complete();
		});
		b.on("itemPicked", (i, type) => this.onItemPicked(i, type));
		b.on("itemExpired", () => {
			Sfx.play("expire");
			if (this.lesson === 3 && !this.lessonDone) this.fail("Предмет пропал: пять тапов мимо. Урок начнётся заново.");
		});
		b.on("mineHit", () => {
			Sfx.play("explode");
			vibrate(120);
			this.fail("Мина! Урок начнётся заново.");
		});
		b.on("mineDefused", () => {
			Sfx.play("defuse");
			if (this.lesson === 4) this.complete();
		});
		this.view.setBoard(b);
		this.view.highlightTargets = false;
		this.view.waitingCell = index === 2 ? 10 : index === 4 ? 4 : -1;
		const info = LESSONS[index];
		this.stepLabel.textContent = `УРОК ${index + 1} ИЗ ${LESSONS.length}`;
		this.titleLabel.textContent = info.title.toUpperCase();
		this.hintLabel.textContent = info.hint;
		this.statusLabel.textContent = "";
		this.extras.style.display = index >= 3 ? "" : "none";
		this.echoButton.style.visibility = index === 4 ? "visible" : "hidden";
		this.setEcho(false);
		this.updateCounters(false);
		this.nextButton.textContent = index === LESSONS.length - 1 ? "ГОТОВО" : "ДАЛЬШЕ";
	}

	complete() {
		if (this.lessonDone) return;
		this.lessonDone = true;
		this.view.waitingCell = -1;
		Sfx.play("record");
		this.statusLabel.style.color = Pal.current.accent2.css();
		this.statusLabel.textContent = "Получилось! " + DONE_TEXT[this.lesson];
		bump(this.statusLabel);
		vibrate(40);
	}

	fail(text) {
		this.statusLabel.style.color = Pal.current.danger.css();
		this.statusLabel.textContent = text;
		const b = this.board;
		setTimeout(() => {
			if (this.alive && this.board === b) this.startLesson(this.lesson);
		}, 1400);
	}

	onNext() {
		if (this.lesson + 1 < LESSONS.length) this.startLesson(this.lesson + 1);
		else this.app.showMenu();
	}

	// --- Ввод по полю урока ---

	onTap(i) {
		const b = this.board;
		if (b.finished) return;
		if (this.lesson === 3) b.registerClick(i);
		if (this.echoArmed) {
			this.setEcho(false);
			if (b.state[i] === State.HIDDEN) {
				this.mana -= ECHO_COST;
				Sfx.play("cast");
				this.updateCounters(true);
				b.echoProbe(i);
				if (!this.lessonDone && this.mana < ECHO_COST) this.fail("Мана кончилась. Урок начнётся заново.");
			}
			return;
		}
		if (b.state[i] === State.REVEALED) {
			if (b.counts[i] === 0) return;
			if (b.canChord(i)) {
				Sfx.play("chord");
				b.chord(i);
			} else {
				Sfx.play("deny");
				this.view.nudge(i);
				vibrate(15);
			}
		} else if (b.state[i] === State.HIDDEN) {
			b.reveal(i);
		}
	}

	onSecondary(i) {
		const b = this.board;
		if (b.finished || this.echoArmed) return;
		if (b.state[i] === State.REVEALED) {
			if (b.autoFlag(i) === 0 && b.counts[i] > 0) this.view.nudge(i);
		} else if (b.state[i] === State.HIDDEN || b.state[i] === State.FLAGGED) {
			b.toggleFlag(i);
			vibrate(25);
		}
	}

	onEchoPressed() {
		this.setEcho(!this.echoArmed && this.mana >= ECHO_COST && !this.board.finished);
		if (this.echoArmed) Sfx.play("arm");
	}

	setEcho(armed) {
		this.echoArmed = armed;
		this.echoButton.setDisabled(this.mana < ECHO_COST);
		this.echoButton.setPressed(armed);
		this.view.highlightTargets = armed;
	}

	// --- Цели уроков ---

	onRevealed() {
		if (this.lesson === 0) this.complete();
		else if (this.lesson === 2 && this.board.state[5] === State.REVEALED && this.board.state[11] === State.REVEALED) this.complete();
	}

	onItemPicked(i, type) {
		this.picked++;
		Sfx.play(type === Item.CLOCK ? "clock" : "clarity");
		if (type === Item.CLARITY) {
			this.mana = Math.min(this.mana + Item.CLARITY_MANA, MAX_MANA);
		} else {
			this.time += Item.CLOCK_SECONDS;
		}
		this.updateCounters(true);
		if (this.lesson === 3 && this.picked >= 2) this.complete();
	}

	updateCounters(animate) {
		this.manaBar.setValue(this.mana, animate);
		this.counterLabel.textContent = `МАНА ${this.mana} · ВРЕМЯ ${fmtTime(this.time)}`;
		this.echoButton.setDisabled(this.mana < ECHO_COST);
	}
}
