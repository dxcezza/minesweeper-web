// Баланс: этапы «Сплина», предметы, очки, сложности «Классики».

export const Item = {
	NONE: 0,
	CLARITY: 1,
	CLOCK: 2,
	CLARITY_MANA: 25,
	CLOCK_SECONDS: 30,
	// Сколько кликов мимо предмет переживает.
	LIFE_CLICKS: 5,
};

export function stageConfig(width, height, mines, extra = {}) {
	return {
		width, height, mines,
		// Бросок на предмет делается после первого открытия и затем каждые K безопасных клеток.
		rollEveryCells: 18,
		weightClarity: 28, weightClock: 22, weightEmpty: 50,
		...extra,
	};
}

export const STAGES = [
	stageConfig(9, 9, 10, { weightClarity: 28, weightClock: 22, weightEmpty: 50 }),
	stageConfig(12, 11, 19, { weightClarity: 26, weightClock: 17, weightEmpty: 57 }),
	stageConfig(15, 13, 32, { weightClarity: 26, weightClock: 18, weightEmpty: 56 }),
	stageConfig(18, 14, 47, { weightClarity: 27, weightClock: 20, weightEmpty: 53 }),
	stageConfig(20, 16, 66, { weightClarity: 27, weightClock: 22, weightEmpty: 51 }),
];

// Формула очков: 15 за клетку, 4000 за этап, 20 за секунду (только при победе) плюс комбо.
export const Score = {
	PER_CELL: 15,
	PER_STAGE: 4000,
	PER_SECOND: 20,
	// Открытия чаще этого интервала продолжают серию.
	COMBO_WINDOW_MS: 1800,
	COMBO_STEP: 0.1,
	COMBO_MAX_MULT: 2.0,

	live(cells, stages, comboPoints = 0) {
		return cells * this.PER_CELL + stages * this.PER_STAGE + comboPoints;
	},

	comboMultiplier(combo) {
		return Math.min(1 + this.COMBO_STEP * Math.max(combo - 1, 0), this.COMBO_MAX_MULT);
	},

	comboBonus(base, combo) {
		return Math.round(base * (this.comboMultiplier(combo) - 1));
	},

	// «×1,3», «×2»
	formatMultiplier(mult) {
		let s = mult.toFixed(1);
		if (s.endsWith(".0")) s = s.slice(0, -2);
		return "×" + s.replace(".", ",");
	},

	breakdown(cells, stages, secondsLeft, won, comboPoints = 0) {
		const cellPoints = cells * this.PER_CELL;
		const stagePoints = stages * this.PER_STAGE;
		const timePoints = won ? secondsLeft * this.PER_SECOND : 0;
		return {
			cells, stages, secondsLeft, cellPoints, stagePoints, timePoints, comboPoints,
			total: cellPoints + stagePoints + timePoints + comboPoints,
		};
	},
};

// Сложности «Классики»: с каждой ступенью поле больше и мины плотнее (10% → 22%).
export const Difficulty = {
	LIST: [
		{ id: "warmup", name: "Разминка", w: 8, h: 10, mines: 8 },
		{ id: "easy", name: "Лёгкая", w: 9, h: 12, mines: 14 },
		{ id: "medium", name: "Средняя", w: 12, h: 16, mines: 30 },
		{ id: "hard", name: "Сложная", w: 14, h: 20, mines: 50 },
		{ id: "expert", name: "Эксперт", w: 16, h: 26, mines: 85 },
		{ id: "extreme", name: "Экстрим", w: 20, h: 34, mines: 150 },
	],

	count() {
		return this.LIST.length;
	},

	info(index) {
		return this.LIST[Math.max(0, Math.min(index, this.LIST.length - 1))];
	},

	// Поле без предметов.
	config(index) {
		const d = this.info(index);
		return stageConfig(d.w, d.h, d.mines, { weightClarity: 0, weightClock: 0, weightEmpty: 100 });
	},

	densityText(index) {
		const d = this.info(index);
		const p = Math.round((d.mines / (d.w * d.h)) * 1000) / 10;
		return p.toFixed(1).replace(".", ",").replace(/,0$/, "");
	},

	// С опцией «Без угадываний» рекорды отдельные.
	recordKey(index, noGuess) {
		return this.info(index).id + (noGuess ? "_ng" : "");
	},
};
