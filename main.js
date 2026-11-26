"use strict";
/**
 * Typora Flow for Obsidian
 *
 * 1) Enter        → 完全换行：插入一个空行，光标落到新段落首行
 * 2) Shift+Enter  → 软换行：只插入一个换行符，仍属于同一段
 * 3) 行首退格     → 若上方是空行，一次退格跨过所有空行，光标落到上一段末尾
 * 4) 粘贴         → 纯文本硬折行自动拆成段；看似 Markdown 的原样不动（可在设置里关掉）
 *
 * 只依赖 Obsidian 的公开 API，不需要打包构建。
 */

const { Plugin, MarkdownView, PluginSettingTab, Setting, Notice } = require("obsidian");

/* ================= 可调参数 ================= */

// 软换行插入的字符。
// 想让它不受「严格换行」设置影响、在阅读视图里也独立成行，改成 "  \n"（行尾两个空格）。
const SOFT_BREAK = "\n";

const DEFAULT_SETTINGS = {
  warnStrictLineBreaks: true, // 检测到「严格换行」开启时提醒一次
  smartEnter: true, // Enter / Shift+Enter 换行逻辑
  smartBackspace: true, // 段首退格逻辑
  smartPaste: true, // 粘贴时整理段落
};

/* ================= 上下文判定 ================= */

