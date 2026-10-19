// Цветовая схема. Пресет задаёт базовые цвета, настройки игрока (оттенок, яркость, неон, фон,
// скругление, разноцветные цифры) их подкручивают. Текущая палитра — Palette.current.
import { Color } from "./color.js";

export const PRESETS = {
	blocks: {
		name: "Блоки", style: "blocks",
		bg: "141414", line: "2a2a2a", text: "f2f2f2", muted: "8b8b8b",
		hidden_a: "3ec95c", hidden_b: "3ec95c", flag: "5d6470",
		accent: "3ec95c", accent2: "ffd166", danger: "ff4b4b", mana: "2f6ff0",
		numbers: ["18d2d0", "3ec95c", "ff9a1f", "b55cff", "ff4b4b", "2ea6c6", "ff63ad", "f2f2f2"],
	},
	neon: {
		name: "Неон",
		bg: "0f1117", line: "262b36", text: "e9ecf2", muted: "7d8596",
		hidden_a: "00e5ff", hidden_b: "7c4dff", flag: "3a3f4c",
		accent: "00e5ff", accent2: "ffd166", danger: "ff3d71", mana: "4d9bff",
		numbers: ["00e5ff", "39ff88", "ffd166", "ff9f43", "ff3d71", "c56bff", "ff6bd6", "ffffff"],
	},
	synth: {
		name: "Синтвейв",
		bg: "120d1c", line: "2c2340", text: "f1e9ff", muted: "8d80a8",
		hidden_a: "ff2bd6", hidden_b: "2b6bff", flag: "3b3150",
		accent: "ff2bd6", accent2: "ffd36a", danger: "ff4d4d", mana: "4d8bff",
		numbers: ["2bd9ff", "ff2bd6", "ffd36a", "ff8a3d", "ff4d4d", "a46bff", "6bffcf", "ffffff"],
	},
	acid: {
		name: "Кислота",
		bg: "0c110d", line: "223026", text: "eaf7e6", muted: "7f9483",
		hidden_a: "b6ff00", hidden_b: "00ffa3", flag: "334036",
		accent: "b6ff00", accent2: "ffe14d", danger: "ff4d6d", mana: "3dd6ff",
		numbers: ["b6ff00", "00ffa3", "ffe14d", "ff9a3d", "ff4d6d", "d07bff", "3dd6ff", "ffffff"],
	},
	sunset: {
		name: "Закат",
		bg: "16100f", line: "33241f", text: "fff0e6", muted: "a08a7f",
		hidden_a: "ff6b6b", hidden_b: "ffb86b", flag: "45332c",
		accent: "ff7a59", accent2: "ffd86b", danger: "ff3355", mana: "6bb8ff",
		numbers: ["6bb8ff", "6bffb0", "ffd86b", "ff9a4d", "ff3355", "d78bff", "ff7ac0", "ffffff"],
	},
	classic: {
		name: "Минимал",
		bg: "1a1a1a", line: "33332f", text: "e8e6e1", muted: "8c8a84",
		hidden_a: "2196f3", hidden_b: "2196f3", flag: "5a5a5a",
		accent: "2196f3", accent2: "c9b98a", danger: "e5533d", mana: "4fa3ff",
		numbers: ["e8e6e1", "e8e6e1", "e8e6e1", "e8e6e1", "e8e6e1", "e8e6e1", "e8e6e1", "e8e6e1"],
	},
};
export const PRESET_ORDER = ["blocks", "neon", "synth", "acid", "sunset", "classic"];
// «Блоки»: один цвет блоков на этап.
export const STAGE_COLORS = ["3ec95c", "ff9a1f", "a54fe2", "18d2d0", "2f6ff0"];
// Цвета сложностей «Классики» в «Блоках»: от зелёной «Разминки» до красного «Экстрима».
export const CLASSIC_COLORS = ["3ec95c", "18d2d0", "ff9a1f", "a54fe2", "2f6ff0", "ff4b6e"];

