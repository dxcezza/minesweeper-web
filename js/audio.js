// Звуки и музыка на Web Audio. Звуки — assets/sfx/<набор>/<имя>.mp3: «Дерево» для стиля «Блоки»,
// «Синт» для неоновых пресетов. Музыка — бесшовные петли assets/music/*.mp3 с кроссфейдом.
// Браузер разрешает звук только после жеста пользователя: контекст будится первым касанием.
import { Save } from "./save.js";
import { Pal } from "./palette.js";

let ctx = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;

function audio() {
	if (ctx) return ctx;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return null;
	ctx = new AC();
	sfxBus = ctx.createGain();
	sfxBus.connect(ctx.destination);
	musicFilter = ctx.createBiquadFilter();
	musicFilter.type = "lowpass";
	musicFilter.frequency.value = 22000;
	musicBus = ctx.createGain();
	musicBus.connect(musicFilter);
	musicFilter.connect(ctx.destination);
	Music.applyVolume();
	return ctx;
}

// Будим звук первым жестом и при возврате на вкладку.
let preloadedSet = "";

export function unlockAudio() {
	const c = audio();
	if (!c) return;
	if (c.state === "suspended") c.resume();
	if (preloadedSet !== Sfx.currentSet()) {
		preloadedSet = Sfx.currentSet();
		Sfx.preload();
	}
}

