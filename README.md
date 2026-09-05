# Roleplay Tools · 0.1.1

A shared panel for Wani's SillyTavern extensions. Several extensions can sit on one page, while other pages hold different sets. The extensions stay independent and keep processing messages with their own code.

**Character Thoughts**, **Relationship Memory Tracker**, **Context Tracker**, **Character Visual**, **Story Notes** and **Story Goals** are supported. By default Thoughts and Relations sit on **Live**, Visual gets a page of its own, and Notes and Goals share a third page. Context is pinned at the top, below the tabs, and stays visible on every page. Page contents and block order can be changed at any time.

The interface is English by default; Russian can be selected in the shell settings. Note that the default page names for Visual, Notes and Goals are supplied by those extensions and are currently Russian (`Персонаж`, `Сюжет`). Rename them in the settings, or wait for the extensions to ship neutral names.

## Installing from GitHub

1. Open **Extensions → Install extension** and paste `https://github.com/Wanichka/sillytavern-roleplay-tools`. The branch field can stay empty — the default branch is `main`.
2. Update the installed extensions from the table to the listed versions or newer. You only need the ones you actually use. If any are still on a test branch, switch them to `main` first, then update.
3. Fully reload the Tavern page.

| Extension | Repository | Stable version with integration |
| --- | --- | --- |
| Roleplay Tools | [sillytavern-roleplay-tools](https://github.com/Wanichka/sillytavern-roleplay-tools) | 0.1.1 |
| Character Thoughts | [sillytavern-character-thoughts](https://github.com/Wanichka/sillytavern-character-thoughts) | 1.2.1 |
| Relationship Memory Tracker | [sillytavern-relationship-memory-tracker](https://github.com/Wanichka/sillytavern-relationship-memory-tracker) | 2.4.1 |
| Context Tracker | [sillytavern-context-tracker](https://github.com/Wanichka/sillytavern-context-tracker) | 1.0.1 |
| Character Visual | [sillytavern-character-visual](https://github.com/Wanichka/sillytavern-character-visual) | 1.0.1 |
| Story Notes | [sillytavern-story-notes](https://github.com/Wanichka/sillytavern-story-notes) | 0.1.1 |
| Story Goals | [sillytavern-story-goals](https://github.com/Wanichka/sillytavern-story-goals) | 0.1.1 |

These instructions were checked against the SillyTavern 1.18.0 interface. Auto-update is disabled in the manifests; update the extensions with the usual button in Tavern.

## Using it

- **Window size:** drag a bottom corner to change width and height. Double-clicking it restores the default size. The minimum on desktop is 320 × 300 px; the maximum is bounded by the screen.
- **Position:** drag the Roleplay Tools header. The settings let you snap the window to the left or the right edge; snapping does not narrow the chat itself.
- **Block heights:** the divider between two blocks changes their proportions. The grip below the last block changes that block's height together with the window frame, leaving the top edge and the neighbouring block in place. The frame grows until it reaches the screen edge, after which the page scrolls. Both grips accept arrow keys, and double-clicking the bottom grip restores the page's automatic proportions. Sizes survive a reload.
- **Collapse / expand a block:** the buttons in a block's header leave only its header, or hand it the whole page for a moment. Pinned Context is unaffected.
- **Pages:** the settings button in the shell header creates, renames, reorders and deletes pages. Every block picks its page and its order there. Deleting a page moves its blocks to another page rather than discarding them.
- **Context:** it can be pinned so it shows on every page, or treated as an ordinary block living on one page. Its own settings stay in Tavern's extension panel.
- **Hiding the window:** the close button leaves a Roleplay Tools launcher behind. The extensions keep processing messages while it is hidden.
- **Separate windows:** clear **Dock extensions into one panel** and the original panels and buttons come back. Ticking it again collects them into the shell.
- **Language:** pick English or Russian in the settings. Page names you have already typed are never translated.

One instance of an extension takes one slot: a block can be moved but not duplicated across pages. On screens narrower than 600 px the shell takes up almost the whole screen and free resizing is disabled. On tablets wider than 600 px dragging and resizing both work.

The palette comes from the Tavern theme — background, text and accent colours. Corners, borders, headings and buttons follow the style of the other Wani extensions.

## Data and separate windows

Roleplay Tools stores **the layout only**, in `localStorage` under the key `wani_roleplay_tools_layout_v1`. It is shared across chats in this browser at this Tavern address and does not sync between devices. Clearing site data removes the layout.

Thoughts, profiles, avatars, relationship memory, token settings and prompts still belong to the original extensions. The integration does not change how they are stored and does not move any data into the shell.

To get separate windows back, clear **Dock extensions into one panel** in the shell settings. You can also disable Roleplay Tools in Tavern's manager and reload the page. The docked extensions keep working on their own; leave them on `main`.

## Testing

The browser test loads the real files of all six extensions. It covers parsing a test message, resizing the window and the block proportions, collapsing and expanding blocks, moving blocks between pages, pinning Context, persisting the layout, disabling and re-enabling the shell, updates arriving on a hidden page, load order, and behaviour when the shell is absent. It also checks note and goal drafts and saving, step execution, Visual's fields and macro, and writes to a real IndexedDB through localforage. Around every layout operation it compares data, settings, the number of event subscriptions and the number of prompt calls.

The bench locates elements by their **English** labels, since English is the default interface language; keep new checks in English too, so the bench does not depend on the language setting. Only Tavern's context API and server are stubbed. After any change, a short run in a real Tavern is still worth doing: open a chat → get a reply → switch pages → resize → reload → turn off docking.

Reproducing the automated check needs Node.js 22+, Playwright and localforage. Put the integration-ready repositories in sibling directories named `character-thoughts`, `relationship-memory-tracker`, `context-tracker`, `character-visual`, `story-notes`, `story-goals`. For any other layout, point `RPT_EXTENSIONS_DIR` at the parent directory.

```sh
npm install --no-save playwright localforage
npx playwright install chromium
node tests/browser.mjs
```

## Adding another extension

The API is published as `window.WaniRoleplayTools`, version 1. The `wani-roleplay-tools:ready` event lets an extension connect when the shell loads later than it does. Each tracker repository ships an example adapter as `roleplay-tools-adapter.js`.

```js
window.WaniRoleplayTools?.register({
    id: 'example',
    title: 'Example',
    defaultPage: { id: 'example-page', name: 'Example' }, // first connection only
    element: existingPanel,
    launcher: existingButton,
    controls: existingHeader,
    minHeight: 160,
    display: 'flex',
    onMount() {},
    onShow() {},
    onRelease() {},
});
```

Pass **the original DOM element**, not a clone. While docked it carries `data-rpt-docked="true"`, and the extension's own resize and drag handlers must skip that mode. Styles for the docked mode should be scoped to `#rpt-shell` and `[data-rpt-docked]`. `controls` marks where the collapse and expand buttons go; `launcher` is the extension's own optional button. `onShow` is meant for refreshing what is displayed, not for re-running a parser or subscribing to events again.

`open(id)` opens a block's page and `unregister(id)` returns a block to where it came from. Checking placement needs no API at all: a docked element carries `data-rpt-docked="true"` (the adapter exposes this as `isRoleplayDocked`). `destroy()` returns every element and removes the shell; for ordinary use, the separate-windows setting or disabling the extension in Tavern is enough.

The shell cannot dock an arbitrary third-party extension on its own: each one needs a small adapter that accounts for its DOM, styles and handlers.
