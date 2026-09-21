# 轻阅 · QingYue

**给本地文档一个舒服的阅读空间。**

Windows 上的免安装 Markdown 与文本阅读编辑器：写作时左右分栏，阅读时收起编辑栏。无需账号，日常阅读编辑可离线使用；提供完整版和 Lite 轻量版。

Portable, offline Markdown & text reader/editor for Windows — split-pane editing, focused reading, and a Lite edition.

[English](README.en.md) · [立即下载](#下载) · [查看演示](#看它如何工作) · [反馈问题](https://github.com/HeYun0576/qingyue/issues)

![轻阅完整版：左侧真实文件夹树，中间 Markdown 编辑，右侧实时阅读预览](docs/media/split-view.png)

*完整版 1.3.3 实际界面，使用仓库内的公开示例文档。点击图片可查看原图。*

## 下载

| 版本 | 极速便携 ZIP（推荐） | 单文件便携 EXE |
| --- | --- | --- |
| 完整版 1.3.4 | [下载 ZIP](https://github.com/HeYun0576/qingyue/releases/download/v1.3.4/QingYue-1.3.4-Fast-Portable-x64.zip) | [下载 EXE](https://github.com/HeYun0576/qingyue/releases/download/v1.3.4/QingYue-Markdown-1.3.4-Portable-x64.exe) |
| 轻量版 0.1.2 | [下载 ZIP](https://github.com/HeYun0576/qingyue/releases/download/lite-v0.1.2/QingYue-Lite-0.1.2-Fast-Portable-x64.zip) | [下载 EXE](https://github.com/HeYun0576/qingyue/releases/download/lite-v0.1.2/QingYue-Lite-0.1.2-Portable-x64.exe) |

两种形式均免安装，推荐将 ZIP 解压到固定目录后运行其中的 EXE。轻量版不含 Word/Excel 等重型功能，但仍携带 Electron 运行环境。

[全部发布版本](https://github.com/HeYun0576/qingyue/releases) · [历史归档说明与校验值](releases/README.md)。历史 1.0.0～1.3.2 只有原始发布包，没有原始源码快照；不会将新版源码作为旧版源码提供。

## 看它如何工作

**分栏编辑 → 阅读模式 → 目录跳转 → 缩放 → 切换主题。**

![轻阅真实界面演示：输入 Markdown 后实时预览，切换阅读模式、使用目录、放大正文与切换深色主题](docs/media/qingyue-demo.gif)

*真实交互录制，停顿经过调整，不作为启动速度测试。静态截图见下方；示例文件位于 [examples/演示文档](examples/演示文档)。*

### 只看正文，也能方便地定位

阅读模式隐藏编辑区，目录在左侧独立显示。支持阅读缩放、整页翻阅、书签和批注，长文档可以按自己的节奏阅读。

![轻阅阅读模式：左侧目录与正文分开显示，不遮挡内容](docs/media/reading-outline.png)

### 白天、夜晚，换一种阅读氛围

提供明亮、深色、护眼、纸张与跟随系统主题，可调整阅读字号和行宽。Markdown 支持表格、代码高亮、公式与 Mermaid 图表。

![轻阅深色阅读主题与 Mermaid 流程图](docs/media/dark-mode.png)

<details>
<summary>查看 Lite 轻量版的纸张阅读主题</summary>

![轻阅 Lite 0.1.1：纸张阅读主题与左侧目录](docs/media/lite-reading.png)

</details>

## 选哪个版本？

| 你需要的功能 | 完整版 1.3.4 | Lite 0.1.2 |
| --- | --- | --- |
| Markdown / TXT / JSON / 代码文件阅读编辑 | ✓ | ✓ |
| 标签、目录、搜索、书签批注、主题、朗读 | ✓ | ✓ |
| PDF / HTML / Markdown / TXT / RTF 导出 | ✓ | ✓ |
| Markdown 公式与 Mermaid 图表 | ✓ | ✓ |
| Word / Excel 轻量编辑、DOCX 导出 | ✓ | — |
| 白板、思维导图编辑、图片工具、对比与校验 | ✓ | — |
| 编辑器 | Monaco，带 IDE 语言服务 | 精简文本编辑器 |

只需要阅读与写作，先试 Lite；需要 Office 或更多工具，再选完整版。**Lite 减少的是功能与依赖，仍包含 Electron，并非几 MB 的原生程序。** Office 与大文件支持有边界，详见下方说明。

如果轻阅对你有帮助，欢迎给项目一个 Star，或通过 [Issue](https://github.com/HeYun0576/qingyue/issues) 告诉我们哪里还可以做得更好。

## 1.3.4 与 Lite 0.1.2

完整版 1.3.4 与 Lite 0.1.2 新增可拖拽目录宽度和完整工作区恢复；修复 Lite 单文件便携版的 Windows 文件关联，并补齐默认应用能力注册。安装版支持识别原安装目录、覆盖升级和 blockmap 增量下载。

默认恢复退出前的标签页、当前文档、阅读布局、文件夹、目录开关与宽度、滚动位置和窗口状态。设置中仍可改为空白启动或新建空白文档，并可关闭文件夹记忆。历史未保存文档不会被自动写回原文件。

Lite 0.1.2 保留 Markdown、TXT、JSON/YAML 和代码文件的文本阅读编辑、目录、标签、书签批注、朗读、搜索、主题和 PDF/HTML/MD/TXT/RTF 导出；不含 Word/Excel、白板、思维导图编辑器、图片编辑、对比、结构校验和格式化。使用精简原生文本编辑器，不带 Monaco 的 IDE 语法服务/代码补全。Markdown 预览仍有代码高亮、公式和 Mermaid 图表，图表模块遇到相应内容才加载。单个文本文件上限 32 MB，8 MB 以上关闭预览。

完整版使用 `QingYue-Data`，轻量版使用 `QingYueLite-Data`，应用名、程序文件名和注册关联标识独立。两版可以共存，Windows 的默认打开程序由用户选择。

更多说明见 [1.3.4 更新说明](RELEASE-1.3.4.md)。

## 完整版已实现

<details>
<summary>展开完整功能清单</summary>

- Markdown 左侧编辑、右侧实时预览
- 编辑 / 分栏 / 阅读三种布局
- F11 系统级全屏阅读，Esc 一键退出
- 阅读与全屏阅读支持 60%–250% 缩放，支持 Ctrl+滚轮、Ctrl++、Ctrl+-、Ctrl+0
- 阅读与全屏阅读支持 Left/Right、PageUp/PageDown、Space/Shift+Space 整页翻阅；Up/Down 保持小幅滚动
- 左侧滚动目录，点击标题时同步定位预览和 Markdown 编辑行
- CommonMark、表格、任务清单、脚注、数学公式、代码高亮、本地相对图片
- Monaco Editor 代码编辑体验，支持 JSON、JavaScript、TypeScript、Python、YAML、HTML、CSS、C/C++、Java、Go、Rust、SQL、Shell 等
- JSON 格式化、查找替换、撤销重做及 Monaco 内置编辑能力
- 多标签页；退出时保存会话，下次启动可选择恢复上次打开的文件、光标和阅读位置
- 未保存内容自动恢复，按文档保留历史快照，可从“历史”面板恢复为新标签
- 可打开固定文件夹树且不遮挡编辑区；按文件名或文本、Word、Excel 内容全局搜索；批量替换前自动写入 `.qingyue-backup` 备份
- Markdown 导出为带主题版式的 HTML、PDF、可继续编辑的 DOCX，以及 Markdown 原文和纯文本 TXT
- 跟随系统、明亮、深色、护眼、纸张主题，以及阅读字号、行宽设置；面板、菜单和弹窗均完整适配
- Mermaid 图表、带列表跳转的行书签、可编辑定位的文档批注和阅读进度条
- Word 阅读支持独立上下滚动和 60%–250% 缩放
- 系统语音朗读，支持选择 Windows 已安装语音、调节语速/音调/音量，以及拖动进度从当前可见段落或编辑光标处继续
- 标签页菜单支持关闭当前、关闭右侧和关闭全部，并提供简明内置使用帮助
- JSON / YAML 结构校验、可选 JSON Schema 校验；文本对比支持忽略空格/Tab、全量/仅差异、新增/删除/修改独立筛选、双栏行号和词级高亮
- 快捷键仅在轻阅窗口内生效，可在设置中自定义并自动检测重复；默认使用 Ctrl+Shift+B/M/D/E/L 等组合避开常见系统热键
- 本地离线白板（Excalidraw），支持自由绘制、形状、连线、便签、图片和 `.excalidraw` 保存
- 本地思维导图创建与编辑，支持轻阅 `.mindmap`、XMind、FreeMind、OPML 导入，以及 XMind 导出
- 常见图片打开、缩放、旋转、翻转、亮度/对比度编辑和副本保存；音频可直接播放
- Markdown 可插入图片、音频和其他附件，文件自动复制到文档同名 `.assets` 目录并写入相对链接
- 8 MB 以上自动切换轻量大文件模式，最高可按提示打开 256 MB 文本
- UTF-8、UTF-8 BOM、UTF-16 LE、GB18030 文本读取与原编码保存
- DOCX 语义化显示和文字、标题、列表、表格的轻量编辑
- XLSX 多工作表网格显示和单元格轻量编辑，保留原工作簿其余内容
- Office 文件首次保存强制使用副本名称，避免误覆盖复杂原件
- 从命令行、资源管理器“打开方式”和右键菜单打开文件
- 单实例文件转发、未保存修改保护、在文件夹中显示
- 注册表操作仅限当前用户，可在应用内完整移除

</details>

## 开发运行

```powershell
pnpm install
pnpm dev:app
```

## 生成便携版与安装版

```powershell
pnpm dist:portable
pnpm dist:installer
pnpm dist:lite:portable
pnpm dist:lite:installer
pnpm dist:fast
pnpm dist:lite:fast
```

便携版继续免安装；安装版使用 NSIS，支持选择安装目录、识别已有安装并在原目录覆盖升级。应用设置、自动恢复和历史版本放在独立数据目录，升级不会清空。

发布页可同时提供以下产物：

- `release/QingYue-1.3.4-Fast-Portable-x64.zip`：推荐。只需解压一次，之后直接运行 `QingYue.exe`，双击文件启动更快；
- `release/QingYue-Markdown-1.3.4-Portable-x64.exe`：单文件版，复制方便，但每次冷启动都需要先释放程序文件，速度会慢一些。
- `release/QingYue-Lite-0.1.2-Fast-Portable-x64.zip`：轻量版极速包，解压运行 `QingYueLite.exe`。
- `release/lite/QingYue-Lite-0.1.2-Portable-x64.exe`：轻量版单文件包。
- `release/QingYue-Markdown-1.3.4-Setup-x64.exe`：完整版安装包，支持应用内增量更新；
- `release/lite/QingYue-Lite-0.1.2-Setup-x64.exe`：轻量版安装包，使用独立更新通道。

便携版数据保存在程序旁：完整版使用 `QingYue-Data`，轻量版使用 `QingYueLite-Data`。安装版数据保存在当前用户的 AppData 中，程序覆盖更新与卸载默认都不会删除这些数据。移动便携程序后如曾注册文件关联，请在设置中先移除、再重新注册，使 Windows 指向新位置。

安装版在设置中由用户主动检查更新：优先依据 blockmap 下载差异块，差分不可用时回退到完整安装包。完整版使用 `latest.yml`，Lite 使用 `lite.yml`，不会互相升级。具体发布约束见 [更新与安装包说明](docs/UPDATES.md)。本地文档功能仍无需服务器、网络连接或首次下载。

## Office 轻量模式边界

- DOCX 以内容结构和可读性为主，不承诺复杂页眉页脚、文本框、批注、修订和精确分页的高保真还原；
- XLSX 支持前 500 行、100 列的轻量编辑；宏不执行，公式由 Excel 或其他完整表格软件重新计算；
- 轻阅首次保存 DOCX/XLSX 时默认创建“轻阅副本”，复杂原件建议继续保留。

## 文件关联说明

打开右上角设置，选择“注册文件关联”。轻阅会在当前用户注册表中：

1. 加入 Windows “打开方式”应用列表；
2. 为支持的文本扩展名加入名称仅为“轻阅”的右键菜单；
3. 注册便携 EXE 的真实路径。

Windows 10/11 为防止应用劫持默认程序，首次设为默认时仍需由用户在“打开方式”窗口勾选“始终使用此应用”。轻阅不会绕过这项系统保护，也不会强行覆盖已有默认应用。

## 安全与隐私

- 文档在本机读取、编辑和保存，无需云端账号；
- 仅当安装版用户主动点击“检查更新”时访问 GitHub Releases；便携版不会后台检查或覆盖自身；
- 文档中的远程图片、音频或外部链接可能产生网络访问，离线时这些远程内容可能不可用；
- Markdown 原生 HTML 默认禁用，并在显示前再次清理；
- 渲染进程启用上下文隔离、沙箱并关闭 Node.js 集成；
- 外部链接交给系统浏览器打开。

## 开源与参与

源码采用 [MIT License](LICENSE)。欢迎提交问题、改进建议和 Pull Request。

[可直接使用的中文介绍文案](docs/PROMOTION.zh-CN.md) · [截图与动图来源、复现方式](docs/media/README.md)