const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;
const QUOTE_RE = /^\s*>/;
const EMPTY_HEADING_RE = /^\s*#{1,6}\s*$/;
// 这些行是"结构行"，退格时绝不能把它们和正文粘在一起
const STRUCTURAL_RE = /^(?:`{3,}|~{3,}|\$\$|---|\+\+\+|.*\|.*\|)$/;

function isBlank(s) {
  return !s || s.trim() === "";
}

function lineAt(editor, i) {
  if (i < 0 || i >= editor.lineCount()) return "";
  return editor.getLine(i) || "";
}

function inCodeBlock(editor, line) {
  let open = null;
  const last = Math.min(line, editor.lineCount() - 1);
  for (let i = 0; i <= last; i++) {
    const m = FENCE_RE.exec(lineAt(editor, i));
    if (!m) continue;
    const ch = m[1][0];
    if (open === null) open = ch;
    else if (open === ch) open = null;
  }
  return open !== null;
}

function inMathBlock(editor, line) {
  let open = false;
  const last = Math.min(line, editor.lineCount() - 1);
  for (let i = 0; i <= last; i++) {
    const t = lineAt(editor, i).trim();
    if (!t.startsWith("$$")) continue;
    // 同一行里还有第二个 $$（$$x$$）说明是行内/单行公式，不算块
    if (t.slice(2).includes("$$")) continue;
    open = !open;
  }
  return open;
}

function inTableRow(editor, line) {
  const t = lineAt(editor, line).trim();
  if (!t.includes("|")) return false;
  if (t.startsWith("|") || t.endsWith("|")) return true;
  return lineAt(editor, line - 1).includes("|") || lineAt(editor, line + 1).includes("|");
}

function inFrontmatter(editor, line) {
  if (lineAt(editor, 0).trim() !== "---") return false;
  const count = editor.lineCount();
  for (let i = 1; i < count; i++) {
    if (lineAt(editor, i).trim() === "---") return line <= i;
  }
  return false;
}

/* ================= 粘贴判定 ================= */

// 只要命中任意一条，就认为粘贴进来的是 Markdown，原样插入
const MD_SIGNS = [
  /^[ \t]{0,3}#{1,6}[ \t]/m, // # 标题
  /^[ \t]{0,3}(?:[-*+][ \t]|\d+[.)][ \t])/m, // 列表
  /^[ \t]{0,3}>/m, // 引用
  /^[ \t]{0,3}(?:`{3,}|~{3,})/m, // 代码块
  /^[ \t]*\|.*\|[ \t]*$/m, // 表格
  /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/m, // 分隔线
  /^---[ \t]*$/m, // frontmatter
  /!?\[\[[^\]\n]+\]\]/m, // 双链 / 嵌入
  /!?\[[^\]\n]*\]\([^)\n]*\)/m, // 链接 / 图片
  /`[^`\n]+`/m, // 行内代码
  /\*\*[^*\n]+\*\*/m, // 粗体
  /~~[^~\n]+~~/m, // 删除线
  /==[^=\n]+==/m, // 高亮
  /<[a-zA-Z][^>\n]*>/m, // HTML 标签
  /^[ \t]{0,3}\$\$[ \t]*$/m, // 公式块
  /\$\$[^$\n]+\$\$/m, // 行内公式（双 $）
  /\$[^$\n]{1,80}\$/m, // 行内公式（单 $）
];

function looksLikeMarkdown(text) {
  return MD_SIGNS.some((re) => re.test(text));
}

/**
 * 纯文本 → 段落
 * - 已经存在空行的：说明它自带段落结构，原样返回
 * - 只有单个换行的：按硬折行处理，每个换行都升级为段落分隔
 */
function normalizeParagraphs(raw) {
  const text = String(raw).replace(/\r\n?/g, "\n");
  if (/\n[ \t]*\n/.test(text)) return text; // 已有空行 → 不动

  const lines = text
    .split("\n")
    .map((s) => s.replace(/[ \t]+$/, ""))
    .filter((s) => s.trim() !== "");

  if (lines.length < 2) return text;
  return lines.join("\n\n");
}

/* ================= 插件本体 ================= */

class TyporaFlowPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    // capture 阶段先于 CodeMirror 自己的按键处理，接管成功后再放行事件
    this.registerDomEvent(document, "keydown", (evt) => this.onKeyDown(evt), true);
    this.registerDomEvent(document, "paste", (evt) => this.onPaste(evt), true);

    this.addSettingTab(new TyporaFlowSettingTab(this.app, this));
    this.warnIfStrictLineBreaks();

    this.addCommand({
      id: "paste-as-is",
      name: "原样粘贴 / Paste as-is（不整理段落）",
      editorCallback: async (editor) => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.replaceSelection(text);
        } catch (e) {
          new Notice("Typora Flow：读不到剪贴板内容");
        }
      },
    });
  }

  /**
   * 「严格换行」开着时，Shift+Enter 写的单个换行在阅读视图里会被当成空格，
   * 软换行的效果就没了。这里只提醒一次，不改用户的设置。
   */
  warnIfStrictLineBreaks() {
    if (!this.settings.warnStrictLineBreaks) return;
    let strict = false;
    try {
      strict = this.app.vault.getConfig("strictLineBreaks") === true;
    } catch (e) {
      return;
    }
    if (!strict) return;

    new Notice(
      "Better Line Breaks：检测到「严格换行」已开启。Shift+Enter 插入的软换行在阅读视图里会变成空格。" +
        "建议到 设置 → 编辑器 里关闭它。\n" +
        "Strict line breaks is ON, so soft breaks will render as spaces. Consider turning it off in Settings → Editor.",
      12000
    );
    this.settings.warnStrictLineBreaks = false;
    this.saveSettings();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** 拿到当前真正拥有焦点的 Markdown 编辑器 */
  getActiveEditor() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;

    const root =
      view.containerEl.querySelector(".markdown-source-view .cm-editor") ||
      view.containerEl.querySelector(".cm-editor");
    if (!root) return null;

    const doc = typeof activeDocument !== "undefined" ? activeDocument : document;
    const active = doc.activeElement;
    if (!active || !root.contains(active)) return null;

    return view.editor;
  }

  onKeyDown(evt) {
    if (evt.defaultPrevented) return;
    // 中文输入法正在组词/选词时一律放行，否则回车会被我们劫走
    if (evt.isComposing || evt.keyCode === 229) return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;

    const key = evt.key;
    if (key !== "Enter" && key !== "Backspace") return;

    const editor = this.getActiveEditor();
    if (!editor) return;
    if (editor.listSelections().length > 1) return; // 多光标交给 Obsidian 默认逻辑

    let handled = false;
    if (key === "Enter") {
      if (!this.settings.smartEnter) return;
      handled = evt.shiftKey
        ? this.insertSoftBreak(editor)
        : this.insertParagraphBreak(editor);
    } else if (!evt.shiftKey) {
      if (!this.settings.smartBackspace) return;
      handled = this.smartBackspace(editor);
    }

    if (!handled) return;
    evt.preventDefault();
    evt.stopPropagation();
  }

  /* ---------- 粘贴 ---------- */

  onPaste(evt) {
    if (evt.defaultPrevented) return;
    if (!this.settings.smartPaste) return;

    const editor = this.getActiveEditor();
    if (!editor) return;
    if (editor.listSelections().length > 1) return;

    const data = evt.clipboardData;
    if (!data) return;

    const text = data.getData("text/plain");
    if (!text || text.indexOf("\n") < 0) return; // 单行粘贴没什么可整理
    if (looksLikeMarkdown(text)) return; // 像 Markdown，原样插入

    const normalized = normalizeParagraphs(text);
    if (normalized === text) return;

    evt.preventDefault();
    evt.stopPropagation();
    editor.replaceSelection(normalized);
  }

  /* ---------- Enter：完全换行 ---------- */

  insertParagraphBreak(editor) {
    const cur = editor.getCursor("from");
    const ln = cur.line;
    const line = editor.getLine(ln) || "";

    // 代码块、公式块、表格里保留 Obsidian 原生行为
    if (inCodeBlock(editor, ln) || inMathBlock(editor, ln) || inTableRow(editor, ln)) {
      return false;
    }
    // 列表、引用交给 Obsidian 自己续行
    if (LIST_RE.test(line) || QUOTE_RE.test(line)) return false;
    if (inFrontmatter(editor, ln)) return false;

    // Enter 一律产生两个换行符（保证换行数恒为偶数，光标不落在窄行上）
    if (editor.somethingSelected()) {
      editor.replaceSelection("\n\n");
      return true;
    }

    editor.replaceRange("\n\n", cur);
    editor.setCursor({ line: ln + 2, ch: 0 });
    return true;
  }

  /* ---------- Shift+Enter：软换行 ---------- */

  insertSoftBreak(editor) {
    const cur = editor.getCursor("from");
    const ln = cur.line;
    const line = editor.getLine(ln) || "";

    if (inCodeBlock(editor, ln) || inMathBlock(editor, ln) || inTableRow(editor, ln)) {
      return false;
    }
    if (QUOTE_RE.test(line)) return false; // 引用里裸换行会掉出引用块

    if (editor.somethingSelected()) {
      editor.replaceSelection(SOFT_BREAK);
      return true;
    }

    editor.replaceRange(SOFT_BREAK, cur);
    editor.setCursor({ line: ln + 1, ch: 0 });
    return true;
  }

  /* ---------- 行首退格：跨过空行 ---------- */

  smartBackspace(editor) {
    if (editor.somethingSelected()) return false;

    const cur = editor.getCursor();
    if (cur.ch !== 0 || cur.line === 0) return false;

    // 上一行不是空行：这是段内的软换行合并，走 Obsidian 默认行为
    if (!isBlank(lineAt(editor, cur.line - 1))) return false;

    // 一路向上跳过所有空行，同时数出上方连续空行的个数
    let blanks = 0;
    let target = cur.line - 1;
    while (target >= 0 && isBlank(lineAt(editor, target))) {
      blanks++;
      target--;
    }
    if (target < 0) return false;

    const targetLine = editor.getLine(target) || "";

    // 别吃掉代码围栏、属性区或表格
    if (STRUCTURAL_RE.test(targetLine.trim())) return false;
    if (inCodeBlock(editor, target)) return false;
    if (inMathBlock(editor, target)) return false;
    if (inTableRow(editor, target)) return false;
    if (inFrontmatter(editor, target)) return false;

    // 光标前的连续换行数 = 上方连续空行数 + 1
    const newlines = blanks + 1;

    // 偶数 → 一次删 2 个换行（不是全删）
    // 奇数 → 只删 1 个换行，把计数补成偶数
    const k = newlines % 2 === 0 ? 2 : 1;
    const fromLine = cur.line - k;
    if (fromLine < 0) return false;

    const from = { line: fromLine, ch: (editor.getLine(fromLine) || "").length };
    editor.replaceRange("", from, cur); // 一步撤销
    editor.setCursor(from);
    return true;
  }
}

/* ================= 设置面板 ================= */

class TyporaFlowSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Better Line Breaks" });

    const addToggle = (name, desc, key) => {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          })
        );
    };

    addToggle(
      "Enter / Shift+Enter 换行",
      "Enter 插入空行（完全换行），Shift+Enter 只插入一个换行（软换行）。关掉即恢复 Obsidian 原生行为。" +
        "\n" +
        "Enter starts a new paragraph; Shift+Enter inserts a soft line break. Turn off to use Obsidian's default.",
      "smartEnter"
    );

    addToggle(
      "段首退格",
      "光标在段首且上方有空行时：前方连续换行为偶数 → 删掉两个换行；为奇数 → 只删一个，光标始终停在正文行上。" +
        "\n" +
        "Smart Backspace at the start of a paragraph: an even number of newlines removes two, an odd number removes one.",
      "smartBackspace"
    );

    addToggle(
      "粘贴时整理段落",
      "粘贴纯文本时，如果里面只有单个换行（硬折行），就把每个换行升级为段落分隔。" +
        "如果内容看起来是 Markdown，或本身已有空行，则原样插入。" +
        "\n" +
        "Reformats pasted plain text whose lines are hard-wrapped. Markdown-looking text and text with blank lines are pasted unchanged.",
      "smartPaste"
    );

    const tips = containerEl.createEl("p", { cls: "setting-item-description" });
    tips.setText(
      "只想对某一次粘贴绕开整理：命令面板执行「Better Line Breaks: 原样粘贴 / Paste as-is」。" +
        "To paste once without reformatting, run the \"Paste as-is\" command from the command palette."
    );
  }
}

/* 供本地测试使用，不影响插件运行 */
TyporaFlowPlugin._internals = { looksLikeMarkdown, normalizeParagraphs };

module.exports = TyporaFlowPlugin;