export const APPEARANCE_DEFAULTS = {
	palette: "neon",
	hue_shift: 0,
	brightness: 1,
	glow: 0.7,
	bg_dim: 0.5,
	rounding: 0.5,
	outline: 0.7,
	multicolor: true,
};

function setting(s, key) {
	return s[key] ?? APPEARANCE_DEFAULTS[key];
}

// Сдвиг оттенка и яркость.
function tune(c, hueShift, brightness) {
	return Color.fromHsv(c.h + hueShift, c.s, Math.max(0, Math.min(1, c.v * brightness)), c.a);
}

export class Palette {
	static fromSettings(s) {
		const p = new Palette();
		let id = setting(s, "palette");
		if (!PRESETS[id]) id = "neon";
		p.presetId = id;
		const src = PRESETS[id];
		p.style = src.style ?? "neon";
		const hue = setting(s, "hue_shift") / 360;
		const bright = setting(s, "brightness");
		const dim = setting(s, "bg_dim");
		const baseBg = Color.hex(src.bg);
		// bg_dim 0 — фон светлее пресета, 1 — почти чёрный.
		p.bg = dim < 0.5 ? baseBg.lightened(0.12 * (0.5 - dim) * 2) : baseBg.darkened(0.7 * (dim - 0.5) * 2);
		p.surface = p.bg.lightened(0.06);
		p.line = Color.hex(src.line).lerp(p.bg, Math.max(0, Math.min(0.5, dim - 0.5)));
		p.text = Color.hex(src.text);
		p.muted = Color.hex(src.muted);
		p.hidden_a = tune(Color.hex(src.hidden_a), hue, bright);
		p.hidden_b = tune(Color.hex(src.hidden_b), hue, bright);
		p.flag = Color.hex(src.flag);
		p.accent = tune(Color.hex(src.accent), hue, 1);
		p.accent2 = Color.hex(src.accent2);
		p.danger = Color.hex(src.danger);
		p.mana = Color.hex(src.mana);
		const multicolor = setting(s, "multicolor");
		p.numbers = [p.text];
		for (let k = 0; k < 8; k++) p.numbers.push(multicolor ? Color.hex(src.numbers[k]) : p.text);
		p.stageColors = STAGE_COLORS.map((c) => tune(Color.hex(c), hue, bright));
		p.classicColors = CLASSIC_COLORS.map((c) => tune(Color.hex(c), hue, bright));
		p.glow = p.style === "blocks" ? 0 : Math.max(0, Math.min(1, setting(s, "glow")));
		if (p.style === "blocks") p.setStage(0);
		p.rounding = Math.max(0, Math.min(1, setting(s, "rounding")));
		p.outline = Math.max(0, Math.min(1, setting(s, "outline")));
		return p;
	}

	// «Блоки»: цвет блоков и акцент интерфейса берутся из номера этапа.
	setStage(index) {
		if (this.style !== "blocks") return;
		const c = this.stageColors[Math.max(0, Math.min(index, this.stageColors.length - 1))];
		this.hidden_a = c;
		this.hidden_b = c;
		this.accent = c;
	}

	// «Блоки»: цвет сложности «Классики».
	setClassic(index) {
		if (this.style !== "blocks") return;
		const c = this.classicColors[Math.max(0, Math.min(index, this.classicColors.length - 1))];
		this.hidden_a = c;
		this.hidden_b = c;
		this.accent = c;
	}

	isBlocks() {
		return this.style === "blocks";
	}

	// Цвет закрытой клетки в точке u (0..1 по диагонали поля).
	hiddenAt(u) {
		return this.hidden_a.lerp(this.hidden_b, Math.max(0, Math.min(1, u)));
	}

	numberColor(n) {
		return this.numbers[Math.max(0, Math.min(n, 8))];
	}

	// Цвет текста/иконки поверх закрытой клетки: тёмный на светлом, светлый на тёмном.
	onHidden(c) {
		return c.luminance() > 0.45 ? this.bg.darkened(0.2) : this.text;
	}
}

// Текущая палитра; экраны берут цвета при построении.
export const Pal = { current: Palette.fromSettings({}) };
