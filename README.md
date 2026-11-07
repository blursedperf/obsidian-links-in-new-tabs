# Open Links in New Tab

An Obsidian plugin that causes internal links (`[[WikiLinks]]`, Markdown links, Properties links, Backlinks, Outgoing Links, Graph nodes, Canvas links, and `Follow link under cursor`) to open in a new tab by default instead of replacing the current tab.

## Features

- **Open links in a new tab by default**: Clicking any internal link opens it in a new tab (or optionally a right split or popout window).
- **Smart same-note heading and block links**: Anchor links within the currently active note (such as `[[#Heading]]` or `[[CurrentNote#Section]]`) scroll the current tab in place rather than opening a duplicate tab.
- **Optional tab reuse**: Switch to an already-open tab instead of opening a duplicate tab if the target note is already open anywhere in your workspace.
- **Cmd/Ctrl+click inversion**: Invert the modifier key behavior so holding `Cmd` (macOS) or `Ctrl` (Windows/Linux) while clicking a link opens it in the current tab, while context-menu *"Open in new tab"* continues to open in a new tab.
- **Multi-window support**: Seamlessly respects popout windows and multi-window desktop layouts.
- **Cooperative lifecycle**: Built with `monkey-around` to cooperate cleanly with other plugins hooking `workspace.openLinkText`, automatically restoring native behavior upon unload.

## Privacy & Security Disclosures

In accordance with Obsidian Developer Policies:

- **Zero network requests**: This plugin makes no network calls, communicates with no remote servers or APIs, and contains no external tracking or telemetry scripts.
- **100% offline & local**: All link resolution runs entirely in-memory within your local Obsidian vault.
- **No external file access**: This plugin never reads, creates, or modifies files outside of your local Obsidian vault directory.
- **No account or payment required**: Free and open-source under the MIT license.

## Settings

| Setting | Default | Description |
|---|---|---|
| **Open links in new tab by default** | `true` | Master toggle controlling default link opening behavior. |
| **Default target for opened links** | `New tab` | Target pane type for links (`New tab`, `Split right`, or `New window` on desktop). |
| **Focus newly opened tab** | `true` | Immediately switch focus to the new tab when a link is opened. |
| **Keep same-note heading and block links in current tab** | `true` | Prevent opening duplicate tabs when clicking links that resolve to the active file. |
| **Reuse existing tab if note is already open** | `false` | Focus an already-open tab for the destination note if one exists. |
| **Cmd/Ctrl+click opens in current tab** | `true` | Holding `Cmd` / `Ctrl` while clicking a link opens it in the current tab. |

## Commands

- `Open Links in New Tab: Toggle default link opening behavior` — Quick hotkey toggle to enable or disable the plugin.

## Installation

### Community Plugins Directory (Recommended)

1. Open Obsidian **Settings → Community plugins**.
2. Turn off **Restricted mode**.
3. Click **Browse** and search for `Open Links in New Tab`.
4. Click **Install**, then click **Enable**.

### Manual Installation

1. Download `main.js` and `manifest.json` from the latest [GitHub Release](https://github.com/blursedperf/obsidian-open-in-new-tab/releases).
2. Create a folder named `open-in-new-tab` inside your vault's `.obsidian/plugins/` directory.
3. Move `main.js` and `manifest.json` into `.obsidian/plugins/open-in-new-tab/`.
4. Reload Obsidian and enable **Open Links in New Tab** in **Settings → Community plugins**.

## Development

```bash
# Run unit tests
npm test

# Build production bundle
npm run build
```

## License

[MIT](LICENSE) © blursedperf
