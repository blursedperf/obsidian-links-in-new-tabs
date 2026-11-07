import assert from "node:assert";
import {
	DEFAULT_SETTINGS,
	OpenInNewTabSettings,
	isExternalUri,
	resolveOpenLinkBehavior,
	splitLinktext,
} from "../src/resolver";

function makeSettings(overrides: Partial<OpenInNewTabSettings> = {}): OpenInNewTabSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

console.log("Running obsidian-open-in-new-tab unit tests...");

// 1. splitLinktext tests
{
	assert.deepStrictEqual(splitLinktext("Folder/Note"), {
		path: "Folder/Note",
		subpath: "",
	});
	assert.deepStrictEqual(splitLinktext("Folder/Note#Heading 1"), {
		path: "Folder/Note",
		subpath: "#Heading 1",
	});
	assert.deepStrictEqual(splitLinktext("#LocalHeading"), {
		path: "",
		subpath: "#LocalHeading",
	});
	assert.deepStrictEqual(splitLinktext("Note#^block123"), {
		path: "Note",
		subpath: "#^block123",
	});
	assert.deepStrictEqual(splitLinktext("Note#Heading 1|Alias text"), {
		path: "Note",
		subpath: "#Heading 1",
	});
	assert.deepStrictEqual(splitLinktext("Note|Alias only"), {
		path: "Note",
		subpath: "",
	});
}

// 2. isExternalUri tests
{
	assert.strictEqual(isExternalUri("https://example.com"), true);
	assert.strictEqual(isExternalUri("http://obsidian.md/help"), true);
	assert.strictEqual(isExternalUri("mailto:someone@example.com"), true);
	assert.strictEqual(isExternalUri("obsidian://open?vault=test"), true);
	assert.strictEqual(isExternalUri("app://local/resource"), true);
	assert.strictEqual(isExternalUri("RegularNote"), false);
	assert.strictEqual(isExternalUri("Folder/Subfolder/Note.md"), false);
	assert.strictEqual(isExternalUri("#Heading"), false);
}

// 3. External URLs pass through untouched
{
	const decision = resolveOpenLinkBehavior({
		linktext: "https://obsidian.md",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings(),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: null,
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "passthrough",
		newLeaf: false,
	});
}

// 4. Default unmodified click opens in a new tab ("tab")
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings(),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: "tab",
		focus: true,
	});
}

// 5. Same-note pure subpath link (`[[#Heading]]`) stays in current tab
{
	const decision = resolveOpenLinkBehavior({
		linktext: "#Overview",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ keepSameFileLinksInCurrentTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "CurrentNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: false,
		focus: true,
	});
}

// 6. Same-note explicit subpath link (`[[CurrentNote#Overview]]`) stays in current tab
{
	const decision = resolveOpenLinkBehavior({
		linktext: "CurrentNote#Overview",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: undefined,
		settings: makeSettings({ keepSameFileLinksInCurrentTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "CurrentNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: false,
		focus: true,
	});
}

// 7. Same-note link to self (`[[CurrentNote]]`) stays in current tab
{
	const decision = resolveOpenLinkBehavior({
		linktext: "CurrentNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ keepSameFileLinksInCurrentTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "CurrentNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: false,
		focus: true,
	});
}

// 8. Subpath link to a DIFFERENT note (`[[OtherNote#Overview]]`) opens in a new tab
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote#Overview",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ keepSameFileLinksInCurrentTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: "tab",
		focus: true,
	});
}

// 9. Mod+Click inversion: when invertModClick is true and isPlainModInteraction is true, "tab" becomes false (current tab)
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: "tab",
		settings: makeSettings({ invertModClick: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: true,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: false,
		focus: true,
	});
}

// 10. Context menu "Open in new tab" (requestedNewLeaf === "tab" with isPlainModInteraction === false) passes through
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: "tab",
		settings: makeSettings({ invertModClick: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "passthrough",
		newLeaf: "tab",
	});
}

// 11. Explicit "split" and "window" requests always pass through untouched
{
	for (const paneType of ["split", "window"] as const) {
		const decision = resolveOpenLinkBehavior({
			linktext: "OtherNote",
			sourcePath: "CurrentNote.md",
			requestedNewLeaf: paneType,
			settings: makeSettings(),
			activeFilePath: "CurrentNote.md",
			resolvedTargetFilePath: "OtherNote.md",
			isPlainModInteraction: true,
		});
		assert.deepStrictEqual(decision, {
			action: "passthrough",
			newLeaf: paneType,
		});
	}
}

// 12. Reuse existing tab option returns "reuse-or-open" when target file exists
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote#Sec",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ reuseExistingTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "Folder/OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "reuse-or-open",
		newLeaf: "tab",
		targetFilePath: "Folder/OtherNote.md",
		focus: true,
	});
}

// 13. Reuse existing tab option falls back to "open" when target file does not yet exist
{
	const decision = resolveOpenLinkBehavior({
		linktext: "UncreatedNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ reuseExistingTab: true }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: null,
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: "tab",
		focus: true,
	});
}

// 14. Master toggle disabled passes through original requestedNewLeaf
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ enabled: false }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "passthrough",
		newLeaf: false,
	});
}

// 15. focusNewTab: false is respected
{
	const decision = resolveOpenLinkBehavior({
		linktext: "OtherNote",
		sourcePath: "CurrentNote.md",
		requestedNewLeaf: false,
		settings: makeSettings({ focusNewTab: false }),
		activeFilePath: "CurrentNote.md",
		resolvedTargetFilePath: "OtherNote.md",
		isPlainModInteraction: false,
	});
	assert.deepStrictEqual(decision, {
		action: "open",
		newLeaf: "tab",
		focus: false,
	});
}

console.log("All 15 test suites passed successfully!");
