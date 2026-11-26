"use strict";
/**
 * 本地冒烟测试（不参与插件运行，可删）。
 * 用法：node _test.cjs
 */

const Module = require("module");
const path = require("path");

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Plugin: class {
        constructor() {
          this.app = { workspace: { getActiveViewOfType: () => null } };
        }
        registerDomEvent() {}
      },
      MarkdownView: class {},
      PluginSettingTab: class {
        constructor(app, plugin) {
          this.app = app;
          this.plugin = plugin;
        }
      },
      Setting: class {
        setName() {
          return this;
        }
        setDesc() {
          return this;
        }
        addToggle() {
          return this;
        }
      },
      Notice: class {},
    };
  }
  return origLoad.apply(this, arguments);
};

const PluginClass = require(path.join(__dirname, "main.js"));

/* ---------- 极简的假编辑器 ---------- */
class FakeEditor {
  constructor(text) {
    this.lines = text.split("\n");
    this.cur = { line: 0, ch: 0 };
    this.sel = null;
  }
  lineCount() {
    return this.lines.length;
  }
  getLine(i) {
    return i >= 0 && i < this.lines.length ? this.lines[i] : "";
  }
  getCursor() {
    return { ...this.cur };
  }
  setCursor(p) {
    this.cur = { line: p.line, ch: p.ch };
  }
  somethingSelected() {
    return !!this.sel;
  }
  listSelections() {
    return [{ anchor: this.cur, head: this.cur }];
  }
  _off(p) {
    let n = 0;
    for (let i = 0; i < p.line; i++) n += this.lines[i].length + 1;
    return n + p.ch;
  }
  replaceRange(text, from, to) {
    if (!to) {
      to = from;
      from = this.cur;
    }
    const s = this.lines.join("\n");
    const a = this._off(from);
    const b = this._off(to);
    const ns = s.slice(0, a) + text + s.slice(b);
    this.lines = ns.split("\n");
  }
  replaceSelection(text) {
    if (!this.sel) return this.replaceRange(text, this.cur);
    const s = this.lines.join("\n");
    const a = Math.min(this._off(this.sel.from), this._off(this.sel.to));
    const b = Math.max(this._off(this.sel.from), this._off(this.sel.to));
    this.lines = (s.slice(0, a) + text + s.slice(b)).split("\n");
    this.sel = null;
  }
  text() {
    return this.lines.join("\n");
  }
}

const p = new PluginClass();

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
  }
}

function at(ed, line, ch) {
  ed.setCursor({ line, ch });
  return ed;
}

console.log("\n[Enter]");
let e = at(new FakeEditor("第一段"), 0, 3);
p.insertParagraphBreak(e);
check("段尾回车 → 空行分隔", e.text(), "第一段\n\n");

e = at(new FakeEditor("第一段\n\n第二段"), 1, 0);
p.insertParagraphBreak(e);
check("空行上回车也是两个换行", e.text(), "第一段\n\n\n\n第二段");

e = at(new FakeEditor("第一段\n\n第二段"), 2, 3);
p.insertParagraphBreak(e);
check("行中回车切开", e.text(), "第一段\n\n第二段\n\n");

e = at(new FakeEditor("- 列表项"), 0, 5);
check("列表里交还默认", p.insertParagraphBreak(e), false);

e = at(new FakeEditor("> 引用"), 0, 4);
check("引用里交还默认", p.insertParagraphBreak(e), false);

e = at(new FakeEditor("```js\nconst a = 1;\n```"), 1, 10);
check("代码块里交还默认", p.insertParagraphBreak(e), false);

e = at(new FakeEditor("| a | b |\n| - | - |"), 0, 3);
check("表格里交还默认", p.insertParagraphBreak(e), false);

e = at(new FakeEditor("---\ntags: x\n---\n正文"), 3, 1);
check("属性区下方正常", p.insertParagraphBreak(e), true);

e = at(new FakeEditor("## "), 0, 3);
p.insertParagraphBreak(e);
check("空标题回车也插两个换行", e.text(), "## \n\n");

e = at(new FakeEditor("$$x\n\n"), 0, 1);
check("未闭合的 $$ 视为公式块 → 交还默认", p.insertParagraphBreak(e), false);

e = at(new FakeEditor("$$x$$ 说明"), 0, 2);
p.insertParagraphBreak(e);
check("单行 $$...$$ 不误判成公式块", e.text(), "$$\n\nx$$ 说明");

console.log("\n[Shift+Enter]");
e = at(new FakeEditor("正文"), 0, 2);
p.insertSoftBreak(e);
check("软换行只插一个换行", e.text(), "正文\n");

e = at(new FakeEditor("> 引用"), 0, 2);
check("引用里交还默认", p.insertSoftBreak(e), false);

