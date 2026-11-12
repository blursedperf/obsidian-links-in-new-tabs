import {
	App,
	FileView,
	Keymap,
	Notice,
	OpenViewState,
	PaneType,
	Platform,
	Plugin,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	View,
	WorkspaceLeaf,
	WorkspaceWindow,
} from "obsidian";
import { around } from "monkey-around";
import {
	DEFAULT_SETTINGS,
	DefaultOpenTarget,
	LinksInNewTabsSettings,
	resolveOpenLinkBehavior,
	splitLinktext,
} from "./resolver";

/** Window of time (ms) to correlate a Mod+Click with its delayed openLinkText call. */
const MOD_INTERACTION_WINDOW_MS = 500;

type FocusableView = View & { focus: () => void };

function isFocusableView(view: View): view is FocusableView {
	return typeof (view as Partial<FocusableView>).focus === "function";
}

export default class LinksInNewTabsPlugin extends Plugin {
	settings: LinksInNewTabsSettings = { ...DEFAULT_SETTINGS };
	private lastPlainModInteractionTimestamp = 0;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerInteractionTrackers();
		this.patchWorkspaceOpenLinkText();

		this.addCommand({
			id: "toggle",
			name: "Toggle default link opening behavior",
			callback: async () => {
				this.settings.enabled = !this.settings.enabled;
				await this.saveSettings();
				new Notice(
					`Open links in new tab: ${this.settings.enabled ? "enabled" : "disabled"}`
				);
			},
		});

		this.addSettingTab(new LinksInNewTabsSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<LinksInNewTabsSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...loaded };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Tracks whether the user's most recent pointer or keyboard interaction held `Mod` (Cmd/Ctrl)
	 * without `Alt` or `Shift`. Cleared immediately on any unmodified interaction.
	 */
	private registerInteractionTrackers(): void {
		const recordEvent = (evt: MouseEvent | KeyboardEvent): void => {
			const isMod = Keymap.isModifier(evt, "Mod");
			const isAlt = Keymap.isModifier(evt, "Alt");
			const isShift = Keymap.isModifier(evt, "Shift");

			if (isMod && !isAlt && !isShift) {
				this.lastPlainModInteractionTimestamp = Date.now();
			} else {
				this.lastPlainModInteractionTimestamp = 0;
			}
		};

		const registeredWindows = new WeakSet<Window>();
		const registerWindowEvents = (win: Window): void => {
			if (!win || registeredWindows.has(win)) {
				return;
			}
			registeredWindows.add(win);
			this.registerDomEvent(win, "click", recordEvent, { capture: true });
			this.registerDomEvent(win, "auxclick", recordEvent, { capture: true });
			this.registerDomEvent(win, "keydown", recordEvent, { capture: true });
		};

		// Track main window
		registerWindowEvents(window);

		// Track any existing popout windows
		this.app.workspace.iterateAllLeaves((leaf) => {
			const root = leaf.getRoot();
			if (typeof WorkspaceWindow !== "undefined" && root instanceof WorkspaceWindow && root.win) {
				registerWindowEvents(root.win);
			}
		});

		// Track any newly opened popout windows
		this.registerEvent(
			this.app.workspace.on("window-open", (_win, popoutWindow) => {
				registerWindowEvents(popoutWindow);
			})
		);
	}

	private consumePlainModInteraction(): boolean {
		if (this.lastPlainModInteractionTimestamp === 0) {
			return false;
		}
		const elapsed = Date.now() - this.lastPlainModInteractionTimestamp;
		this.lastPlainModInteractionTimestamp = 0;
		return elapsed >= 0 && elapsed <= MOD_INTERACTION_WINDOW_MS;
	}

