import type { PaneType } from "obsidian";

export type DefaultOpenTarget = "tab" | "split" | "window";

export interface LinksInNewTabsSettings {
	/** Master toggle: open internal links in a new tab (or target) by default. */
	enabled: boolean;
	/** Default target pane type when opening a link ("tab", "split", or "window"). */
	defaultTarget: DefaultOpenTarget;
	/** Keep same-note heading/block anchor links (e.g. [[#Heading]]) in the current tab. */
	keepSameFileLinksInCurrentTab: boolean;
	/** If the destination note is already open in an existing tab, focus that tab instead of opening a duplicate. */
	reuseExistingTab: boolean;
	/** Invert Cmd/Ctrl+Click (Mod+Click) so holding Mod opens the link in the current tab. */
	invertModClick: boolean;
	/** Always focus and activate the newly opened tab. */
	focusNewTab: boolean;
}

export const DEFAULT_SETTINGS: LinksInNewTabsSettings = {
	enabled: true,
	defaultTarget: "tab",
	keepSameFileLinksInCurrentTab: true,
	reuseExistingTab: false,
	invertModClick: true,
	focusNewTab: true,
};

export interface LinkOpenContext {
	linktext: string;
	sourcePath: string;
	requestedNewLeaf: PaneType | boolean | undefined;
	settings: LinksInNewTabsSettings;
	activeFilePath: string | null;
	resolvedTargetFilePath: string | null;
	isPlainModInteraction: boolean;
}

export type LinkOpenDecision =
	| {
			action: "passthrough";
			newLeaf: PaneType | boolean | undefined;
	  }
	| {
			action: "open";
			newLeaf: PaneType | boolean;
			focus: boolean;
	  }
	| {
			action: "reuse-or-open";
			newLeaf: PaneType | boolean;
			targetFilePath: string;
			focus: boolean;
	  };

/**
 * Checks whether a link text starts with an external URI scheme (e.g. https://, http://, mailto:).
 */
export function isExternalUri(linktext: string): boolean {
	return /^(?:https?|mailto|ftp|app|obsidian):/i.test(linktext.trim());
}

/**
 * Splits an Obsidian linktext into `{ path, subpath }` without requiring a live Obsidian instance.
 * Strips display aliases (e.g. `[[Path#Heading|Alias]]`).
 */
export function splitLinktext(linktext: string): { path: string; subpath: string } {
	const pipeIndex = linktext.indexOf("|");
	const clean = pipeIndex === -1 ? linktext : linktext.slice(0, pipeIndex);
	const hashIndex = clean.indexOf("#");
	if (hashIndex === -1) {
		return { path: clean.trim(), subpath: "" };
	}
	return {
		path: clean.slice(0, hashIndex).trim(),
		subpath: clean.slice(hashIndex),
	};
}

/**
 * Pure decision function determining how `workspace.openLinkText` should route a link.
 */
export function resolveOpenLinkBehavior(ctx: LinkOpenContext): LinkOpenDecision {
	const {
		linktext,
		requestedNewLeaf,
		settings,
		activeFilePath,
		resolvedTargetFilePath,
		isPlainModInteraction,
	} = ctx;

	if (!settings.enabled) {
		return {
			action: "passthrough",
			newLeaf: requestedNewLeaf,
		};
	}

	// Always pass through external URI schemes (e.g. https://, mailto:)
	if (isExternalUri(linktext)) {
		return {
			action: "passthrough",
			newLeaf: requestedNewLeaf,
		};
	}

	// Always preserve explicit split or window requests
	if (requestedNewLeaf === "split" || requestedNewLeaf === "window") {
		return {
			action: "passthrough",
			newLeaf: requestedNewLeaf,
		};
	}

	// If Obsidian passed "tab" or `true` (e.g. from Cmd/Ctrl+Click or context menu "Open in new tab")
	if (requestedNewLeaf === "tab" || requestedNewLeaf === true) {
		if (settings.invertModClick && isPlainModInteraction) {
			return {
				action: "open",
				newLeaf: false,
				focus: true,
			};
		}
		return {
			action: "passthrough",
			newLeaf: requestedNewLeaf,
		};
	}

	// Otherwise, `requestedNewLeaf` is `false` or `undefined` (default unmodified click / follow-link command)
	const { path, subpath } = splitLinktext(linktext);

	if (settings.keepSameFileLinksInCurrentTab) {
		const isPureSubpath = path === "" && subpath.startsWith("#");
		const isSameActiveFile =
			resolvedTargetFilePath !== null &&
			activeFilePath !== null &&
			resolvedTargetFilePath === activeFilePath;

		if (isPureSubpath || isSameActiveFile) {
			return {
				action: "open",
				newLeaf: false,
				focus: true,
			};
		}
	}

	if (settings.reuseExistingTab && resolvedTargetFilePath) {
		return {
			action: "reuse-or-open",
			newLeaf: settings.defaultTarget,
			targetFilePath: resolvedTargetFilePath,
			focus: settings.focusNewTab,
		};
	}

	return {
		action: "open",
		newLeaf: settings.defaultTarget,
		focus: settings.focusNewTab,
	};
}
