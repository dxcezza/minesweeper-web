// Кто играет. Игра встраивается фреймом на huevo.su; сайт может сообщить пользователя двумя способами:
// 1) параметрами адреса фрейма: ?user_id=123&username=vasya
// 2) сообщением из родительской страницы: postMessage({type: "huevo:user", user: {id, username}}, "*")
//    (игра сама просит его, отправляя родителю {type: "spleen:ready"}).
// Поля принимаются под разными привычными именами (id / user_id / uid, username / name / login ...).
// Без данных игра работает как раньше: игрок «Игрок» и имя вводится вручную.
import { Emitter } from "./core/emitter.js";

// Сообщения принимаются только от этих сайтов (и их поддоменов).
const TRUSTED_HOSTS = ["huevo.su"];
// Локальная разработка: тестовая страница с фреймом на том же компьютере.
if (["localhost", "127.0.0.1"].includes(location.hostname)) TRUSTED_HOSTS.push("localhost", "127.0.0.1");
const ID_KEYS = ["id", "user_id", "userId", "uid"];
const NAME_KEYS = ["username", "name", "login", "nickname", "nick", "display_name", "displayName"];

function pick(obj, keys) {
	for (const k of keys) {
		const v = obj?.[k];
		if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
	}
	return "";
}

function trusted(origin) {
	try {
		const host = new URL(origin).hostname;
		return TRUSTED_HOSTS.some((t) => host === t || host.endsWith("." + t));
	} catch {
		return false;
	}
}

class PlayerService extends Emitter {
	constructor() {
		super();
		// Пусто — игрок не известен.
		this.id = "";
		this.name = "";
		this._fromUrl();
		window.addEventListener("message", (e) => this._onMessage(e));
		if (window.parent !== window) {
			try {
				window.parent.postMessage({ type: "spleen:ready" }, "*");
			} catch {
				// Родитель недоступен — значит, ждём только параметры адреса.
			}
		}
	}

	known() {
		return this.id !== "" || this.name !== "";
	}

	_fromUrl() {
		const q = new URLSearchParams(location.search);
		const obj = Object.fromEntries(q.entries());
		this._set(pick(obj, ID_KEYS), pick(obj, NAME_KEYS));
	}

	_onMessage(e) {
		if (e.source !== window.parent || !trusted(e.origin)) return;
		let data = e.data;
		if (typeof data === "string") {
			try {
				data = JSON.parse(data);
			} catch {
				return;
			}
		}
		if (!data || typeof data !== "object") return;
		const user = data.user ?? data.data?.user ?? data.data ?? data;
		this._set(pick(user, ID_KEYS), pick(user, NAME_KEYS));
	}

	_set(id, name) {
		if (!id && !name) return;
		if (id === this.id && name === this.name) return;
		this.id = id.slice(0, 64);
		this.name = name;
		this.emit("changed");
	}
}

export const Player = new PlayerService();
