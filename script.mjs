let tokenLean;

class TokenLean {
	notified = false;

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

	static leaning = false;

	lean() {
		if (this.leaning) {
			this.notify();
			const token = canvas.tokens.get(tokenLean.token);
			const mousePosition = game.canvas3D?._active
				? game.canvas3D.interactionManager.canvas2dMousePosition
				: canvas.app.renderer.events.pointer.getLocalPosition(canvas.app.stage);
			const tokenSize = Math.max(token.document.height, token.document.width);
			const limit = tokenSize * canvas.grid.size * game.settings.get("token-lean", "limit");
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
				this.updateVisionPosition(token, collisionRay.B);
			}
		}
	}

	notify() {
		if (game.settings.get("token-lean", "notifyOnLean") && !this.notified) {
			if (game.combat?.started && game.settings.get("token-lean", "notifyInCombatOnly")) {
				ChatMessage.create({
					whisper: ChatMessage.getWhisperRecipients("GM"),
					content: `I'm leaning`,
					speaker: ChatMessage.getSpeaker(),
					sound: game.settings.get("token-lean", "playSound")
						? game.settings.get("token-lean", "notifySound")
						: null,
				});
			}
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

		canvas.perception.update(
			{
				refreshVision: true,
				refreshLighting: true,
			},
			true
		);
	}
}

Hooks.on("i18nInit", () => {
	game.settings.register("token-lean", "leaningToken", {
		config: false,
		type: String,
		scope: "client",
	});

	game.settings.register("token-lean", "limit", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.Limit.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.Limit.Hint"),
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
	});

	game.settings.register("token-lean", "notifyOnLean", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifyOnLean.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register("token-lean", "notifyInCombatOnly", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifyInCombatOnly.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifyInCombatOnly.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: false,
	});

	game.settings.register("token-lean", "playSound", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.playSound.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.playSound.Hint"),
		config: true,
		type: Boolean,
		scope: "world",
		default: true,
	});

	game.settings.register("token-lean", "notifySound", {
		name: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Name"),
		hint: game.i18n.localize("TOKEN-LEAN.Settings.notifySound.Hint"),
		config: true,
		filePicker: "audio",
		scope: "world",
		default: "modules/token-lean/audio/leanSound.ogg",
	});

	game.keybindings.register("token-lean", "lean", {
		name: "Lean",
		hint: "Press to move your vision towards the mouse cursor.",
		editable: [{ key: "KeyQ" }],
		onDown: () => {
			if (TokenLean.canLean()) {
				if (!tokenLean.leaning) tokenLean.token = canvas.tokens.controlled[0].id;
				tokenLean.leaning = true;
				tokenLean.lean();
			}
		},
		onUp: () => {
			if (TokenLean.canLean()) {
				tokenLean.leaning = false;
				const token = canvas.tokens.get(tokenLean.token);
				tokenLean.updateVisionPosition(token, token.getMovementAdjustedPoint(token.center), true);
				tokenLean.token = null;
			}
		},
		repeat: true,
	});
});

Hooks.on("setup", () => {
	tokenLean = new TokenLean();
});

Hooks.on("getSceneControlButtons", (controls) => {
	//only render for gm
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
	if (tokenLean.leaning) tokenLean.token = token.id;
});
