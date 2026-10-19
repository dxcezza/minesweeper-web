// Настройки: оформление с живым превью поля, звук и управление. Сохраняются в localStorage.
import { h, label, header, displayLabel, swatch, slider, toggle, plainButton, pillButton, screenRoot } from "./widgets.js";
import { BoardView } from "../boardview.js";
import { Save } from "../save.js";
import { PRESET_ORDER, APPEARANCE_DEFAULTS, Pal } from "../palette.js";
import { Sfx, Music } from "../audio.js";

const TOGGLES = [
	["vibration", "Вибрация"],
	["long_press_flag", "Флаг долгим нажатием"],
	["chord", "Тап по цифре открывает соседей"],
	["show_score", "Показывать счёт во время игры"],
];
// [ключ, подпись, мин, макс, шаг, формат значения]
const SLIDERS = [
	["hue_shift", "Оттенок", -180, 180, 5, (v) => `${v >= 0 ? "+" : ""}${Math.round(v)}°`],
	["brightness", "Яркость поля", 0.5, 1.3, 0.05, (v) => `${Math.round(v * 100)} %`],
	["glow", "Неон", 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`],
	["bg_dim", "Затемнение фона", 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`],
	["rounding", "Скругление", 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`],
	["outline", "Обводка цифр", 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`],
];

export class SettingsScreen {
	constructor(app) {
		this.app = app;
		this.el = h("div", "screen settings");
		this.build(0);
	}

	destroy() {
		this.preview?.destroy();
		Save.saveSettings();
	}

	build(scrollTo) {
		this.preview?.destroy();
		this.el.innerHTML = "";
		const root = screenRoot(this.el, 28, 14);
		root.append(displayLabel("НАСТРОЙКИ", 60, Pal.current.accent));
		this.preview = new BoardView({ interactive: false });
		this.preview.el.style.height = "300px";
		this.preview.el.style.flex = "none";
		this.preview.setBoard(BoardView.demoBoard());
		root.append(this.preview.el);

		this.scroll = h("div", "scroll list settings-list");
		root.append(this.scroll);
		const list = this.scroll;

		list.append(header("Оформление"));
		const swatches = h("div", "swatches");
		for (const id of PRESET_ORDER) swatches.append(swatch(id, id === Pal.current.presetId, () => this.onPreset(id)));
		list.append(swatches);
		for (const [key, text, min, max, step, fmt] of SLIDERS) {
			list.append(slider(text, min, max, step, Save.settings[key] ?? APPEARANCE_DEFAULTS[key], fmt, (v) => this.setAppearance(key, v), () => Save.saveSettings()));
		}
		list.append(toggle("Разноцветные цифры", Save.settings.multicolor, (on) => this.setAppearance("multicolor", on)));
		list.append(plainButton("Сбросить оформление", () => this.resetAppearance(), 24, 72));

		list.append(header("Звук и музыка"));
		list.append(toggle("Звуки", Save.settings.sound, (on) => Save.setSetting("sound", on)));
		list.append(slider("Громкость звуков", 0, 1, 0.05, Save.settings.sound_volume, (v) => `${Math.round(v * 100)} %`,
			(v) => (Save.settings.sound_volume = v), () => {
				Save.saveSettings();
				Sfx.play("flag");
			}));
		list.append(toggle("Музыка", Save.settings.music, (on) => {
			Save.setSetting("music", on);
			Music.applyVolume();
		}));
		list.append(slider("Громкость музыки", 0, 1, 0.05, Save.settings.music_volume, (v) => `${Math.round(v * 100)} %`, (v) => {
			Save.settings.music_volume = v;
			Music.applyVolume();
		}, () => Save.saveSettings()));

		list.append(header("Управление"));
		for (const [key, text] of TOGGLES) list.append(toggle(text, Save.settings[key], (on) => Save.setSetting(key, on)));
		list.append(slider("Долгое нажатие", 200, 800, 50, Save.settings.long_press_ms, (v) => `${v} мс`,
			(v) => (Save.settings.long_press_ms = v), () => Save.saveSettings()));
		const hint = label("Тап — открыть клетку, долгое нажатие — флаг; по числу — расставить флаги, если вариантов нет. "
			+ "Кнопка режима меняет тап и удержание местами. Двумя пальцами — приблизить и сдвинуть поле. "
			+ "Мышью: правая кнопка — флаг, колесо — зум, Esc — пауза.", 22, Pal.current.muted, "left", 400);
		hint.classList.add("wrap");
		list.append(hint);

		const back = pillButton("Назад", () => this.app.showMenu(), 28);
		back.classList.add("center");
		root.append(back);
		requestAnimationFrame(() => (this.scroll.scrollTop = scrollTo));
	}

	// Меняет параметр оформления: палитра и фон обновляются сразу, превью перерисовывается.
	setAppearance(key, value) {
		Save.settings[key] = value;
		this.app.applyAppearance();
		this.preview.refresh();
	}

	// Смена пресета перестраивает экран, чтобы подписи и кнопки тоже перекрасились.
	onPreset(id) {
		Sfx.play("mode");
		Save.setSetting("palette", id);
		this.app.applyAppearance();
		this.build(this.scroll.scrollTop);
	}

	resetAppearance() {
		for (const key in APPEARANCE_DEFAULTS) Save.settings[key] = APPEARANCE_DEFAULTS[key];
		Save.saveSettings();
		this.app.applyAppearance();
		this.build(this.scroll.scrollTop);
	}

	handleBack() {
		return false;
	}
}