	private patchWorkspaceOpenLinkText(): void {
		// eslint-disable-next-line @typescript-eslint/no-this-alias -- the patched function needs both the plugin and Obsidian's own `this`
		const plugin = this;

		this.register(
			around(this.app.workspace, {
				openLinkText(oldOpenLinkText) {
					return async function (
						linktext: string,
						sourcePath: string,
						newLeaf?: PaneType | boolean,
						openViewState?: OpenViewState
					): Promise<void> {
						const isPlainModInteraction = plugin.consumePlainModInteraction();
						const activeFile = plugin.app.workspace.getActiveFile();
						const { path, subpath } = splitLinktext(linktext);
						const resolvedFile = path
							? plugin.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
							: activeFile;

						const decision = resolveOpenLinkBehavior({
							linktext,
							sourcePath,
							requestedNewLeaf: newLeaf,
							settings: plugin.settings,
							activeFilePath: activeFile?.path ?? null,
							resolvedTargetFilePath: resolvedFile?.path ?? null,
							isPlainModInteraction,
						});

						if (decision.action === "passthrough") {
							if (
								plugin.settings.enabled &&
								(decision.newLeaf === "tab" || decision.newLeaf === true) &&
								openViewState?.active === undefined
							) {
								const currentActiveLeaf = plugin.getActiveLeaf();
								const nextOpenViewState: OpenViewState = {
									...openViewState,
									active: plugin.settings.focusNewTab,
								};
								await oldOpenLinkText.call(this, linktext, sourcePath, decision.newLeaf, nextOpenViewState);
								const newActiveLeaf = plugin.getActiveLeaf();
								plugin.applyLeafFocus(newActiveLeaf, currentActiveLeaf, plugin.settings.focusNewTab);
								return;
							}
							await oldOpenLinkText.call(this, linktext, sourcePath, decision.newLeaf, openViewState);
							return;
						}

						if (decision.action === "reuse-or-open" && resolvedFile) {
							const existingLeaf = plugin.findExistingFileLeaf(decision.targetFilePath);
							if (existingLeaf) {
								const currentActiveLeaf = plugin.getActiveLeaf();
								const eState = subpath
									? { ...openViewState?.eState, subpath }
									: openViewState?.eState;
								await existingLeaf.openFile(resolvedFile, {
									...openViewState,
									active: decision.focus,
									eState,
								});
								plugin.applyLeafFocus(existingLeaf, currentActiveLeaf, decision.focus);
								return;
							}
						}

						// action === "open" (or fallback from reuse-or-open)
						const currentActiveLeaf = plugin.getActiveLeaf();
						const nextOpenViewState: OpenViewState = {
							...openViewState,
							active: decision.focus,
						};

						await oldOpenLinkText.call(this, linktext, sourcePath, decision.newLeaf, nextOpenViewState);
						const newActiveLeaf = plugin.getActiveLeaf();
						plugin.applyLeafFocus(newActiveLeaf, currentActiveLeaf, decision.focus);
					};
				},
			})
		);
	}

	/**
	 * Explicitly enforces whether the target leaf or the original source leaf receives active
	 * tab status and editor focus, preventing browser click events or internal default heuristics
	 * from subverting the user's focusNewTab preference.
	 */
	/** The currently active leaf, without using the deprecated `workspace.activeLeaf`. */
	getActiveLeaf(): WorkspaceLeaf | null {
		return this.app.workspace.getActiveViewOfType(View)?.leaf ?? null;
	}

	applyLeafFocus(
		targetLeaf: WorkspaceLeaf | null,
		previousActiveLeaf: WorkspaceLeaf | null,
		shouldFocusTarget: boolean
	): void {
		if (shouldFocusTarget) {
			if (targetLeaf) {
				this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
				// Ensure focus switches to the new tab even if the click event on the source editor attempts to reclaim focus
				window.setTimeout(() => {
					if (targetLeaf && targetLeaf.view) {
						this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
						if (isFocusableView(targetLeaf.view)) {
							targetLeaf.view.focus();
						}
					}
				}, 10);
			}
		} else if (previousActiveLeaf && previousActiveLeaf !== targetLeaf) {
			// Tab should open in background: preserve/restore previous active leaf
			this.app.workspace.setActiveLeaf(previousActiveLeaf, { focus: true });
			window.setTimeout(() => {
				if (previousActiveLeaf && previousActiveLeaf.view) {
					this.app.workspace.setActiveLeaf(previousActiveLeaf, { focus: true });
					if (isFocusableView(previousActiveLeaf.view)) {
						previousActiveLeaf.view.focus();
					}
				}
			}, 10);
		}
	}

	private findExistingFileLeaf(filePath: string): WorkspaceLeaf | null {
		let fallback: WorkspaceLeaf | null = null;
		let mainLeaf: WorkspaceLeaf | null = null;

		this.app.workspace.iterateAllLeaves((leaf) => {
			if (mainLeaf) {
				return;
			}
			const view = leaf.view;
			if (view instanceof FileView && view.file?.path === filePath) {
				const root = leaf.getRoot();
				const isMainOrWindow =
					root === this.app.workspace.rootSplit ||
					(typeof WorkspaceWindow !== "undefined" && root instanceof WorkspaceWindow);

				if (isMainOrWindow) {
					mainLeaf = leaf;
				} else if (!fallback) {
					fallback = leaf;
				}
			}
		});

		return mainLeaf ?? fallback;
	}
}

class LinksInNewTabsSettingTab extends PluginSettingTab {
	plugin: LinksInNewTabsPlugin;

