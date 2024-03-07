const MODULE_NAME = "token-lean";

let wait = false;
let rate = 30;

Hooks.on("init", () => {
	game.settings.register(MODULE_NAME, "leaningToken", {
		config: false,
		type: String,
		scope: "client",
	});

	game.settings.register(MODULE_NAME, "limit", {
		name: game.i18n.localize("token-lean.Limit.Name"),
		hint: game.i18n.localize("token-lean.Limit.Hint"),
		config: true,
		type: Number,
		scope: "world",
		default: 0.25,
		onChange: (value) => {
			if (value < -0.5) game.settings.set(MODULE_NAME, "limit", Math.max(value, -0.5));
		},
	});

	game.settings.register(MODULE_NAME, "leanWhilePaused", {
		name: game.i18n.localize("token-lean.leanWhilePaused.Name"),
		hint: game.i18n.localize("token-lean.leanWhilePaused.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: false,
	});

	game.settings.register(MODULE_NAME, "canLeanInCombat", {
		name: game.i18n.localize("token-lean.canLeanInCombat.Name"),
		hint: game.i18n.localize("token-lean.canLeanInCombat.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register(MODULE_NAME, "combatLeanToggle", {
		name: game.i18n.localize("token-lean.combatLeanToggle.Name"),
		hint: game.i18n.localize("token-lean.combatLeanToggle.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register(MODULE_NAME, "notifyOnLean", {
		name: game.i18n.localize("token-lean.notifyOnLean.Name"),
		hint: game.i18n.localize("token-lean.notifyOnLean.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register(MODULE_NAME, "notifyInCombatOnly", {
		name: game.i18n.localize("token-lean.notifyInCombatOnly.Name"),
		hint: game.i18n.localize("token-lean.notifyInCombatOnly.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: false,
	});

	game.settings.register(MODULE_NAME, "playSound", {
		name: game.i18n.localize("token-lean.playSound.Name"),
		hint: game.i18n.localize("token-lean.playSound.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register(MODULE_NAME, "notifySound", {
		name: game.i18n.localize("token-lean.notifySound.Name"),
		hint: game.i18n.localize("token-lean.notifySound.Hint"),
		config: true,
		filePicker: "audio",
		scope: "world",
		default: "modules/token-lean/audio/leanSound.ogg",
	});

	game.keybindings.register(MODULE_NAME, "lean", {
		name: "Lean",
		hint: "Press to move your vision towards the mouse cursor.",
		editable: [{ key: "KeyQ" }],
		onDown: () => {
			if (selectedTokenHasVision() && canLeanInCombat() && canLeanWhilePaused()) {
				game.settings.set(MODULE_NAME, "leaningToken", canvas.tokens.controlled[0].id);
				enableLean(true);
			}
		},
		onUp: () => {
			if (selectedTokenHasVision() && canLeanInCombat() && canLeanWhilePaused()) {
				enableLean(false);
			}
		},
		repeat: false,
	});
});

Hooks.on("ready", () => {
	rate = game.settings.get("core", "maxFPS");
});

Hooks.on("getSceneControlButtons", (controls) => {
	//only render for gm
	if (game.user.isGM && game.settings.get(MODULE_NAME, "combatLeanToggle")) {
		const toggle = {
			name: "enableCombatLean",
			title: game.i18n.localize("token-lean.canLeanInCombat.Name"),
			icon: "fas fa-face-hand-peeking",
			toggle: true,
			active: game.settings.get(MODULE_NAME, "canLeanInCombat"),
			onClick: (toggle) => {
				let newState = !game.settings.get(MODULE_NAME, "canLeanInCombat");
				game.settings.set(MODULE_NAME, "canLeanInCombat", newState);
			},
		};
		controls.find((c) => c.name == "token").tools.push(toggle);
	}
});

function selectedTokenHasVision() {
	return canvas.tokens.controlled[0]?.vision?.active === true;
}

function canLeanWhilePaused() {
	return !(game.paused && !game.settings.get(MODULE_NAME, "leanWhilePaused"));
}

function canLeanInCombat() {
	return !(game.combat?.started && !game.settings.get(MODULE_NAME, "canLeanInCombat"));
}

function notify() {
	if (game.combat?.started && game.settings.get(MODULE_NAME, "notifyInCombatOnly")) {
		ChatMessage.create({
			whisper: ChatMessage.getWhisperRecipients("GM"),
			content: `I'm leaning`,
			speaker: ChatMessage.getSpeaker(),
			sound: game.settings.get(MODULE_NAME, "playSound") ? game.settings.get(MODULE_NAME, "notifySound") : null,
		});
	}
}

function enableLean(enable) {
	if (enable) {
		if (game.settings.get(MODULE_NAME, "notifyOnLean")) {
			notify();
		}
		leanTowardsMouse();
		document.addEventListener("mousemove", updateOnMouseMove);
	} else {
		let token = canvas.tokens.get(game.settings.get(MODULE_NAME, "leaningToken"));
		updateVisionPosition(token, token.getMovementAdjustedPoint(token.center), true);
		document.removeEventListener("mousemove", updateOnMouseMove);
	}
}

function updateOnMouseMove() {
	if (!wait) {
		wait = true;
		setTimeout(() => {
			wait = false;
		}, 1000 / rate);
		leanTowardsMouse();
	}
}

function leanTowardsMouse() {
	const token = canvas.tokens.get(game.settings.get(MODULE_NAME, "leaningToken"));
	const mousePosition = game.canvas3D?._active
		? game.canvas3D.interactionManager.canvas2dMousePosition
		: canvas.app.renderer.events.pointer.getLocalPosition(canvas.app.stage);
	const tokenSize = Math.max(token.document.height, token.document.width);
	const limit = tokenSize * canvas.grid.size * (0.5 + game.settings.get(MODULE_NAME, "limit"));
	const origin = token.getMovementAdjustedPoint(token.center);
	const collisionRayLimit = Math.min(
		limit,
		Math.hypot(mousePosition.x - token.center.x, mousePosition.y - token.center.y)
	);
	const collisionRay = Ray.towardsPoint(origin, mousePosition, collisionRayLimit);
	//block leaningToken through impassable terrain walls
	const collision = ClockwiseSweepPolygon.testCollision(collisionRay.A, collisionRay.B, {
		type: "move",
		mode: "closest",
	});

	if (!collision) {
		updateVisionPosition(token, collisionRay.B);
	}
}

function updateVisionPosition(token, newPosition = null, reset = false) {
	const isVisionSource = token._isVisionSource();
	const origin = token.getMovementAdjustedPoint(token.center);

	const visionData = token.vision.data;
	const lightData = token.light.data;

	let x, y;

	if (isVisionSource && !reset) {
		x = newPosition.x;
		y = newPosition.y;
	} else {
		x = origin.x;
		y = origin.y;
	}
	visionData.x = lightData.x = x;
	visionData.y = lightData.y = y;

	token.vision.initialize(visionData);
	token.light.initialize(lightData);

	canvas.perception.update(
		{
			refreshVision: true,
			refreshLighting: true,
		},
		true
	);
}
