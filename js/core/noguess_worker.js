// Генерация «без угадываний» в фоне: экран не замирает, пока решатель подбирает поле.
import { generate, buildNeighbors } from "./noguess.js";
import { Rng } from "./rng.js";

self.onmessage = (e) => {
	const { id, width, height, mines, first, seed } = e.data;
	const layout = generate(width, height, mines, first, new Rng(seed), buildNeighbors(width, height));
	self.postMessage({ id, layout });
};