	constructor(app: App, plugin: LinksInNewTabsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Declarative settings (Obsidian 1.13+), which also makes them show up in settings search. */
	getSettingDefinitions(): SettingDefinitionItem<keyof LinksInNewTabsSettings>[] {
		const modKeyName = Platform.isMacOS ? "Cmd" : "Ctrl";
		const targetOptions: Record<string, string> = { tab: "New tab", split: "Split right" };
		if (Platform.isDesktop) {
			targetOptions.window = "New window";
		}

		return [
			{
				type: "group",
				heading: "Link opening behavior",
				items: [
					{
						name: "Open links in new tab by default",
						desc: "When enabled, clicking internal links in notes, properties, backlinks, graph, or canvas opens them in a new tab instead of replacing the current tab.",
						control: { type: "toggle", key: "enabled", defaultValue: DEFAULT_SETTINGS.enabled },
					},
					{
						name: "Default target for opened links",
						desc: "Choose where links open by default when clicked.",
						control: {
							type: "dropdown",
							key: "defaultTarget",
							options: targetOptions,
							defaultValue: DEFAULT_SETTINGS.defaultTarget,
						},
					},
					{
						name: "Focus newly opened tab",
						desc: "Immediately switch to the new tab when a link is opened.",
						control: { type: "toggle", key: "focusNewTab", defaultValue: DEFAULT_SETTINGS.focusNewTab },
					},
					{
						name: "Keep same-note heading and block links in current tab",
						desc: "Links to headings or blocks inside the currently active note (e.g. [[#Section]]) will scroll the current tab instead of opening a duplicate tab.",
						control: {
							type: "toggle",
							key: "keepSameFileLinksInCurrentTab",
							defaultValue: DEFAULT_SETTINGS.keepSameFileLinksInCurrentTab,
						},
					},
					{
						name: "Reuse existing tab if note is already open",
						desc: "If the linked note is already open in another tab, switch to that tab instead of opening a duplicate tab.",
						control: {
							type: "toggle",
							key: "reuseExistingTab",
							defaultValue: DEFAULT_SETTINGS.reuseExistingTab,
						},
					},
					{
						name: `${modKeyName}+click opens in current tab`,
						desc: `Invert the modifier key behavior so holding ${modKeyName} while clicking a link opens it in the current tab.`,
						control: {
							type: "toggle",
							key: "invertModClick",
							defaultValue: DEFAULT_SETTINGS.invertModClick,
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof LinksInNewTabsSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings = { ...this.plugin.settings, [key]: value };
		await this.plugin.saveSettings();
	}

	/** Imperative fallback for Obsidian versions older than 1.13.0. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Link opening behavior").setHeading();

		new Setting(containerEl)
			.setName("Open links in new tab by default")
			.setDesc(
				"When enabled, clicking internal links in notes, properties, backlinks, graph, or canvas opens them in a new tab instead of replacing the current tab."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
					this.plugin.settings.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Default target for opened links")
			.setDesc("Choose where links open by default when clicked.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("tab", "New tab")
					.addOption("split", "Split right");

				if (Platform.isDesktop) {
					dropdown.addOption("window", "New window");
				}

				dropdown
					.setValue(this.plugin.settings.defaultTarget)
					.onChange(async (value) => {
						this.plugin.settings.defaultTarget = value as DefaultOpenTarget;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Focus newly opened tab")
			.setDesc("Immediately switch to the new tab when a link is opened.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.focusNewTab).onChange(async (value) => {
					this.plugin.settings.focusNewTab = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Keep same-note heading and block links in current tab")
			.setDesc(
				"Links to headings or blocks inside the currently active note (e.g. [[#Section]]) will scroll the current tab instead of opening a duplicate tab."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.keepSameFileLinksInCurrentTab)
					.onChange(async (value) => {
						this.plugin.settings.keepSameFileLinksInCurrentTab = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Reuse existing tab if note is already open")
			.setDesc(
				"If the linked note is already open in another tab, switch to that tab instead of opening a duplicate tab."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.reuseExistingTab).onChange(async (value) => {
					this.plugin.settings.reuseExistingTab = value;
					await this.plugin.saveSettings();
				})
			);

		const modKeyName = Platform.isMacOS ? "Cmd" : "Ctrl";
		new Setting(containerEl)
			.setName(`${modKeyName}+click opens in current tab`)
			.setDesc(
				`Invert the modifier key behavior so holding ${modKeyName} while clicking a link opens it in the current tab.`
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.invertModClick).onChange(async (value) => {
					this.plugin.settings.invertModClick = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