for (const ev of ["pointerdown", "keydown", "touchend"]) {
	window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

const buffers = new Map();

function load(url) {
	if (buffers.has(url)) return buffers.get(url);
	const p = fetch(url)
		.then((r) => r.arrayBuffer())
		.then((data) => new Promise((resolve, reject) => audio().decodeAudioData(data, resolve, reject)))
		.catch(() => null);
	buffers.set(url, p);
	return p;
}

const dbToGain = (db) => Math.pow(10, db / 20);

// --- Звуки ---

const SOUND_NAMES = ["open", "cascade_3", "cascade_5", "cascade_7", "cascade_9", "deny", "flag", "unflag", "chord", "autoflag",
	"spawn", "clarity", "clock", "hop", "expire", "arm", "cast", "defuse", "explode", "lose", "timeup", "tick",
	"stage", "win", "record", "ui", "mode", "pause", "resume",
	"combo_1", "combo_2", "combo_3", "combo_4", "combo_5", "combo_6", "combo_7", "combo_8", "combo_9", "combo_10"];
// Громкость относительно общей, дБ: поле тише, исходы громче.
const GAIN_DB = { ui: -6, mode: -6, tick: -4, open: -2 };
// Не чаще раза за столько миллисекунд.
const THROTTLE_MS = 40;
// Без разброса высоты: мелодии и шаги комбо должны звучать точно.
const NO_JITTER = new Set(["stage", "win", "lose", "timeup", "record", "clarity", "clock"]);

export const Sfx = {
	_last: new Map(),
	_decoded: new Map(),

	currentSet() {
		return Pal.current.isBlocks() ? "wood" : "synth";
	},

	enabled() {
		return Save.settings.sound && Save.settings.sound_volume > 0;
	},

	// Заранее загрузить набор, чтобы первый звук не опаздывал.
	preload() {
		if (!audio()) return;
		const set = this.currentSet();
		for (const n of SOUND_NAMES) {
			const url = `assets/sfx/${set}/${n}.mp3`;
			load(url).then((b) => b && this._decoded.set(url, b));
		}
	},

	play(name) {
		if (!this.enabled() || !audio() || ctx.state !== "running") return;
		const now = performance.now();
		if (now - (this._last.get(name) ?? -1e9) < THROTTLE_MS) return;
		this._last.set(name, now);
		const url = `assets/sfx/${this.currentSet()}/${name}.mp3`;
		const buf = this._decoded.get(url);
		if (!buf) {
			load(url).then((b) => b && this._decoded.set(url, b));
			return;
		}
		const src = ctx.createBufferSource();
		src.buffer = buf;
		if (!NO_JITTER.has(name) && !name.startsWith("combo")) src.playbackRate.value = 0.97 + Math.random() * 0.06;
		const g = ctx.createGain();
		g.gain.value = Save.settings.sound_volume * dbToGain(GAIN_DB[name] ?? 0);
		src.connect(g).connect(sfxBus);
		src.start();
	},

	// Открытие клеток: одна клетка — щелчок, область — гамма тем длиннее, чем больше область.
	playOpen(cells) {
		if (cells <= 1) this.play("open");
		else if (cells < 8) this.play("cascade_3");
		else if (cells < 20) this.play("cascade_5");
		else if (cells < 45) this.play("cascade_7");
		else this.play("cascade_9");
	},

	// Шаг комбо: каждый шаг выше прошлого, с 10-го — на месте.
	playCombo(step) {
		this.play(`combo_${Math.max(1, Math.min(step - 1, 10))}`);
	},
};

// --- Музыка ---

const FADE_SEC = 0.8;
const PAUSE_DB = -9;
const DUCK_DB = -7;
// Длина петель в отсчётах 32 кГц: mp3 добавляет тишину в конце, петля обрезается точно.
const LOOP_SAMPLES = {
	classic: 365714, classic_perc: 365714, menu: 426667,
	spleen_1: 320000, spleen_1_panic: 296296, spleen_2: 309179, spleen_2_panic: 286277,
	spleen_3: 299065, spleen_3_panic: 276912, spleen_4: 289593, spleen_4_panic: 268141,
	spleen_5: 280702, spleen_5_panic: 259909,
};

export const Music = {
	// Имя играющей петли; пусто — тишина.
	current: "",
	muffled: false,
	_duck: 0,
	_duckTimer: 0,
	// Активный голос: {src, gain, start, len}.
	_voice: null,
	_token: 0,

	enabled() {
		return Save.settings.music && Save.settings.music_volume > 0;
	},

	// Громкость: настройка + пауза + «нырок».
	applyVolume() {
		if (!musicBus) return;
		const vol = this.enabled() ? Save.settings.music_volume : 0;
		const db = (this.muffled ? PAUSE_DB : 0) + this._duck;
		musicBus.gain.setTargetAtTime(vol * dbToGain(db), ctx.currentTime, 0.05);
		musicFilter.frequency.setTargetAtTime(this.muffled ? 900 : 22000, ctx.currentTime, 0.05);
	},

	// Перейти на петлю name. Место в такте сохраняется (доля петли), старая петля затухает.
	play(name) {
		if (name === this.current || !(name in LOOP_SAMPLES)) return;
		this.current = name;
		const token = ++this._token;
		if (!audio()) return;
		load(`assets/music/${name}.mp3`).then((buf) => {
			if (!buf || token !== this._token) return;
			const len = LOOP_SAMPLES[name] / 32000;
			let pos = 0;
			const old = this._voice;
			if (old) pos = (((ctx.currentTime - old.start) / old.len) % 1) * len;
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;
			src.loopStart = 0;
			src.loopEnd = Math.min(len, buf.duration);
			const gain = ctx.createGain();
			gain.gain.value = 0;
			src.connect(gain).connect(musicBus);
			const t = ctx.currentTime;
			src.start(t, pos);
			gain.gain.setTargetAtTime(1, t, FADE_SEC / 3);
			this._voice = { src, gain, start: t - pos, len };
			if (old) this._fadeOut(old, FADE_SEC);
		});
	},

	stop(fadeSec = FADE_SEC) {
		this.current = "";
		this._token++;
		if (this._voice) this._fadeOut(this._voice, fadeSec);
		this._voice = null;
	},

	_fadeOut(v, sec) {
		const t = ctx.currentTime;
		v.gain.gain.cancelScheduledValues(t);
		v.gain.gain.setTargetAtTime(0, t, Math.max(sec, 0.01) / 3);
		v.src.stop(t + Math.max(sec, 0.01) * 2);
	},

	// «Сплин»: петля этапа (0–4), на последних 30 секундах — вариант «паника».
	playSpleen(stage, panic) {
		this.play(`spleen_${Math.max(1, Math.min(stage + 1, 5))}${panic ? "_panic" : ""}`);
	},

	// «Классика»: на «Эксперте» и «Экстриме» добавляется тихая перкуссия.
	playClassic(difficulty) {
		this.play(difficulty >= 4 ? "classic_perc" : "classic");
	},

	setMuffled(on) {
		if (this.muffled === on) return;
		this.muffled = on;
		this.applyVolume();
	},

	// Короткий «нырок» музыки под громкий звук (предмет, Раскрытие).
	duck(sec = 0.6) {
		this._duck = DUCK_DB;
		this.applyVolume();
		clearTimeout(this._duckTimer);
		this._duckTimer = setTimeout(() => {
			this._duck = 0;
			this.applyVolume();
		}, sec * 600);
	},
};

// Вкладка скрыта — звук спит.
document.addEventListener("visibilitychange", () => {
	if (!ctx) return;
	if (document.hidden) ctx.suspend();
	else ctx.resume();
});
