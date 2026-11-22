// Virtual clock shim (spike). Loaded as a classic script before any module, only when the
// page URL has ?shim=1. Makes Date, performance.now, timers, requestAnimationFrame and
// Math.random follow a virtual time that the frame driver advances explicitly.
(() => {
	if (!new URLSearchParams(location.search).has("shim")) return;

	const native = {
		setTimeout: window.setTimeout.bind(window),
		clearTimeout: window.clearTimeout.bind(window),
		setInterval: window.setInterval.bind(window),
		clearInterval: window.clearInterval.bind(window),
		requestAnimationFrame: window.requestAnimationFrame.bind(window),
		cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
		performanceNow: performance.now.bind(performance),
		Date: window.Date,
		random: Math.random,
	};

	const EPOCH = Date.UTC(2026, 0, 1);
	let now = 0;
	let nextId = 1;
	const timers = new Map(); // id -> { due, cb, args, interval }
	let rafQueue = new Map(); // id -> cb

	// mulberry32, reseeded per frame
	let rngState = 1;
	const reseed = (seed) => {
		rngState = (seed >>> 0) ^ 0x9e3779b9;
	};
	Math.random = () => {
		rngState = (rngState + 0x6d2b79f5) | 0;
		let t = rngState;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};

	performance.now = () => now;

	const NativeDate = native.Date;
	// biome-ignore lint/correctness/noComponentHookFactories: a Date constructor, not a React component
	function VirtualDate(...args) {
		if (!new.target) return new NativeDate(EPOCH + now).toString();
		if (args.length === 0) return new NativeDate(EPOCH + now);
		return new NativeDate(...args);
	}
	VirtualDate.prototype = NativeDate.prototype;
	VirtualDate.now = () => EPOCH + now;
	VirtualDate.parse = NativeDate.parse;
	VirtualDate.UTC = NativeDate.UTC;
	window.Date = VirtualDate;

	window.setTimeout = (cb, delay = 0, ...args) => {
		const id = nextId++;
		timers.set(id, { due: now + Math.max(0, Number(delay) || 0), cb, args, interval: null });
		return id;
	};
	window.setInterval = (cb, delay = 0, ...args) => {
		const id = nextId++;
		const interval = Math.max(1, Number(delay) || 0);
		timers.set(id, { due: now + interval, cb, args, interval });
		return id;
	};
	window.clearTimeout = (id) => timers.delete(id);
	window.clearInterval = (id) => timers.delete(id);
	window.requestAnimationFrame = (cb) => {
		const id = nextId++;
		rafQueue.set(id, cb);
		return id;
	};
	window.cancelAnimationFrame = (id) => rafQueue.delete(id);

	window.__motioClock = {
		native,
		get now() {
			return now;
		},
		setFrame(frame, fps) {
			now = (frame / fps) * 1000;
			reseed(frame);
		},
		// Runs every timer due up to the current virtual time, in due order, then one rAF tick.
		runDue(wrap) {
			let guard = 0;
			for (;;) {
				let next = null;
				for (const [id, t] of timers) {
					if (t.due <= now && (next === null || t.due < next[1].due)) next = [id, t];
				}
				if (next === null) break;
				const [id, t] = next;
				if (t.interval === null) timers.delete(id);
				else t.due += t.interval;
				wrap(() => t.cb(...t.args));
				if (++guard > 100000) throw new Error("clock-shim: runaway timers");
			}
			const queue = rafQueue;
			rafQueue = new Map();
			for (const cb of queue.values()) wrap(() => cb(now));
		},
	};
})();
