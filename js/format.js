// Форматирование чисел, времени и дат для интерфейса.

// 45261 -> "45 261"
export function fmtInt(n) {
	const s = String(Math.abs(Math.trunc(n)));
	return (n < 0 ? "-" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// 125 -> "02:05"
export function fmtTime(seconds) {
	seconds = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// "2026-10-17 12:30:00" -> "17.10.26"
export function fmtDate(iso) {
	const parts = String(iso).slice(0, 10).split("-");
	if (parts.length !== 3) return iso;
	return `${parts[2]}.${parts[1]}.${parts[0].slice(-2)}`;
}
