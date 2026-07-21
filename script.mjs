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
		if (!game.user.isGM && !this.notified) this.notify();
		const token = canvas.tokens.get(this.token.id);
		const mousePosition = game.canvas3D?._active
			? game.canvas3D.interactionManager.canvas2dMousePosition
			: canvas.mousePosition;
		const tokenSize = Math.max(token.document.height, token.document.width);
		const limit = tokenSize * canvas.grid.size * game.settings.get("token-lean", "limit");
		const origin = token.getMovementAdjustedPoint(this.token.center);
		const collisionRayLimit = Math.min(
			limit,
			Math.hypot(mousePosition.x - this.token.center.x, mousePosition.y - this.token.center.y)
		);
		const collisionRay = Ray.towardsPoint(origin, mousePosition, collisionRayLimit);
		//block leaning token through impassable terrain walls
		const collision = ClockwiseSweepPolygon.testCollision(collisionRay.A, collisionRay.B, {
			type: "sight",
			mode: "closest"
		});

		if (!collision) {
			this.updateVisionPosition(token, collisionRay.B);
		}
	}

	unlean() {
		const token = canvas.tokens.get(this.token?.id);
		if (token) this.updateVisionPosition(token);
		this.token = null;
		this.leaning = false;
		this.notified = false;
		this.toggled = false;
	}

	notify() {
		const notifyOnLean = game.settings.get("token-lean", "notifyOnLean");
		const notifyOnCombat = game.combat?.started && notifyOnLean === 2;
		if (notifyOnLean && !notifyOnCombat) {
			ChatMessage.create({
				whisper: ChatMessage.getWhisperRecipients("GM"),
				content: game.settings.get("token-lean", "notifyMessage"),
				speaker: ChatMessage.getSpeaker(),
				sound: game.settings.get("token-lean", "notifySound")
			});
			this.notified = true;
		}
	}

	updateVisionPosition(token, newPosition) {
		const isVisionSource = token._isVisionSource();

		const visionData = token.vision?.data;
		const { mesh } = token;

		let x, y;

		if (isVisionSource && newPosition) {
			x = newPosition.x;
			y = newPosition.y;
			token.border.visible = false;
			token.effects.visible = false;
		} else {
			const { center } = this.token;
			x = center.x;
			y = center.y;
			token.border.visible = true;
			token.effects.visible = true;
		}
		if (visionData) {
			visionData.x = x;
			visionData.y = y;

			token.vision.initialize(visionData);
		}
		mesh.x = x;
		mesh.y = y;

		if (token.light) {
			const lightData = token.light.data;
			lightData.x = x;
			lightData.y = y;
			token.light.initialize(lightData);
		}

		canvas.perception.update({
			refreshVision: true,
			refreshLighting: true
		});
	}
}

Hooks.on("i18nInit", () => {
	game.settings.register("token-lean", "limit", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.limit.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.limit.Hint"),
		config: true,
		type: new foundry.data.fields.NumberField({ required: true, min: 0.5, max: 2, step: 0.25, initial: 0.75 }),
		scope: "world"
	});

	game.settings.register("token-lean", "leanWhilePaused", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.leanWhilePaused.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.leanWhilePaused.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: false
	});

	game.settings.register("token-lean", "canLeanInCombat", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true
	});

	game.settings.register("token-lean", "combatLeanToggle", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.combatLeanToggle.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.combatLeanToggle.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
		requiresReload: true
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
			0: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Options.0")
		}
	});

	game.settings.register("token-lean", "notifyMessage", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifyMessage.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifyMessage.Hint"),
		config: true,
		type: String,
		scope: "world",
		default: game.i18n.localize("TOKEN-LEAN.Settings.notifyMessage.Default"),
	});

	game.settings.register("token-lean", "notifySound", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Hint"),
		config: true,
		filePicker: "audio",
		scope: "world",
		default: "modules/token-lean/audio/leanSound.ogg"
	});

	const lean = () => {
		if (TokenLean.canLean()) {
			const token = canvas.tokens.controlled[0];
			const { center, id, x, y } = token;
			if (!tokenLean.leaning) tokenLean.token = { center, id, x, y };
			tokenLean.leaning = true;
			tokenLean.lean();
		}
	};

	game.keybindings.register("token-lean", "lean", {
		name: "TOKEN-LEAN.Keybindings.lean.Name",
		hint: "TOKEN-LEAN.Keybindings.lean.Hint",
		editable: [{ key: "KeyP" }],
		onDown: () => lean(),
		onUp: () => {
			if (!TokenLean.canLean()) return true;
			tokenLean.unlean();
		},
		repeat: true
	});

	game.keybindings.register("token-lean", "leanToggle", {
		name: "TOKEN-LEAN.Keybindings.leanToggle.Name",
		hint: "TOKEN-LEAN.Keybindings.leanToggle.Hint",
		editable: [],
		onDown: () => {
			if (!tokenLean.toggled) {
				lean();
			} else {
				tokenLean.unlean();
			}
		},
		onUp: () => {
			if (tokenLean.leaning) tokenLean.toggled = true;
		}
	});
});

Hooks.on("setup", () => {
	tokenLean = new TokenLean();
});

Hooks.on("getSceneControlButtons", (controls) => {
	if (game.user.isGM && game.settings.get("token-lean", "combatLeanToggle")) {
		const toggle = {
			name: "tokenLean",
			title: game.i18n.localize("TOKEN-LEAN.Settings.canLeanInCombat.Name"),
			icon: "fas fa-face-hand-peeking",
			toggle: true,
			active: game.settings.get("token-lean", "canLeanInCombat"),
			onClick: (toggle) => {
				let newState = !game.settings.get("token-lean", "canLeanInCombat");
				game.settings.set("token-lean", "canLeanInCombat", newState);
			}
		};
		if (game.release.generation <= 12) controls.find((c) => c.name == "token").tools.push(toggle);
		else controls.tokens.tools.tokenLean = toggle;
	}
});

Hooks.on("controlToken", (token, controlled) => {
	if (tokenLean.leaning && !controlled) tokenLean.unlean();
});
