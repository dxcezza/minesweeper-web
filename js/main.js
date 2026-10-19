// Корень приложения: масштаб под экран, тема, переключение экранов и общий цикл кадров.
import { Save } from "./save.js";
import { WHITE, BLACK } from "./color.js";
import { Pal, Palette } from "./palette.js";
import { Session } from "./session.js";
import { Music, Sfx, unlockAudio } from "./audio.js";
import { liveViews } from "./boardview.js";
import { MainMenu } from "./ui/menu.js";
import { GameScreen } from "./ui/game.js";
import { ClassicScreen } from "./ui/classic.js";
import { DifficultyScreen } from "./ui/difficulty.js";
import { LeaderboardScreen } from "./ui/leaderboard.js";
import { SettingsScreen } from "./ui/settings.js";
import { HelpScreen } from "./ui/help.js";
import { BoardScreen } from "./ui/boardscreen.js";

// Раскладка рассчитана на ширину 720 (как телефон 9:16); выше экран — больше места по высоте.
const BASE_W = 720;
const BASE_H = 1280;

const appEl = document.getElementById("app");

function layout() {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	// На широком экране — колонка с пропорциями телефона; на телефоне — вся ширина.
	const width = Math.min(vw, vh * (BASE_W / BASE_H) * 1.0);
	const scale = width / BASE_W;
	window.__uiScale = scale;
	appEl.style.width = BASE_W + "px";
	appEl.style.height = vh / scale + "px";
	appEl.style.transform = `scale(${scale})`;
	appEl.style.left = (vw - width) / 2 + "px";
	// Вырез камеры и полоса жестов: отступы env(safe-area-inset-*) в пикселях раскладки.
	const probe = getComputedStyle(document.getElementById("safe-probe"));
	for (const side of ["top", "bottom", "left", "right"]) {
		appEl.style.setProperty(`--safe-${side}`, (parseFloat(probe[`padding-${side}`]) || 0) / scale + "px");
	}
}

class App {
	constructor() {
		this.screen = null;
		this.applyAppearance();
	}

	// Пересобирает палитру из настроек.
	applyAppearance() {
		Pal.current = Palette.fromSettings(Save.settings);
		this.applyColors();
		unlockAudio();
	}

	// CSS-переменные из текущей палитры (в «Блоках» акцент зависит от этапа).
	applyColors() {
		const p = Pal.current;
		const s = appEl.style;
		const vars = {
			"--bg": p.bg, "--surface": p.surface, "--surface2": p.surface.lightened(0.03), "--line": p.line,
			"--text": p.text, "--muted": p.muted, "--accent": p.accent, "--accent2": p.accent2,
			"--danger": p.danger, "--mana": p.mana,
		};
		for (const k in vars) s.setProperty(k, vars[k].css(1));
		s.setProperty("--accent-mix", p.accent.lerp(p.text, 0.35).css(1));
		s.setProperty("--accent-lite", p.accent.lightened(0.08).css(1));
		s.setProperty("--accent-hi", p.accent.lerp(WHITE, 0.4).css(1));
		s.setProperty("--accent-lo", p.accent.lerp(BLACK, 0.35).css(1));
		s.setProperty("--accent-a", p.accent.css(0.16));
		s.setProperty("--glow", String(p.glow));
		s.setProperty("--glow-1", p.accent.css(0.22 * p.glow));
		s.setProperty("--glow-2", p.accent.css(0.12 * p.glow));
		appEl.classList.toggle("blocks", p.isBlocks());
		appEl.classList.toggle("neon", !p.isBlocks());
		document.body.style.background = p.bg.css(1);
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.bg.hexString());
	}

	setScreen(screen) {
		Music.setMuffled(false);
		if (!(screen instanceof BoardScreen)) Music.play("menu");
		if (this.screen) {
			this.screen.destroy?.();
			this.screen.el.remove();
		}
		this.screen = screen;
		appEl.append(screen.el);
	}

	// Экраны создаются после смены: конструктор может менять цвета (этап, сложность).
	show(make) {
		if (this.screen) {
			this.screen.destroy?.();
			this.screen.el.remove();
			this.screen = null;
		}
		this.setScreen(make());
	}

	showMenu() {
		this.show(() => new MainMenu(this));
	}

	showGame() {
		this.show(() => new GameScreen(this));
	}

	showDifficulty() {
		this.show(() => new DifficultyScreen(this));
	}

	showClassic(difficulty) {
		this.show(() => new ClassicScreen(this, difficulty));
	}

	showLeaderboard(highlightId) {
		this.show(() => new LeaderboardScreen(this, highlightId || ""));
	}

	showHelp() {
		this.show(() => new HelpScreen(this));
	}

	showSettings() {
		this.show(() => new SettingsScreen(this));
	}

	// Esc — как «Назад» на телефоне (из меню никуда не уходит).
	goBack() {
		const s = this.screen;
		if (!s || s instanceof MainMenu) return;
		if (s.handleBack?.()) return;
		this.showMenu();
	}
}

layout();
window.addEventListener("resize", layout);
window.visualViewport?.addEventListener("resize", layout);

const app = new App();
window.__app = app;

window.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		e.preventDefault();
		app.goBack();
	} else if (e.key === "F11") {
		e.preventDefault();
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen?.();
	}
});

// Свернули вкладку или ушли в другое окно — пауза.
const focusLost = () => app.screen?.onFocusLost?.();
document.addEventListener("visibilitychange", () => {
	if (document.hidden) focusLost();
});
window.addEventListener("blur", focusLost);

// Общий цикл: таймер забега, таймер «Классики», анимации полей.
let last = performance.now();
function step(t) {
	const dt = Math.min((t - last) / 1000, 0.25);
	last = t;
	Session.tick(dt);
	app.screen?.update?.(dt);
	for (const v of liveViews) v.frame(t);
}

function loop(t) {
	step(t);
	requestAnimationFrame(loop);
}

// Для отладки в скрытой вкладке, где кадры не идут: прогнать кадр вручную.
window.__step = () => step(performance.now());

// Шрифт должен загрузиться до первой отрисовки поля на canvas.
Promise.race([
	Promise.all([document.fonts.load("700 40px Oswald"), document.fonts.load("400 24px Oswald")]),
	new Promise((r) => setTimeout(r, 2500)),
]).finally(() => {
	document.getElementById("boot")?.remove();
	app.showMenu();
	requestAnimationFrame(loop);
});

export { Sfx };
