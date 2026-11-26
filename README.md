# Better Line Breaks

**中文说明 → [README.zh-CN.md](README.zh-CN.md)**

A Typora-like line-breaking plugin for [Obsidian](https://obsidian.md).

If you moved from Typora to Obsidian, you probably hit the same three annoyances: one `Enter` does not start a real paragraph, `Shift+Enter` does not feel like a soft break, and `Backspace` at the start of a paragraph does not jump cleanly to the end of the previous one. This plugin fixes those, and tidies up pasted plain text too.

## Before you start

**Turn off “Strict line breaks”** (Settings → Editor → Strict line breaks).

It is ON by default in Obsidian. With it on, the single `\n` written by `Shift+Enter` is rendered as a space, so soft breaks collapse into the paragraph. The plugin shows a one-time reminder if it detects the setting is on.

## What it does

| Action | Behavior |
|---|---|
| **Enter** | Always inserts exactly two newlines — a real paragraph break |
| **Shift+Enter** | Inserts exactly one newline — a soft break inside the paragraph |
| **Backspace at paragraph start** | Looks at how many newlines precede the cursor: **even** → removes two, **odd** → removes one. The cursor always lands on a normal text line |
| **Paste** | Plain text that is only hard-wrapped (single newlines, no blank lines, no Markdown syntax) is split into paragraphs. Markdown-looking text is pasted unchanged |
| **Blank lines** | Rendered as a short paragraph gap instead of a full empty line |

Every behavior has its own toggle. Lists, blockquotes, tables, fenced code blocks, math blocks and YAML frontmatter are never touched — they keep Obsidian's native behavior.

## Install

### From the community plugins list

Settings → Community plugins → Browse → search for **Better Line Breaks** (or **typora**).

### Manually

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/qianhanglv/obsidian-better-line-breaks/releases/latest) and put them in:

```
<vault>/.obsidian/plugins/typora-flow/
```

Then enable the plugin in Settings → Community plugins.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Enter / Shift+Enter 换行 | On | Enter = paragraph break, Shift+Enter = soft break |
| 段首退格 / Smart Backspace | On | Step over blank lines as described above |
| 粘贴时整理段落 / Reformat pasted text | On | Turn hard-wrapped plain text into paragraphs |

A single paste can bypass the cleanup: run **“Paste as-is”** from the command palette.

## Details worth knowing

- **IME safe.** While a Chinese/Japanese/Korean input method is composing, Enter is left alone, so choosing a candidate with Enter still works.
- **Backspace parities.** With two newlines before the cursor, Backspace removes both (the paragraphs merge). With three, it removes one and leaves a standard two-newline break, so a single keystroke never collapses more than one paragraph break.
- **Soft breaks are real newlines.** `Shift+Enter` writes one `\n` into the file. A soft break is still a real line in the editor — the plugin cannot make it disappear, it only makes *blank* lines visually short.
- **Paragraph gap.** Adjust `--tf-paragraph-gap` in `styles.css` (default `0.9em`).

## Known limits

- Lists, blockquotes, tables, code blocks and math blocks are intentionally left alone.
- Pasting does not unwrap text that already contains blank lines; that is treated as intentional structure.
- Desktop only for now.

## Development

No build step. `main.js` is plain CommonJS and is the source.

```sh
node _test.cjs      # 47 assertions, no dependencies
```

## License

MIT
