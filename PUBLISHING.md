# 发布到 Obsidian 社区插件市场

这份文件是给你自己的操作清单，不需要随插件发布。

## 0. 占位符已填好

`manifest.json` 里的 `authorUrl` 已经是 `https://github.com/qianhanglv`。
如果以后改用户名，这里要跟着改——审核会看这个字段，指向不存在的页面会被打回。

## 1. 建仓库

仓库名：**`obsidian-better-line-breaks`**（`obsidian-` 前缀让人一眼看出是 Obsidian 插件；插件市场里显示的是 `name`，不是仓库名）。

本地路径：`~/Documents/Github/obsidian-better-line-breaks`

仓库根目录必须是这三个文件在顶层：

```
main.js
manifest.json
styles.css
```

其余（README、LICENSE、versions.json、_test.cjs、.gitignore）随便放。

### 用 GitHub Desktop 发布（推荐）

1. GitHub Desktop → **File → Add Local Repository**
2. 选 `~/Documents/Github/obsidian-better-line-breaks`
3. 左上 **Publish repository**
4. Name 填 `obsidian-better-line-breaks`，**取消勾选 "Keep this code private"**（插件仓库必须公开）
5. Publish

### 或者用命令行

```sh
cd ~/Documents/Github/obsidian-better-line-breaks
git remote add origin git@github.com:qianhanglv/obsidian-better-line-breaks.git
git push -u origin main
```

## 1.5 让 GitHub 也搜得到（重要）

仓库建好后做三件事，否则别人在 GitHub 搜 `typora obsidian` 找不到你：

**① 仓库 Description**

```
Typora-like line breaking for Obsidian — Enter / Shift+Enter / smart Backspace / paste cleanup. 更好的换行体验。
```

**② Topics**（仓库页右上角 ⚙️ → Topics，或 `gh repo edit --add-topic`）

```
obsidian  obsidian-plugin  typora  markdown  line-breaks  note-taking  pkm
```

```sh
gh repo edit --add-topic obsidian --add-topic obsidian-plugin --add-topic typora \
  --add-topic markdown --add-topic line-breaks
```

**③ README 第一段**

英文 README 的开头已经写了 "A Typora-like line-breaking plugin for Obsidian"，这行是 GitHub 搜索权重最高的位置之一，别改成别的说法。

## 2. 打 release

**tag 必须与 `manifest.json` 的 `version` 完全一致**（这里是 `1.4.0`），并且 release 里要附带三个文件作为附件：

- `main.js`
- `manifest.json`
- `styles.css`

```sh
gh release create 1.4.0 main.js manifest.json styles.css \
  --title "1.4.0" --notes "Initial release."
```

## 3. 提 PR 上架

1. Fork `obsidianmd/obsidian-releases`
2. 编辑 `community-plugins.json`，在数组里加一项：

```json
{
  "id": "typora-flow",
  "name": "Better Line Breaks",
  "author": "qian",
  "description": "Typora-like line breaking for Obsidian: Enter starts a new paragraph, Shift+Enter inserts a soft break, Backspace at a paragraph start steps back cleanly, and pasted plain text is split into paragraphs. Typora 式换行体验。",
  "repo": "qianhanglv/obsidian-better-line-breaks"
}
```

3. 提 PR，标题写 `Add plugin: Better Line Breaks`

注意 `id` 必须和 `manifest.json` 里的 `id` 一致，**不能改**——改了等于换一个插件，已有用户的设置会丢。

## 4. 之后每次更新

1. 改 `manifest.json` 的 `version`
2. 在 `versions.json` 里加一行 `"新版本号": "minAppVersion"`
3. 重新打 tag + release（三个附件）
4. 不需要再提 PR

## 5. 审核常见退回原因

| 原因 | 说明 |
|---|---|
| `authorUrl` 无效 | 指向不存在的主页 |
| tag 与 version 不一致 | release 的 tag 必须严格等于 manifest 的 version |
| release 附件缺失 | 少 `main.js` / `manifest.json` / `styles.css` 任意一个 |
| 用了 `innerHTML` / 直接操作 `document.body` | 本插件已避开 |
| 定时器或事件监听未在 `onunload` 里清理 | 本插件用 `registerDomEvent`，已自动清理 |
| README 缺少使用说明 | 已具备 |

## 6. 上架之后值得做的

- **录一个 GIF 放进 README**（你说之后自己录）：按三次键——Enter / Shift+Enter / 段首退格，比文字有用十倍。文件名建议 `demo.gif`，README 第一段下面插 `![demo](demo.gif)`
- 在插件设置里补一条“与 paragraph-break 插件冲突”的提示：两个插件都会接管 Enter，同时开只会有一个生效
- 有人反馈“退格把两段合并了”时，先让他确认「段首退格」开关的状态，再让他贴出前后文本
