let tokenLean;

class TokenLean {
	graphic = null;

	leaning = false;

	notified = false;

	toggled = false;

	token = null;

	get rate() {
		return game.settings.get("core", "maxFPS");
	}

	static canLean() {
		const tokenHasVision = canvas.tokens.controlled[0]?.vision?.active === true;
		const isGM = game.user.isGM;
		const leanPaused = game.paused && !game.settings.get("token-lean", "leanWhilePaused");
		const LeanInCombat = game.combat?.started && !game.settings.get("token-lean", "canLeanInCombat");
		return tokenHasVision && (isGM || (!leanPaused && !LeanInCombat));
	}

	lean() {
		if (this.leaning) {
			if (!game.user.isGM && !this.notified) this.notify();
			const token = canvas.tokens.get(tokenLean.token);
			const mousePosition = game.canvas3D?._active
				? game.canvas3D.interactionManager.canvas2dMousePosition
				: canvas.mousePosition;
			const tokenSize = Math.max(token.document.height, token.document.width);
			const limit = tokenSize * canvas.grid.size * game.settings.get("token-lean", "limit");
			const origin = token.getMovementAdjustedPoint(token.center);
			const collisionRayLimit = Math.min(
				limit,
				Math.hypot(mousePosition.x - token.center.x, mousePosition.y - token.center.y)
			);
			const collisionRay = Ray.towardsPoint(origin, mousePosition, collisionRayLimit);
			//block leaning token through impassable terrain walls
			const collision = ClockwiseSweepPolygon.testCollision(collisionRay.A, collisionRay.B, {
				type: "move",
				mode: "closest",
			});

			if (!collision) {
				this.updateVisionPosition(token, collisionRay.B);
			}
		} else {
			const token = canvas.tokens.get(this.token);
			if (token) this.updateVisionPosition(token, token.getMovementAdjustedPoint(token.center), true);
			this.token = null;
			this.notified = false;
		}
	}

	notify() {
		const notifyOnLean = game.settings.get("token-lean", "notifyOnLean");
		const notifyOnCombat = game.combat?.started && notifyOnLean === 2;
		if (notifyOnLean && !notifyOnCombat) {
			ChatMessage.create({
				whisper: ChatMessage.getWhisperRecipients("GM"),
				content: `I'm leaning`,
				speaker: ChatMessage.getSpeaker(),
				sound: game.settings.get("token-lean", "notifySound"),
			});
			this.notified = true;
		}
	}

	updateVisionPosition(token, newPosition = null, reset = false) {
		const isVisionSource = token._isVisionSource();
		const origin = token.getMovementAdjustedPoint(token.center);

		const visionData = token.vision.data;

		let x, y;

		if (isVisionSource && !reset) {
			x = newPosition.x;
			y = newPosition.y;
		} else {
			x = origin.x;
			y = origin.y;
		}
		visionData.x = x;
		visionData.y = y;

		token.vision.initialize(visionData);
		if (token.light) {
			const lightData = token.light.data;
			lightData.x = x;
			lightData.y = y;
			token.light.initialize(lightData);
		}

		canvas.perception.update({
			refreshVision: true,
			refreshLighting: true,
		});
	}
}

Hooks.on("i18nInit", () => {
	game.settings.register("token-lean", "limit", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.limit.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.limit.Hint"),
		config: true,
		type: new foundry.data.fields.NumberField({ required: true, min: 0.5, max: 2, step: 0.25, initial: 0.75 }),
		scope: "world",
	});

	game.settings.register("token-lean", "leanWhilePaused", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.leanWhilePaused.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.leanWhilePaused.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: false,
	});

	game.settings.register("token-lean", "canLeanInCombat", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register("token-lean", "combatLeanToggle", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.combatLeanToggle.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.combatLeanToggle.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
		requiresReload: true,
	});

	game.settings.register("token-lean", "notifyOnLean", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Hint"),
		config: true,
		type: Number,
		scope: "world",
		default: 1,
		choices: {
			1: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Options.1"),
			2: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Options.2"),
			0: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Options.0"),
		},
	});

	game.settings.register("token-lean", "notifySound", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Hint"),
		config: true,
		filePicker: "audio",
		scope: "world",
		default: "modules/token-lean/audio/leanSound.ogg",
	});

	const lean = () => {
		if (TokenLean.canLean()) {
			if (!tokenLean.leaning) tokenLean.token = canvas.tokens.controlled[0].id;
			tokenLean.leaning = true;
			tokenLean.lean();
		}
	};

	game.keybindings.register("token-lean", "lean", {
		name: "TOKEN-LEAN.Keybindings.lean.Name",
		hint: "TOKEN-LEAN.Keybindings.lean.Hint",
		editable: [{ key: "KeyQ" }],
		onDown: () => lean(),
		onUp: () => {
			tokenLean.leaning = false;
			tokenLean.lean();
		},
		repeat: true,
	});

	game.keybindings.register("token-lean", "leanToggle", {
		name: "TOKEN-LEAN.Keybindings.leanToggle.Name",
		hint: "TOKEN-LEAN.Keybindings.leanToggle.Hint",
		editable: [],
		onDown: () => {
			if (!tokenLean.toggled) {
				lean();
			} else {
				tokenLean.leaning = false;
				tokenLean.lean();
				tokenLean.toggled = false;
			}
		},
		onUp: () => {
			if (tokenLean.leaning) tokenLean.toggled = true;
		},
		repeat: true,
	});
});

Hooks.on("setup", () => {
	tokenLean = new TokenLean();
});

Hooks.on("getSceneControlButtons", (controls) => {
	if (game.user.isGM && game.settings.get("token-lean", "combatLeanToggle")) {
		const toggle = {
			name: "enableCombatLean",
			title: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Name"),
			icon: "fas fa-face-hand-peeking",
			toggle: true,
			active: game.settings.get("token-lean", "canLeanInCombat"),
			onClick: (toggle) => {
				let newState = !game.settings.get("token-lean", "canLeanInCombat");
				game.settings.set("token-lean", "canLeanInCombat", newState);
			},
		};
		controls.find((c) => c.name == "token").tools.push(toggle);
	}
});

Hooks.on("controlToken", (token, controlled) => {
	if (tokenLean.leaning) {
		if (token.id !== tokenLean.token) tokenLean.token = token.id;
		else if (!controlled) tokenLean.token = null;
		tokenLean.toggled = false;
	}
});