e = at(new FakeEditor("```\ncode\n```"), 1, 4);
check("代码块里交还默认", p.insertSoftBreak(e), false);

console.log("\n[行首退格]");
e = at(new FakeEditor("第一段\n\n第二段"), 2, 0);
p.smartBackspace(e);
check("跨过一个空行合并", e.text(), "第一段第二段");
check("光标落到上一段末尾", JSON.stringify(e.cur), JSON.stringify({ line: 0, ch: 3 }));

e = at(new FakeEditor("第一段\n\n\n\n第二段"), 4, 0);
p.smartBackspace(e);
check("四个换行 → 只删两个", e.text(), "第一段\n\n第二段");

e = at(new FakeEditor("第一段\n\n\n第二段"), 3, 0);
p.smartBackspace(e);
check("奇数个换行(3) → 只删一个", e.text(), "第一段\n\n第二段");
check("光标上移一行,仍在正式行开头", JSON.stringify(e.cur), JSON.stringify({ line: 2, ch: 0 }));

e = at(new FakeEditor("第一段\n\n\n\n\n第二段"), 5, 0);
p.smartBackspace(e);
check("奇数个换行(5) → 只删一个", e.text(), "第一段\n\n\n\n第二段");

e = at(new FakeEditor("第一段\n\n\n\n第二段"), 4, 0);
p.smartBackspace(e);
check("偶数个换行(4) → 只删两个", e.text(), "第一段\n\n第二段");
check("偶数个换行(4) 后光标在正式行", JSON.stringify(e.cur), JSON.stringify({ line: 2, ch: 0 }));

e = at(new FakeEditor("第一段\n第二段"), 1, 0);
check("上一行非空 → 交还默认", p.smartBackspace(e), false);

e = at(new FakeEditor("```\ncode\n```\n正文"), 3, 0);
check("不吞代码围栏", p.smartBackspace(e), false);

e = at(new FakeEditor("---\ntags: x\n---\n正文"), 3, 0);
check("不吞属性区", p.smartBackspace(e), false);

e = at(new FakeEditor("| a | b |\n| - | - |\n\n正文"), 3, 0);
check("不吞表格", p.smartBackspace(e), false);

e = at(new FakeEditor("第一段\n\n第二段"), 0, 0);
check("文档首行不处理", p.smartBackspace(e), false);

e = at(new FakeEditor("第一段\n  \n第二段"), 2, 0);
p.smartBackspace(e);
check("空行里有空格也能清掉", e.text(), "第一段第二段");

console.log("\n[粘贴：识别]");
const { looksLikeMarkdown, normalizeParagraphs } = PluginClass._internals;

check("标题算 Markdown", looksLikeMarkdown("# 标题\n正文"), true);
check("列表算 Markdown", looksLikeMarkdown("正文\n- 一项\n- 二项"), true);
check("引用算 Markdown", looksLikeMarkdown("> 引用"), true);
check("代码块算 Markdown", looksLikeMarkdown("```js\ncode\n```"), true);
check("表格算 Markdown", looksLikeMarkdown("| a | b |\n| - | - |"), true);
check("粗体算 Markdown", looksLikeMarkdown("这是**重点**内容"), true);
check("链接算 Markdown", looksLikeMarkdown("见[文档](https://a.com)"), true);
check("双链算 Markdown", looksLikeMarkdown("参见[[另一篇]]"), true);
check("行内代码算 Markdown", looksLikeMarkdown("执行 `npm i` 即可"), true);
check("公式算 Markdown", looksLikeMarkdown("结果为 $x^2$"), true);
check("纯中文散文不算 Markdown", looksLikeMarkdown("第一行\n第二行\n第三行"), false);
check("英文散文不算 Markdown", looksLikeMarkdown("Hello world\nThis is a test"), false);

console.log("\n[粘贴：整理]");
check(
  "无空行 → 每行成段",
  normalizeParagraphs("第一行\n第二行\n第三行"),
  "第一行\n\n第二行\n\n第三行"
);
check(
  "已有空行 → 原样",
  normalizeParagraphs("第一段第一行\n第一段第二行\n\n第二段"),
  "第一段第一行\n第一段第二行\n\n第二段"
);
check("单行 → 原样", normalizeParagraphs("只有一行"), "只有一行");
check("CRLF 统一", normalizeParagraphs("甲\r\n乙"), "甲\n\n乙");
check("行尾空格清掉", normalizeParagraphs("甲  \n乙   "), "甲\n\n乙");
check("末尾换行不产生空段", normalizeParagraphs("甲\n乙\n"), "甲\n\n乙");
check(
  "中间的空行不重复补",
  normalizeParagraphs("甲\n乙\n\n丙"),
  "甲\n乙\n\n丙"
);

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : 0);
