// Рекорды, статистика и настройки в localStorage браузера.
import { Emitter } from "./core/emitter.js";
import { Difficulty } from "./core/config.js";
import { Player } from "./player.js";

const KEY_LEADERBOARD = "spleen.leaderboard";
const KEY_CLASSIC = "spleen.classic";
const KEY_SETTINGS = "spleen.settings";
const FORMAT_VERSION = 1;

export const MAX_NAME_LENGTH = 24;
export const LEADERBOARD_MAX = 20;
export const CLASSIC_MAX = 10;

export const DEFAULT_SETTINGS = {
	vibration: true,
	sound: true,
	sound_volume: 0.7,
	music: true,
	music_volume: 0.6,
	long_press_flag: true,
	long_press_ms: 350,
	chord: true,
	show_score: true,
	last_name: "Игрок",
	// Оформление (см. palette.js).
	palette: "neon",
	hue_shift: 0,
	brightness: 1,
	glow: 0.7,
	bg_dim: 0.5,
	rounding: 0.5,
	outline: 0.7,
	multicolor: true,
	// Последний режим, сложность «Классики», генерация без угадываний.
	last_mode: "spleen",
	classic_difficulty: 1,
	no_guess: false,
};

const DEFAULT_STATS = { games: 0, wins: 0, best_score: 0, best_stage: 0 };
const DEFAULT_CLASSIC_STATS = { games: 0, wins: 0, streak: 0, best_streak: 0 };

export function sanitizeName(raw) {
	const name = String(raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
	return name || "Игрок";
}

function readJson(key) {
	try {
		const text = localStorage.getItem(key);
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

function writeJson(key, data) {
	try {
		localStorage.setItem(key, JSON.stringify(data));
		return true;
	} catch {
		return false;
	}
}

// "2026-10-17 12:30:00"
function nowString() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function newId(prefix = "") {
	return `${prefix}${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Топ-20 «Сплина»: счёт ↓, длительность ↑, дата ↑.
function betterRun(a, b) {
	if (a.score !== b.score) return b.score - a.score;
	if (a.duration !== b.duration) return a.duration - b.duration;
	return String(a.date).localeCompare(String(b.date));
}

// Топ-10 «Классики»: время ↑, дата ↑.
function betterTime(a, b) {
	if (a.time !== b.time) return a.time - b.time;
	return String(a.date).localeCompare(String(b.date));
}

class SaveService extends Emitter {
	constructor() {
		super();
		this.leaderboard = [];
		this.stats = { ...DEFAULT_STATS };
		// key -> [{id, name, time, date}]
		this.classicTables = {};
		// key -> {games, wins, streak, best_streak}
		this.classicStats = {};
		this.settings = { ...DEFAULT_SETTINGS };
		this.load();
	}

	load() {
		const lb = readJson(KEY_LEADERBOARD);
		this.leaderboard = [];
		this.stats = { ...DEFAULT_STATS };
		if (lb && Array.isArray(lb.entries)) {
			for (const d of lb.entries) {
				if (!d || typeof d !== "object" || !("score" in d)) continue;
				this.leaderboard.push({
					id: String(d.id ?? newId()),
					name: sanitizeName(d.name),
					score: Number(d.score) | 0,
					won: !!d.won,
					stages: Number(d.stages) | 0,
					cells: Number(d.cells) | 0,
					time_left: Number(d.time_left) | 0,
					duration: Number(d.duration) | 0,
					date: String(d.date ?? ""),
					seed: Number(d.seed) | 0,
					player: String(d.player ?? ""),
				});
			}
			this.leaderboard.sort(betterRun);
			this.leaderboard.length = Math.min(this.leaderboard.length, LEADERBOARD_MAX);
			if (lb.stats && typeof lb.stats === "object") {
				for (const k in this.stats) this.stats[k] = Number(lb.stats[k]) | 0;
			}
		}

		const cl = readJson(KEY_CLASSIC);
		this.classicTables = {};
		this.classicStats = {};
		if (cl && typeof cl === "object") {
			for (const key in cl.tables ?? {}) {
				const list = cl.tables[key];
				if (!Array.isArray(list)) continue;
				const clean = list
					.filter((e) => e && typeof e === "object" && "time" in e)
					.map((e) => ({ id: String(e.id ?? newId("c")), name: sanitizeName(e.name), time: Math.max(0, Number(e.time) | 0), date: String(e.date ?? ""), player: String(e.player ?? "") }))
					.sort(betterTime)
					.slice(0, CLASSIC_MAX);
				this.classicTables[key] = clean;
			}
			for (const key in cl.stats ?? {}) {
				const raw = cl.stats[key];
				if (!raw || typeof raw !== "object") continue;
				const st = { ...DEFAULT_CLASSIC_STATS };
				for (const k in st) st[k] = Math.max(0, Number(raw[k]) | 0);
				this.classicStats[key] = st;
			}
		}

		const st = readJson(KEY_SETTINGS);
		this.settings = { ...DEFAULT_SETTINGS };
		if (st && typeof st === "object") {
			for (const k in DEFAULT_SETTINGS) {
				if (typeof st[k] === typeof DEFAULT_SETTINGS[k]) this.settings[k] = st[k];
			}
		}
	}

	saveLeaderboard() {
		writeJson(KEY_LEADERBOARD, { version: FORMAT_VERSION, entries: this.leaderboard, stats: this.stats });
	}

	saveClassic() {
		writeJson(KEY_CLASSIC, { version: FORMAT_VERSION, tables: this.classicTables, stats: this.classicStats });
	}

	saveSettings() {
		writeJson(KEY_SETTINGS, this.settings);
	}

	setSetting(key, value) {
		this.settings[key] = value;
		this.saveSettings();
	}

	// --- «Сплин» ---

	// Записывает результат забега сразу, ещё до ввода имени. Возвращает {id, rank}; rank = -1 вне топа.
	submitResult(result) {
		const entry = {
			id: newId(),
			name: this.playerName(),
			player: Player.id,
			score: result.score | 0,
			won: !!result.won,
			stages: result.stages | 0,
			cells: result.cells | 0,
			time_left: result.time_left | 0,
			duration: result.duration | 0,
			date: result.date,
			seed: result.seed | 0,
		};
		this.stats.games++;
		if (entry.won) this.stats.wins++;
		this.stats.best_score = Math.max(this.stats.best_score, entry.score);
		this.stats.best_stage = Math.max(this.stats.best_stage, entry.stages);
		this.leaderboard.push(entry);
		this.leaderboard.sort(betterRun);
		this.leaderboard.length = Math.min(this.leaderboard.length, LEADERBOARD_MAX);
		this.saveLeaderboard();
		this.emit("leaderboardChanged");
		return { id: entry.id, rank: this.leaderboard.findIndex((e) => e.id === entry.id) };
	}

	resetLeaderboard() {
		this.leaderboard = [];
		this.stats = { ...DEFAULT_STATS };
		this.saveLeaderboard();
		this.emit("leaderboardChanged");
	}

	// --- «Классика» ---

	classicEntries(key) {
		return this.classicTables[key] ?? [];
	}

	classicStatsFor(key) {
		return this.classicStats[key] ?? { ...DEFAULT_CLASSIC_STATS };
	}

	// Лучшее время в секундах или -1.
	bestTime(key) {
		const list = this.classicEntries(key);
		return list.length ? list[0].time : -1;
	}

	// Итог партии. Возвращает {id, rank, prevBest, stats}; rank = -1 вне топа или при поражении.
	// ranked = false — партия со «вторым шансом»: идёт в статистику, но не в таблицу.
	submitClassic(difficulty, noGuess, won, seconds, ranked = true) {
		const key = Difficulty.recordKey(difficulty, noGuess);
		const prevBest = this.bestTime(key);
		const entry = { id: newId("c"), name: this.playerName(), time: Math.max(0, seconds), date: nowString(), player: Player.id };
		const st = this.classicStatsFor(key);
		st.games++;
		if (won) {
			st.wins++;
			st.streak++;
			st.best_streak = Math.max(st.best_streak, st.streak);
		} else {
			st.streak = 0;
		}
		this.classicStats[key] = st;
		let rank = -1;
		if (won && ranked) {
			const list = [...this.classicEntries(key), entry].sort(betterTime).slice(0, CLASSIC_MAX);
			this.classicTables[key] = list;
			rank = list.findIndex((e) => e.id === entry.id);
		}
		this.saveClassic();
		this.emit("classicChanged");
		return { id: entry.id, rank, prevBest, stats: st };
	}

	resetClassic() {
		this.classicTables = {};
		this.classicStats = {};
		this.saveClassic();
		this.emit("classicChanged");
	}

	// Имя для таблицы: ник с сайта, если игрок известен, иначе введённое вручную.
	playerName() {
		if (Player.known()) return sanitizeName(Player.name || `Игрок ${Player.id}`);
		return sanitizeName(this.settings.last_name);
	}

	// Имя нельзя менять, если его сообщил сайт.
	canRename() {
		return !Player.known();
	}

	renameEntry(id, newName) {
		if (!this.canRename()) return;
		const clean = sanitizeName(newName);
		if (this.settings.last_name !== clean) this.setSetting("last_name", clean);
		const run = this.leaderboard.find((e) => e.id === id);
		if (run) {
			run.name = clean;
			this.saveLeaderboard();
			this.emit("leaderboardChanged");
			return;
		}
		for (const key in this.classicTables) {
			const e = this.classicTables[key].find((x) => x.id === id);
			if (e) {
				e.name = clean;
				this.saveClassic();
				this.emit("classicChanged");
				return;
			}
		}
	}

	nowString() {
		return nowString();
	}
}

export const Save = new SaveService();
