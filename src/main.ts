import * as monaco from 'monaco-editor';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItFrontMatter from 'markdown-it-front-matter';
import markdownItKatex from 'markdown-it-katex';
import markdownItTaskLists from 'markdown-it-task-lists';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import './styles.css';
import { readStartupSettings, type StartupSettings } from './startup-policy';

if (!__LITE__) await import('./editor-workers');

type ViewMode = 'split' | 'edit' | 'preview';
type DestructiveChoice = 'save' | 'discard' | 'cancel';
type DocumentKind = 'text' | 'docx' | 'xlsx';
type ExcelChange = { sheetName: string; row: number; column: number; value: string; original: string };
type Annotation = { id: string; line: number; text: string; createdAt: number };

interface TabState {
  id: string;
  kind: DocumentKind;
  path: string | null;
  name: string;
  encoding: string;
  dirty: boolean;
  largeMode: boolean;
  model?: monaco.editor.ITextModel;
  docxHtml?: string;
  sheets?: ExcelSheetData[];
  excelChanges?: Map<string, ExcelChange>;
  activeSheetIndex: number;
  officeCopyRequired: boolean;
  view: ViewMode;
  previewScrollTop: number;
  cursorLine: number;
  cursorColumn: number;
  bookmarks: number[];
  annotations: Annotation[];
}

const svg = (path: string, viewBox = '0 0 24 24') => `<svg viewBox="${viewBox}" aria-hidden="true">${path}</svg>`;
const icons = {
  logo: svg('<rect x="1" y="1" width="22" height="22" rx="5.5" fill="#3370ff"/><path d="M7 4.8h7.5L18 8.3v11H7v-14.5Z" fill="#fff"/><path d="M14.4 4.8v3.7H18" fill="#dbe7ff"/><path d="M9.2 15.8v-4l1.7 1.8 1.7-1.8v4M14.5 13.8l1.3 1.4 1.3-1.4M15.8 11.5v3.5" fill="none" stroke="#245bdb" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>'),
  folder: svg('<path d="M3.5 6.5h6l2 2h9v9.8c0 1-.8 1.7-1.8 1.7H5.3c-1 0-1.8-.8-1.8-1.7V6.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3.5 9h17" stroke="currentColor" stroke-width="1.7"/>'),
  save: svg('<path d="M5 3.5h12l2 2v15H5v-17Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 3.5v6h8v-6M8 20.5v-7h8v7" fill="none" stroke="currentColor" stroke-width="1.7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  format: svg('<path d="M4 6h16M4 12h10M4 18h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m17 14 .7 1.7L19.5 17l-1.8.8L17 19.5l-.8-1.7-1.7-.8 1.7-.7L17 14Z" fill="currentColor"/>'),
  settings: svg('<path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 13.4a7.6 7.6 0 0 0 0-2.8l2-1.5-2-3.5-2.5 1a8 8 0 0 0-2.4-1.4L14.2 2h-4.4l-.4 3.2A8 8 0 0 0 7 6.6l-2.5-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2.8l-2 1.5 2 3.5 2.5-1a8 8 0 0 0 2.4 1.4l.4 3.2h4.4l.4-3.2a8 8 0 0 0 2.4-1.4l2.5 1 2-3.5-2.1-1.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
  split: svg('<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4v16" stroke="currentColor" stroke-width="1.6"/>'),
  edit: svg('<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m9 15 1.2-3.5 6-6 2.3 2.3-6 6L9 15Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  preview: svg('<path d="M2.8 12s3.2-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.2 5.5-9.2 5.5S2.8 12 2.8 12Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  fullscreen: svg('<path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  outline: svg('<path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  check: svg('<path d="m5 12.5 4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  info: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v6M12 7.5v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-shell" data-view="split">
    <header class="topbar">
      <div class="brand"><span class="brand-icon">${icons.logo}</span><span class="brand-name">${__LITE__ ? '轻阅 Lite' : '轻阅'}</span></div>
      <div class="document-title" id="document-title"><span id="filename">欢迎使用轻阅.md</span><span class="dirty-dot" id="dirty-dot"></span></div>
      <div class="top-actions">
        <button class="icon-button" id="open-button" title="打开（Ctrl+O）">${icons.folder}</button>
        <button class="icon-button" id="save-button" title="保存（Ctrl+S）">${icons.save}</button>
        <span class="toolbar-divider"></span>
        ${__LITE__ ? '' : `<button class="icon-button" id="format-button" title="格式化 JSON/JSONC、JS/TS、CSS、HTML、YAML（Shift+Alt+F）">${icons.format}</button>
        <button class="icon-button" id="validate-button" title="结构校验">${icons.check}</button>
        <button class="icon-button" id="diff-button" title="与其他文件对比">${icons.split}</button>`}
        <button class="icon-button" id="export-button" title="导出 Markdown"><i class="codicon codicon-export"></i></button>
        <button class="icon-button" id="insert-button" title="插入图片、音频或附件"><i class="codicon codicon-attach"></i></button>
        ${__LITE__ ? '' : '<button class="icon-button" id="creative-button" title="白板、思维导图与图片工具"><i class="codicon codicon-symbol-color"></i></button>'}
        <button class="icon-button" id="help-button" title="使用帮助"><i class="codicon codicon-question"></i></button>
        <button class="icon-button" id="settings-button" title="便携版与文件关联">${icons.settings}</button>
      </div>
    </header>
    <div class="tab-strip"><div class="document-tabs" id="document-tabs"></div><button class="new-tab" id="new-tab" title="新建标签">＋</button><button class="tab-menu-button" id="tab-menu-button" title="标签页管理"><i class="codicon codicon-ellipsis"></i></button><div class="tab-menu" id="tab-menu" hidden><button data-tab-action="close-current">关闭当前标签</button><button data-tab-action="close-right">关闭右侧标签</button><button data-tab-action="close-all">关闭全部标签</button></div></div>
    <nav class="viewbar">
      <div class="viewbar-left"><button class="text-button" id="project-button">${icons.folder}<span>文件夹</span></button><div class="view-tabs" role="tablist" aria-label="显示方式">
        <button data-mode="split" class="view-tab active">${icons.split}<span>分栏</span></button>
        <button data-mode="edit" class="view-tab">${icons.edit}<span>编辑</span></button>
        <button data-mode="preview" class="view-tab">${icons.preview}<span>阅读</span></button>
      </div></div>
      <div class="viewbar-right">
        <button class="text-button" id="bookmark-button" title="书签管理（Ctrl+Shift+B 快速添加）"><i class="codicon codicon-bookmark"></i><span>书签</span><b class="nav-count" id="bookmark-count" hidden>0</b></button>
        <button class="text-button" id="annotation-button" title="添加批注（Ctrl+Shift+M）"><i class="codicon codicon-comment-discussion"></i><span>批注</span><b class="nav-count" id="annotation-count" hidden>0</b></button>
        <button class="text-button" id="history-button" title="历史版本（Ctrl+Shift+H）">↶<span>历史</span></button>
        <button class="text-button" id="speech-button" title="朗读设置（Ctrl+Shift+L）"><i class="codicon codicon-unmute"></i><span>朗读</span></button>
        <button class="text-button" id="outline-button" title="文档目录（Ctrl+Shift+O）">${icons.outline}<span>目录</span></button>
        <button class="text-button primary-quiet" id="fullscreen-button">${icons.fullscreen}<span>全屏阅读</span><kbd>F11</kbd></button>
      </div>
    </nav>
    <main class="workspace">
      <section class="empty-workspace"><h1>${__LITE__ ? '轻阅 Lite' : '轻阅'}</h1><p>打开文档，安心阅读。也可以将文件拖到这里。</p><div><button class="button primary" id="empty-open">打开文件</button><button class="button ghost" id="empty-new">新建 Markdown</button><button class="button ghost" id="empty-recover">恢复上次标签</button></div></section>
      <aside class="project-panel" id="project-panel" aria-hidden="true">
        <div class="project-header"><strong id="project-name">文件夹</strong><button id="project-close">${icons.close}</button></div>
        <button class="open-folder-button" id="open-folder-button">${icons.folder} 打开文件夹</button>
        <div class="project-search"><input id="project-query" placeholder="搜索文件名或内容"><label><input id="project-case" type="checkbox"> 区分大小写 · ${__LITE__ ? '文本内容检索' : '支持文本 / Word / Excel'}</label><button id="project-search-button">搜索</button></div>
        <div class="project-replace"><input id="project-replacement" placeholder="替换为"><button id="project-replace-button">批量替换</button></div>
        <div class="project-results" id="project-results"></div>
        <div class="file-tree" id="file-tree"></div>
      </aside>
      <aside class="outline-panel" id="outline-panel" aria-hidden="true">
        <div class="outline-header"><div class="outline-title">文档目录</div><button class="outline-close" id="outline-close" aria-label="关闭目录">${icons.close}</button></div>
        <nav id="outline-list"></nav>
      </aside>
      <div class="outline-resizer" id="outline-resizer" role="separator" aria-label="调整目录宽度" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="520" tabindex="0" title="左右拖动调整目录宽度"></div>
      <section class="editor-pane" aria-label="文件编辑器"><div id="editor"></div></section>
      <div class="splitter" id="splitter" role="separator" aria-orientation="vertical"></div>
      <section class="preview-pane" aria-label="Markdown 预览">
        <div class="preview-scroll" id="preview-scroll"><article class="markdown-body" id="preview"></article></div>
      </section>
      <section class="office-pane" id="office-pane" aria-label="Office 轻量编辑器">
        <div class="office-notice" id="office-notice"></div>
        <div class="sheet-tabs" id="sheet-tabs"></div>
        <div class="office-scroll" id="office-scroll">
          <article class="word-editor" id="word-editor" contenteditable="true" spellcheck="true"></article>
          <div class="excel-editor" id="excel-editor"></div>
        </div>
      </section>
      <div class="reading-controls" id="reading-controls" aria-label="阅读缩放">
        <button id="zoom-out" title="缩小（Ctrl+-）">−</button><span id="zoom-label">100%</span><button id="zoom-in" title="放大（Ctrl++）">＋</button>
      </div>
      <div class="reading-progress"><span id="reading-progress-bar"></span></div>
      <div class="file-drop-overlay" id="file-drop-overlay" aria-hidden="true">
        <div class="file-drop-card"><i class="codicon codicon-cloud-upload"></i><strong>松开即可打开文件</strong><span>拖到 Markdown 编辑区可插入图片、音频或附件</span></div>
      </div>
      <button class="exit-fullscreen" id="exit-fullscreen">${icons.close}<span>退出全屏</span><kbd>Esc</kbd></button>
    </main>
    <footer class="statusbar">
      <div class="status-left"><span class="saved-state" id="saved-state">${icons.check} 已保存</span><button id="reveal-button" class="status-button" hidden>在文件夹中显示</button></div>
      <div class="status-right"><span id="cursor-status">第 1 行，第 1 列</span><span id="document-stats">0 字</span><span id="encoding-status">UTF-8</span><span id="language-status">Markdown</span></div>
    </footer>
    <div class="toast-region" id="toast-region" aria-live="polite"></div>
  <div class="modal-backdrop" id="confirm-modal" hidden>
    <section class="modal confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="modal-symbol warning">!</div><h2 id="confirm-title">保存更改？</h2><p id="confirm-message"></p>
      <div class="modal-actions"><button class="button ghost" data-choice="cancel">取消</button><button class="button danger-quiet" data-choice="discard">放弃更改</button><button class="button primary" data-choice="save">保存</button></div>
    </section>
  </div>
  <div class="modal-backdrop" id="settings-modal" hidden>
    <section class="modal settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button class="modal-close" id="settings-close" aria-label="关闭">${icons.close}</button>
      <div class="settings-heading"><div class="modal-symbol brand-symbol">${icons.logo}</div><div><h2 id="settings-title">轻阅设置</h2><p>便携版免安装；安装版支持原目录增量更新。</p></div></div>
      <div class="settings-row"><div><h3>资源管理器“打开方式”</h3><p id="association-description">正在检查注册状态…</p></div><button class="button primary" id="association-button">注册文件关联</button></div>
      <div class="extension-list"><span>Markdown</span><span>JSON / YAML</span>${__LITE__ ? '' : '<span>Word / Excel</span>'}<span>代码文件</span><span>TXT / LOG</span><span>CSV / 配置</span></div>
      <div class="settings-note">${icons.info}<p>注册只写入当前 Windows 用户，不需要管理员权限。BAT、CMD、PowerShell 等可执行脚本受安全保护，不会被轻阅注册或改变双击执行行为；仍可从轻阅内部打开编辑。</p></div>
      <div class="settings-footer"><button class="button ghost" id="default-apps-button">打开系统默认应用设置</button><span id="app-version"></span></div>
      <div class="settings-row update-settings-row"><div><h3>软件更新</h3><p id="update-description">正在读取更新方式…</p><div class="update-progress" id="update-progress" hidden><span></span></div></div><button class="button ghost" id="update-button">检查更新</button></div>
      <div class="appearance-settings">
        <label>阅读主题<select id="theme-select"><option value="system">跟随系统</option><option value="light">明亮</option><option value="dark">深色</option><option value="eye">护眼</option><option value="paper">纸张</option></select></label>
        <label>字号<input id="font-size-range" type="range" min="13" max="22" value="15"><span id="font-size-value">15px</span></label>
        <label>行宽<input id="line-width-range" type="range" min="640" max="1100" step="20" value="820"><span id="line-width-value">820px</span></label>
      </div>
      <div class="startup-settings">
        <h3>启动与打开</h3>
        <label>Markdown 默认模式<select id="default-view-select"><option value="preview">阅读</option><option value="edit">编辑</option><option value="split">分栏</option></select></label>
        <label>启动时<select id="startup-mode-select"><option value="restore">恢复上次状态（推荐）</option><option value="empty">全新打开（无文件）</option><option value="blank">新建空白 Markdown</option></select></label>
        <label class="checkbox-setting"><input type="checkbox" id="remember-folder-check"> 记住上次文件夹及打开 / 关闭状态</label>
        <p>默认恢复标签、当前文档、阅读位置、分栏比例、目录宽度及侧栏状态。双击文件时仍优先显示该文件。</p>
        <div><button class="button primary" id="save-startup-settings">保存设置</button><button class="button ghost" id="restore-previous-session">恢复上次标签</button><button class="button ghost" id="clear-project">关闭并忘记文件夹</button></div>
      </div>
      <div class="settings-row shortcut-settings-row"><div><h3>快捷键</h3><p>可修改应用内快捷键，避开系统、输入法或其他软件占用的组合。</p></div><button class="button ghost" id="shortcut-settings-button">自定义快捷键</button></div>
    </section>
  </div>
  <div class="modal-backdrop" id="utility-modal" hidden>
    <section class="modal utility-card" role="dialog" aria-modal="true"><button class="modal-close" id="utility-close">${icons.close}</button><h2 id="utility-title"></h2><div id="utility-content"></div></section>
  </div>
  </div>
`;

const appShell = document.querySelector<HTMLElement>('.app-shell')!;
const filenameEl = document.querySelector<HTMLElement>('#filename')!;
const dirtyDot = document.querySelector<HTMLElement>('#dirty-dot')!;
const savedState = document.querySelector<HTMLElement>('#saved-state')!;
const cursorStatus = document.querySelector<HTMLElement>('#cursor-status')!;
const documentStats = document.querySelector<HTMLElement>('#document-stats')!;
const encodingStatus = document.querySelector<HTMLElement>('#encoding-status')!;
const languageStatus = document.querySelector<HTMLElement>('#language-status')!;
const preview = document.querySelector<HTMLElement>('#preview')!;
const previewScroll = document.querySelector<HTMLElement>('#preview-scroll')!;
const outlinePanel = document.querySelector<HTMLElement>('#outline-panel')!;
const outlineList = document.querySelector<HTMLElement>('#outline-list')!;
const outlineResizer = document.querySelector<HTMLElement>('#outline-resizer')!;
const splitter = document.querySelector<HTMLElement>('#splitter')!;
const revealButton = document.querySelector<HTMLButtonElement>('#reveal-button')!;
const formatButton = document.querySelector<HTMLButtonElement>('#format-button')!;
const confirmModal = document.querySelector<HTMLElement>('#confirm-modal')!;
const settingsModal = document.querySelector<HTMLElement>('#settings-modal')!;
const officeNotice = document.querySelector<HTMLElement>('#office-notice')!;
const officeScroll = document.querySelector<HTMLElement>('#office-scroll')!;
const wordEditor = document.querySelector<HTMLElement>('#word-editor')!;
const excelEditor = document.querySelector<HTMLElement>('#excel-editor')!;
const sheetTabs = document.querySelector<HTMLElement>('#sheet-tabs')!;
const zoomLabel = document.querySelector<HTMLElement>('#zoom-label')!;
const documentTabs = document.querySelector<HTMLElement>('#document-tabs')!;
const tabMenu = document.querySelector<HTMLElement>('#tab-menu')!;
const workspaceElement = document.querySelector<HTMLElement>('.workspace')!;
const fileDropOverlay = document.querySelector<HTMLElement>('#file-drop-overlay')!;
const projectPanel = document.querySelector<HTMLElement>('#project-panel')!;
const fileTree = document.querySelector<HTMLElement>('#file-tree')!;
const projectResults = document.querySelector<HTMLElement>('#project-results')!;
const utilityModal = document.querySelector<HTMLElement>('#utility-modal')!;
const utilityTitle = document.querySelector<HTMLElement>('#utility-title')!;
const utilityContent = document.querySelector<HTMLElement>('#utility-content')!;
const readingProgressBar = document.querySelector<HTMLElement>('#reading-progress-bar')!;
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

const welcomeMarkdown = `# 欢迎使用轻阅

轻阅是一款完全本地、离线优先的 Markdown 与代码文件阅读编辑器。

> 左侧安心书写，右侧即时呈现。你的文件始终留在自己的电脑上。

## 快速开始

- 按 **Ctrl + O** 打开 Markdown、JSON、代码或普通文本文件
- 按 **Ctrl + S** 保存，按 **Shift + Alt + F** 格式化 JSON
- 点击右上角 **全屏阅读**，获得干净、沉浸的阅读体验
- 在设置中注册文件关联，以后可以从资源管理器直接打开

## 渲染能力

| 内容 | 支持情况 |
| --- | --- |
| 标题、列表、引用、表格 | 完整支持 |
| 任务清单与脚注 | 完整支持 |
| 代码高亮 | 自动识别主流语言 |
| 数学公式 | 支持行内与块级公式 |

- [x] 清爽的飞书风格阅读排版
- [x] 编辑、分栏、阅读三种布局
- [x] 本地图片与相对链接

公式示例：$E = mc^2$

\`\`\`javascript
const message = 'Hello, QingYue';
console.log(message);
\`\`\`

---

现在，打开一个文件开始吧。
`;

let currentPath: string | null = null;
let currentName = '欢迎使用轻阅.md';
let currentEncoding = 'utf8';
let currentView: ViewMode = 'split';
let viewBeforeFullscreen: ViewMode = 'split';
let dirty = false;
let loadingContent = false;
let markdownDocument = true;
let currentDocumentKind: DocumentKind = 'text';
let officeCopyRequired = false;
let excelSheets: ExcelSheetData[] = [];
let activeSheetIndex = 0;
let excelChanges = new Map<string, ExcelChange>();
let previewZoom = Math.min(2.5, Math.max(.6, Number(localStorage.getItem('qingyue-preview-zoom')) || 1));
let officeZoom = Math.min(2.5, Math.max(.6, Number(localStorage.getItem('qingyue-office-zoom')) || 1));
const OUTLINE_WIDTH_MIN = 180;
const OUTLINE_WIDTH_MAX = 520;
let outlineWidthPreference = Math.min(OUTLINE_WIDTH_MAX, Math.max(OUTLINE_WIDTH_MIN, Number(localStorage.getItem('qingyue-outline-width')) || 240));
let editorRatio = Math.min(.72, Math.max(.28, Number(localStorage.getItem('qingyue-editor-ratio')) || .5));
let tabs: TabState[] = [];
let activeTabId = '';
let startupSettings: StartupSettings = readStartupSettings(localStorage);
let projectRoot: string | null = null;
let sessionTimer = 0;
let historyTimer = 0;
let restoringSession = true;
let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
let mermaidTask: Promise<void> = Promise.resolve();
type SpeechQueueItem = { text: string; element?: HTMLElement; line?: number };
let speechQueue: SpeechQueueItem[] = [];
let speechIndex = 0;
let speechCurrentIndex = -1;
let speechSelectedIndex = 0;
let speechPaused = false;
let speechActiveElement: HTMLElement | null = null;
let annotationDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
let renderTimer = 0;
let confirmResolver: ((choice: DestructiveChoice) => void) | null = null;
let activeUtilityCleanup: (() => void) | null = null;
let lastUpdateState: UpdateState | null = null;
let lastAppInfo: Awaited<ReturnType<typeof window.qingyue.getAppInfo>> | null = null;

type ShortcutCommand = { id: string; label: string; defaultShortcut: string };
const shortcutCommands: ShortcutCommand[] = [
  { id: 'open', label: '打开文件', defaultShortcut: 'Ctrl+KeyO' },
  { id: 'save', label: '保存', defaultShortcut: 'Ctrl+KeyS' },
  { id: 'saveAs', label: '另存为', defaultShortcut: 'Ctrl+Shift+KeyS' },
  { id: 'new', label: '新建文件', defaultShortcut: 'Ctrl+KeyN' },
  { id: 'bookmark', label: '添加/移除书签', defaultShortcut: 'Ctrl+Shift+KeyB' },
  { id: 'annotation', label: '快速批注', defaultShortcut: 'Ctrl+Shift+KeyM' },
  { id: 'diff', label: '文件对比', defaultShortcut: 'Ctrl+Shift+KeyD' },
  { id: 'export', label: '导出', defaultShortcut: 'Ctrl+Shift+KeyE' },
  { id: 'speech', label: '朗读设置', defaultShortcut: 'Ctrl+Shift+KeyL' },
  { id: 'history', label: '历史版本', defaultShortcut: 'Ctrl+Shift+KeyH' },
  { id: 'outline', label: '显示/隐藏目录', defaultShortcut: 'Ctrl+Shift+KeyO' },
  { id: 'projectSearch', label: '文件夹搜索', defaultShortcut: 'Ctrl+Shift+KeyF' },
  { id: 'viewEdit', label: '编辑模式', defaultShortcut: 'Ctrl+Digit1' },
  { id: 'viewSplit', label: '分栏模式', defaultShortcut: 'Ctrl+Digit2' },
  { id: 'viewPreview', label: '阅读模式', defaultShortcut: 'Ctrl+Digit3' },
  { id: 'closeTab', label: '关闭当前标签', defaultShortcut: 'Ctrl+KeyW' },
  { id: 'nextTab', label: '下一个标签', defaultShortcut: 'Ctrl+Tab' },
  { id: 'previousTab', label: '上一个标签', defaultShortcut: 'Ctrl+Shift+Tab' },
  { id: 'format', label: '格式化文档', defaultShortcut: 'Alt+Shift+KeyF' },
  { id: 'fullscreen', label: '全屏阅读', defaultShortcut: 'F11' },
  { id: 'help', label: '使用帮助', defaultShortcut: 'F1' },
].filter((item) => !__LITE__ || !['diff', 'format'].includes(item.id));

function shortcutOverrides(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem('qingyue-shortcuts') || '{}') as Record<string, string>; }
  catch { return {}; }
}

function shortcutFor(id: string) {
  const definition = shortcutCommands.find((item) => item.id === id);
  return shortcutOverrides()[id] ?? definition?.defaultShortcut ?? '';
}

function shortcutSignature(event: KeyboardEvent) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return '';
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.code || event.key);
  return parts.join('+');
}

function shortcutDisplay(shortcut: string) {
  return shortcut.replace(/Key([A-Z])/g, '$1').replace(/Digit([0-9])/g, '$1').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓');
}

const welcomeModel = monaco.editor.createModel('', 'markdown', monaco.Uri.parse('qingyue:///welcome.md'));
const editor = monaco.editor.create(document.querySelector<HTMLElement>('#editor')!, {
  model: welcomeModel,
  theme: 'vs',
  automaticLayout: true,
  fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, 'Microsoft YaHei UI', monospace",
  fontSize: 14,
  lineHeight: 23,
  minimap: { enabled: false },
  wordWrap: 'on',
  wrappingIndent: 'same',
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: 'on',
  padding: { top: 22, bottom: 28 },
  lineNumbersMinChars: 4,
  glyphMargin: true,
  renderLineHighlight: 'line',
  folding: true,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: false },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  unicodeHighlight: { ambiguousCharacters: false },
});

monaco.editor.defineTheme('qingyue-light', {
  base: 'vs', inherit: true,
  rules: [
    { token: 'keyword', foreground: '7C3AED' },
    { token: 'string', foreground: '16865C' },
    { token: 'number', foreground: 'D26A00' },
    { token: 'comment', foreground: '8A9099', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#252A34',
    'editorLineNumber.foreground': '#B0B5BD',
    'editorLineNumber.activeForeground': '#646A73',
    'editor.lineHighlightBackground': '#F7F8FA',
    'editor.selectionBackground': '#DCE8FF',
    'editorCursor.foreground': '#3370FF',
    'editorIndentGuide.background1': '#EBEDF0',
  },
});
monaco.editor.setTheme('qingyue-light');

monaco.editor.defineTheme('qingyue-dark', {
  base: 'vs-dark', inherit: true,
  rules: [{ token: 'comment', foreground: '8F9AA8', fontStyle: 'italic' }, { token: 'string', foreground: '8BD5A7' }],
  colors: { 'editor.background': '#20242B', 'editor.lineHighlightBackground': '#292E36', 'editorCursor.foreground': '#78A2FF' },
});

monaco.editor.defineTheme('qingyue-eye', {
  base: 'vs', inherit: true,
  rules: [{ token: 'comment', foreground: '78836E', fontStyle: 'italic' }, { token: 'string', foreground: '24705A' }, { token: 'keyword', foreground: '5D55A5' }],
  colors: { 'editor.background': '#F4F8E8', 'editor.foreground': '#2C382D', 'editor.lineHighlightBackground': '#EAF0DB', 'editor.selectionBackground': '#D5E4C8', 'editorCursor.foreground': '#3D7B60', 'editorLineNumber.foreground': '#A1AA94' },
});

monaco.editor.defineTheme('qingyue-paper', {
  base: 'vs', inherit: true,
  rules: [{ token: 'comment', foreground: '948673', fontStyle: 'italic' }, { token: 'string', foreground: '2C705D' }, { token: 'keyword', foreground: '7653A6' }],
  colors: { 'editor.background': '#F7F0DF', 'editor.foreground': '#40372D', 'editor.lineHighlightBackground': '#EFE6D3', 'editor.selectionBackground': '#E4D8BE', 'editorCursor.foreground': '#9B6137', 'editorLineNumber.foreground': '#AA9D88' },
});

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function newTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function captureActiveTab() {
  const tab = activeTab();
  if (!tab) return;
  tab.path = currentPath;
  tab.name = currentName;
  tab.encoding = currentEncoding;
  tab.dirty = dirty;
  tab.view = currentView;
  tab.previewScrollTop = tab.kind === 'text' ? previewScroll.scrollTop : officeScroll.scrollTop;
  const position = editor.getPosition();
  tab.cursorLine = position?.lineNumber || 1;
  tab.cursorColumn = position?.column || 1;
  tab.officeCopyRequired = officeCopyRequired;
  if (tab.kind === 'docx') tab.docxHtml = wordEditor.innerHTML;
  if (tab.kind === 'xlsx') {
    tab.sheets = excelSheets;
    tab.excelChanges = new Map(excelChanges);
    tab.activeSheetIndex = activeSheetIndex;
  }
}

function renderTabs() {
  documentTabs.innerHTML = '';
  tabs.forEach((tab) => {
    const button = document.createElement('button');
    button.className = `document-tab${tab.id === activeTabId ? ' active' : ''}`;
    button.title = tab.path || tab.name;
    button.innerHTML = `<span class="tab-name">${escapeHtml(tab.name)}</span>${tab.dirty ? '<span class="tab-dirty"></span>' : ''}<span class="tab-close" title="关闭">×</span>`;
    button.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.tab-close')) closeTab(tab.id);
      else activateTab(tab.id);
    });
    documentTabs.append(button);
  });
  documentTabs.querySelector('.document-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function closeTabs(ids: string[]) {
  captureActiveTab();
  const candidates = tabs.filter((tab) => ids.includes(tab.id));
  if (!candidates.length) return;
  const dirtyTabs = candidates.filter((tab) => tab.dirty);
  if (dirtyTabs.length && !window.confirm(`${dirtyTabs.length} 个标签包含未保存内容。关闭后仍可从历史版本恢复，确定继续吗？`)) return;
  await Promise.all(dirtyTabs.filter((tab) => tab.kind === 'text' && tab.model).map((tab) => window.qingyue.saveHistory({
    identity: tab.path || tab.id, name: tab.name, content: tab.model!.getValue(),
  })));
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const activeClosing = ids.includes(activeTabId);
  tabs = tabs.filter((tab) => !ids.includes(tab.id));
  candidates.forEach((tab) => tab.model?.dispose());
  if (!tabs.length) {
    activeTabId = '';
    showEmptyWorkspace();
  } else if (activeClosing) {
    activeTabId = '';
    activateTab(tabs[Math.min(activeIndex, tabs.length - 1)].id);
  } else renderTabs();
  window.qingyue.setDirty(tabs.some((tab) => tab.dirty));
  scheduleSessionSave();
}

function closeTabsToRight(id = activeTabId) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0 || index === tabs.length - 1) return showToast('右侧没有标签页');
  return closeTabs(tabs.slice(index + 1).map((tab) => tab.id));
}

function configureLargeMode(enabled: boolean) {
  editor.updateOptions({
    wordWrap: enabled ? 'off' : 'on',
    folding: !enabled,
    bracketPairColorization: { enabled: !enabled },
    guides: { bracketPairs: !enabled, indentation: false },
    renderWhitespace: enabled ? 'none' : 'selection',
  });
}

function applyTextTab(tab: TabState) {
  if (!tab.model) return;
  currentPath = tab.path;
  currentName = tab.name;
  currentEncoding = tab.encoding;
  markdownDocument = isMarkdownName(tab.name) && !tab.largeMode;
  setDocumentKind('text');
  editor.setModel(tab.model);
  const language = tab.model.getLanguageId();
  filenameEl.textContent = tab.name;
  encodingStatus.textContent = tab.encoding.toUpperCase().replace('-', '‑');
  languageStatus.textContent = tab.largeMode ? `${languageLabel(language)} · 大文件模式` : languageLabel(language);
  revealButton.hidden = !tab.path;
  configureLargeMode(tab.largeMode);
  if (formatButton) formatButton.disabled = tab.largeMode || markdownDocument || !['json', 'javascript', 'typescript', 'css', 'html', 'yaml'].includes(language);
  document.querySelectorAll<HTMLButtonElement>('.view-tab[data-mode="split"], .view-tab[data-mode="preview"]').forEach((button) => button.disabled = !markdownDocument);
  document.querySelector<HTMLButtonElement>('#fullscreen-button')!.disabled = !markdownDocument;
  document.querySelector<HTMLButtonElement>('#outline-button')!.disabled = !markdownDocument;
  applyView(markdownDocument ? tab.view : 'edit');
  renderMarkdown();
  updateStats();
  editor.setPosition({ lineNumber: Math.min(tab.cursorLine, tab.model.getLineCount()), column: tab.cursorColumn });
  requestAnimationFrame(() => {
    previewScroll.scrollTop = tab.previewScrollTop;
    editor.revealLineInCenter(tab.cursorLine);
  });
}

function applyOfficeTab(tab: TabState) {
  currentName = tab.name;
  currentPath = tab.path;
  currentEncoding = 'office';
  markdownDocument = false;
  officeCopyRequired = tab.officeCopyRequired;
  setDocumentKind(tab.kind);
  filenameEl.textContent = tab.name;
  revealButton.hidden = !tab.path;
  if (tab.kind === 'docx') {
    encodingStatus.textContent = 'DOCX'; languageStatus.textContent = 'Word 轻量编辑';
    wordEditor.innerHTML = tab.docxHtml || '';
    excelEditor.innerHTML = ''; sheetTabs.innerHTML = '';
    officeNotice.textContent = `Word 轻量编辑 · ${officeCopyRequired ? '首次保存将创建副本' : '正在编辑副本'}`;
    setOfficeZoom(officeZoom);
  } else {
    encodingStatus.textContent = 'XLSX'; languageStatus.textContent = 'Excel 轻量编辑';
    excelSheets = tab.sheets || [];
    excelChanges = new Map(tab.excelChanges || []);
    activeSheetIndex = tab.activeSheetIndex;
    wordEditor.innerHTML = '';
    officeNotice.textContent = `Excel 轻量编辑 · ${officeCopyRequired ? '首次保存将创建副本' : '正在编辑副本'} · 公式由 Excel 重新计算`;
    populateSheetTabs(); renderSheet(activeSheetIndex);
  }
  updateStats();
  updateMarkerCounts();
  requestAnimationFrame(() => { officeScroll.scrollTop = tab.previewScrollTop; });
}

function activateTab(id: string) {
  if (id === activeTabId && activeTab()) return;
  if (window.speechSynthesis.speaking || speechPaused) stopSpeech();
  captureActiveTab();
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  appShell.dataset.empty = 'false';
  activeTabId = id;
  loadingContent = true;
  if (tab.kind === 'text') applyTextTab(tab); else applyOfficeTab(tab);
  loadingContent = false;
  dirty = tab.dirty;
  dirtyDot.classList.toggle('visible', dirty);
  savedState.classList.toggle('unsaved', dirty);
  savedState.innerHTML = dirty ? '<span class="unsaved-mark">●</span> 未保存' : `${icons.check} 已保存`;
  document.title = `${dirty ? '● ' : ''}${currentName} - 轻阅`;
  window.qingyue.setDirty(tabs.some((item) => item.dirty));
  renderTabs();
  updateMarkerCounts();
  scheduleSessionSave();
}

function createTextTab(name: string, filePath: string | null, content: string, encoding = 'utf8', largeMode = false, recovered = false, forcedId?: string, activate = true) {
  const language = languageFor(name);
  const tabId = forcedId || newTabId();
  const uri = monaco.Uri.parse(`qingyue:///documents/${encodeURIComponent(name)}?tab=${encodeURIComponent(tabId)}`);
  const model = monaco.editor.createModel(content, language, uri);
  const tab: TabState = {
    id: tabId, kind: 'text', path: filePath, name, encoding, dirty: recovered, largeMode, model,
    activeSheetIndex: 0, officeCopyRequired: false, view: isMarkdownName(name) && !largeMode ? startupSettings.defaultView : 'edit', previewScrollTop: 0,
    cursorLine: 1, cursorColumn: 1, bookmarks: [], annotations: [],
  };
  tabs.push(tab);
  if (activate) activateTab(tab.id);
  if (recovered) showToast(`已恢复 ${name} 的未保存内容`);
  return tab;
}

async function closeTab(id: string) {
  await closeTabs([id]);
}

function serializeSession() {
  captureActiveTab();
  return {
    version: 2, activeTabId, projectRoot, savedAt: Date.now(),
    projectOpen: projectPanel.classList.contains('open'),
    outlineOpen: outlinePanel.classList.contains('open'),
    outlineWidth: outlineWidthPreference,
    outlineScrollTop: outlinePanel.scrollTop,
    projectScrollTop: fileTree.scrollTop,
    editorRatio,
    tabs: tabs.map((tab) => ({
      id: tab.id, kind: tab.kind, path: tab.path, name: tab.name, encoding: tab.encoding, dirty: tab.dirty,
      largeMode: tab.largeMode,
      content: tab.kind === 'text' && tab.model && !tab.largeMode && (tab.dirty || !tab.path) ? tab.model.getValue() : undefined,
      docxHtml: tab.kind === 'docx' && tab.dirty ? tab.docxHtml : undefined,
      excelChanges: tab.kind === 'xlsx' ? [...(tab.excelChanges || new Map()).values()] : undefined,
      officeCopyRequired: tab.officeCopyRequired, view: tab.view, previewScrollTop: tab.previewScrollTop,
      cursorLine: tab.cursorLine, cursorColumn: tab.cursorColumn, bookmarks: tab.bookmarks, annotations: tab.annotations,
    })),
  };
}

function scheduleSessionSave() {
  if (restoringSession) return;
  window.clearTimeout(sessionTimer);
  sessionTimer = window.setTimeout(() => window.qingyue.saveSession(serializeSession()).catch(() => undefined), 700);
}

function scheduleHistorySnapshot() {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    const tab = activeTab();
    if (tab?.dirty && tab.kind === 'text' && tab.model) window.qingyue.saveHistory({ identity: tab.path || tab.id, name: tab.name, content: tab.model.getValue() }).catch(() => undefined);
  }, 5000);
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, language) {
    try {
      if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return hljs.highlightAuto(code).value;
    } catch { return escapeHtml(code); }
  },
})
  .use(markdownItAnchor, { permalink: markdownItAnchor.permalink.linkInsideHeader({ symbol: '#', placement: 'before', ariaHidden: true }) })
  .use(markdownItFootnote)
  .use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true })
  .use(markdownItKatex)
  .use(markdownItFrontMatter, () => undefined);

function isAudioReference(reference: string) {
  return /\.(mp3|wav|m4a|ogg|flac)(?:$|[?#])/i.test(reference);
}

function normalizeEmbeddedAudio(source: string) {
  return source
    .replace(/<audio\b[^>]*\bsrc=["']([^"']+)["'][^>]*>(?:[\s\S]*?<\/audio>)?/gi, (_all, src) => `![音频](${src})`)
    .replace(/<audio\b[^>]*>[\s\S]*?<source\b[^>]*\bsrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/audio>/gi, (_all, src) => `![音频](${src})`);
}

function audioMimeType(reference: string) {
  const types: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
  return types[extensionOf(reference.split(/[?#]/)[0])] || 'audio/mpeg';
}

function markdownToPlainText(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```\w*\n?/, '').replace(/```$/, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const defaultImageRule = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx].attrGet('src') || '';
  if (isAudioReference(src)) {
    const url = currentPath && isRelativeReference(src) ? toAssetUrl(resolveLocalReference(currentPath, src)) : src;
    const label = tokens[idx].content || '音频';
    return `<figure class="audio-embed"><figcaption><i class="codicon codicon-unmute"></i>${escapeHtml(label)}</figcaption><audio controls preload="metadata"><source src="${escapeHtml(url)}" type="${audioMimeType(src)}">当前环境无法播放此音频。</audio><span class="audio-error" hidden>音频无法播放，请检查文件是否被移动。</span></figure>`;
  }
  if (src && currentPath && isRelativeReference(src)) tokens[idx].attrSet('src', toAssetUrl(resolveLocalReference(currentPath, src)));
  tokens[idx].attrSet('loading', 'lazy');
  return defaultImageRule(tokens, idx, options, env, self);
};

const defaultLinkOpenRule = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (currentPath && isRelativeReference(href) && !href.startsWith('#')) {
    tokens[idx].attrSet('data-local-path', resolveLocalReference(currentPath, href));
    tokens[idx].attrSet('href', '#');
  } else if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpenRule(tokens, idx, options, env, self);
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!);
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : name.toLowerCase();
}

function isMarkdownName(name: string) {
  return ['.md', '.markdown', '.mdown', '.mkd', '.mdx'].includes(extensionOf(name));
}

function languageFor(name: string) {
  const extension = extensionOf(name);
  const languages: Record<string, string> = {
    '.md': 'markdown', '.markdown': 'markdown', '.mdown': 'markdown', '.mkd': 'markdown', '.mdx': 'markdown',
    '.json': 'json', '.jsonc': 'json', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.css': 'css', '.scss': 'scss', '.less': 'less', '.html': 'html', '.htm': 'html',
    '.xml': 'xml', '.svg': 'xml', '.yaml': 'yaml', '.yml': 'yaml', '.py': 'python', '.java': 'java', '.c': 'c', '.h': 'cpp',
    '.cpp': 'cpp', '.hpp': 'cpp', '.cs': 'csharp', '.go': 'go', '.rs': 'rust', '.php': 'php', '.rb': 'ruby', '.swift': 'swift',
    '.kt': 'kotlin', '.kts': 'kotlin', '.sql': 'sql', '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.ps1': 'powershell',
    '.bat': 'bat', '.cmd': 'bat', '.ini': 'ini', '.toml': 'ini', '.properties': 'ini', '.txt': 'plaintext', '.log': 'plaintext',
    '.csv': 'plaintext', '.tsv': 'plaintext', dockerfile: 'dockerfile', makefile: 'plaintext', '.gitignore': 'plaintext', '.env': 'plaintext',
  };
  return languages[extension] || 'plaintext';
}

function languageLabel(language: string) {
  const labels: Record<string, string> = { plaintext: '纯文本', markdown: 'Markdown', javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', yaml: 'YAML', shell: 'Shell', powershell: 'PowerShell', csharp: 'C#', cpp: 'C++' };
  return labels[language] || language.charAt(0).toUpperCase() + language.slice(1);
}

function isRelativeReference(reference: string) {
  return !/^(?:[a-z]+:|#|\\\\)/i.test(reference) && !/^[a-z]:[\\/]/i.test(reference);
}

function resolveLocalReference(baseFile: string, reference: string) {
  const clean = decodeURIComponent(reference.split('#')[0].split('?')[0]).replace(/\//g, '\\');
  const baseDir = baseFile.replace(/[\\/][^\\/]*$/, '');
  const raw = /^[a-z]:[\\/]/i.test(clean) ? clean : `${baseDir}\\${clean}`;
  const drive = raw.match(/^[a-z]:/i)?.[0] || '';
  const parts = raw.slice(drive.length).split(/[\\/]+/);
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop(); else normalized.push(part);
  }
  return `${drive}\\${normalized.join('\\')}`;
}

function toAssetUrl(filePath: string) {
  return `qingyue-file://asset/${encodeURIComponent(filePath)}`;
}

function renderMarkdown() {
  if (currentDocumentKind !== 'text' || !markdownDocument) return;
  const source = normalizeEmbeddedAudio(editor.getValue());
  const html = md.render(source);
  preview.innerHTML = DOMPurify.sanitize(html, {
    ADD_TAGS: ['audio', 'source', 'figure', 'figcaption'],
    ADD_ATTR: ['target', 'data-local-path', 'aria-hidden', 'checked', 'disabled', 'controls', 'preload', 'type', 'hidden'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data|qingyue-file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
  if (currentPath) preview.querySelectorAll<HTMLMediaElement>('audio[src],video[src]').forEach((media) => {
    const reference = media.getAttribute('src');
    if (reference && isRelativeReference(reference)) media.src = toAssetUrl(resolveLocalReference(currentPath!, reference));
  });
  preview.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => audio.addEventListener('error', () => {
    const message = audio.closest('.audio-embed')?.querySelector<HTMLElement>('.audio-error');
    if (message) message.hidden = false;
  }));
  decorateCodeBlocks();
  void renderMermaidDiagrams();
  buildOutline();
  renderDocumentMarkers();
  updateStats();
}

function renderMermaidDiagrams(): Promise<void> {
  mermaidTask = mermaidTask.then(renderMermaidNow, renderMermaidNow);
  return mermaidTask;
}

async function renderMermaidNow() {
  if (currentView === 'edit' || currentDocumentKind !== 'text' || !markdownDocument) return;
  const blocks = [...preview.querySelectorAll<HTMLElement>('pre code.language-mermaid')];
  if (!blocks.length) return;
  try {
    mermaidPromise ||= import('mermaid');
    const { default: mermaid } = await mermaidPromise;
    const dark = appShell.dataset.theme === 'dark';
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', htmlLabels: true,
      fontFamily: 'Segoe UI, Microsoft YaHei UI, sans-serif',
      themeVariables: {
        darkMode: dark, background: dark ? '#20252d' : '#ffffff',
        primaryColor: dark ? '#293b57' : '#e8efff', primaryTextColor: dark ? '#f0f4ff' : '#1f2937',
        secondaryColor: dark ? '#263c34' : '#e5f5ec', secondaryTextColor: dark ? '#edf9f1' : '#1f2937',
        tertiaryColor: dark ? '#403a2b' : '#fff3d6', tertiaryTextColor: dark ? '#fff4db' : '#1f2937',
        primaryBorderColor: dark ? '#83a8ee' : '#5279b8', lineColor: dark ? '#bbc8db' : '#52647b',
        textColor: dark ? '#f0f4ff' : '#1f2937', edgeLabelBackground: dark ? '#20252d' : '#ffffff',
      },
    });
    for (const [index, code] of blocks.entries()) {
      if (!code.isConnected) continue;
      const source = code.textContent || '';
      const container = document.createElement('div');
      container.className = 'mermaid-diagram';
      container.dataset.source = source;
      try {
        const { svg: diagram } = await mermaid.render(`qingyue-mermaid-${Date.now()}-${index}`, source);
        // Some Mermaid diagrams use XHTML labels inside SVG foreignObject. SVG-only
        // sanitization removed that text; allow safe HTML while still stripping scripts.
        container.innerHTML = DOMPurify.sanitize(diagram, {
          USE_PROFILES: { svg: true, svgFilters: true, html: true },
          ADD_TAGS: ['foreignObject'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
          HTML_INTEGRATION_POINTS: { foreignobject: true },
        });
      } catch (error) {
        container.classList.add('mermaid-error');
        container.textContent = `Mermaid 图表错误：${error instanceof Error ? error.message : String(error)}`;
      }
      if (code.isConnected) code.closest('pre')?.replaceWith(container);
    }
  } catch (error) {
    showToast(`Mermaid 加载失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function renderDocumentMarkers() {
  const tab = activeTab();
  annotationDecorations?.clear();
  updateMarkerCounts();
  if (!tab || tab.kind !== 'text') return;
  annotationDecorations = editor.createDecorationsCollection([
    ...tab.bookmarks.map((line) => ({ range: new monaco.Range(line, 1, line, 1), options: {
      isWholeLine: true, glyphMarginClassName: 'codicon codicon-bookmark bookmark-glyph',
      glyphMarginHoverMessage: { value: `书签 · 第 ${line} 行` },
      overviewRuler: { color: '#e3a008', position: monaco.editor.OverviewRulerLane.Right },
    } })),
    ...tab.annotations.map((note) => ({ range: new monaco.Range(note.line, 1, note.line, 1), options: {
      isWholeLine: true, className: 'annotation-line-highlight',
      glyphMarginClassName: 'codicon codicon-comment-discussion annotation-glyph',
      glyphMarginHoverMessage: { value: note.text },
      overviewRuler: { color: '#8b5cf6', position: monaco.editor.OverviewRulerLane.Right },
    } })),
  ]);
}

function updateMarkerCounts() {
  const tab = activeTab();
  const bookmarks = tab?.kind === 'text' ? tab.bookmarks.length : 0;
  const annotations = tab?.kind === 'text' ? tab.annotations.length : 0;
  const bookmarkCount = document.querySelector<HTMLElement>('#bookmark-count')!;
  const annotationCount = document.querySelector<HTMLElement>('#annotation-count')!;
  bookmarkCount.textContent = String(bookmarks); bookmarkCount.hidden = bookmarks === 0;
  annotationCount.textContent = String(annotations); annotationCount.hidden = annotations === 0;
}

function jumpToSourceLine(line: number) {
  const model = editor.getModel();
  if (!model) return;
  const safeLine = Math.min(Math.max(1, line), model.getLineCount());
  editor.setPosition({ lineNumber: safeLine, column: 1 });
  editor.revealLineInCenter(safeLine);
  editor.focus();
  if (markdownDocument) {
    const ratio = (safeLine - 1) / Math.max(1, model.getLineCount() - 1);
    previewScroll.scrollTo({ top: ratio * Math.max(0, previewScroll.scrollHeight - previewScroll.clientHeight), behavior: 'smooth' });
  }
  utilityModal.hidden = true;
}

function decorateCodeBlocks() {
  preview.querySelectorAll('pre').forEach((block) => {
    if (block.querySelector('.copy-code')) return;
    const button = document.createElement('button');
    button.className = 'copy-code';
    button.textContent = '复制';
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(block.querySelector('code')?.textContent || '');
      button.textContent = '已复制';
      window.setTimeout(() => { button.textContent = '复制'; }, 1200);
    });
    block.append(button);
  });
}

function buildOutline() {
  const headings = [...preview.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4')];
  const sourceHeadings = md.parse(editor.getValue(), {}).filter((token) => token.type === 'heading_open' && /^h[1-4]$/.test(token.tag));
  outlineList.innerHTML = '';
  if (!headings.length) {
    outlineList.innerHTML = '<div class="outline-empty">暂无标题</div>';
    return;
  }
  headings.forEach((heading, index) => {
    const link = document.createElement('button');
    link.className = `outline-link level-${heading.tagName.slice(1)}`;
    link.dataset.target = heading.id;
    const sourceLine = (sourceHeadings[index]?.map?.[0] ?? 0) + 1;
    link.dataset.line = String(sourceLine);
    link.textContent = heading.textContent?.replace(/^#/, '').trim() || '未命名标题';
    link.addEventListener('click', () => {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      editor.setPosition({ lineNumber: sourceLine, column: 1 });
      editor.revealLineInCenter(sourceLine, monaco.editor.ScrollType.Smooth);
      outlineList.querySelectorAll('.outline-link').forEach((item) => item.classList.toggle('active', item === link));
    });
    outlineList.append(link);
  });
}

function maximumOutlineWidth() {
  const projectWidth = workspaceElement.classList.contains('project-open') ? projectPanel.offsetWidth : 0;
  const available = workspaceElement.clientWidth ? workspaceElement.clientWidth - projectWidth - 420 : OUTLINE_WIDTH_MAX;
  return Math.max(OUTLINE_WIDTH_MIN, Math.min(OUTLINE_WIDTH_MAX, available));
}

function renderOutlineWidth() {
  const visibleWidth = Math.min(outlineWidthPreference, maximumOutlineWidth());
  workspaceElement.style.setProperty('--outline-width', `${visibleWidth}px`);
  outlineResizer.setAttribute('aria-valuenow', String(Math.round(visibleWidth)));
  outlineResizer.setAttribute('aria-valuemax', String(Math.round(maximumOutlineWidth())));
  requestAnimationFrame(() => editor.layout());
}

function setOutlineWidth(value: number, persist = true) {
  const requested = Math.round(Math.min(OUTLINE_WIDTH_MAX, Math.max(OUTLINE_WIDTH_MIN, value)));
  outlineWidthPreference = persist ? Math.min(requested, maximumOutlineWidth()) : requested;
  if (persist) localStorage.setItem('qingyue-outline-width', String(outlineWidthPreference));
  renderOutlineWidth();
  scheduleSessionSave();
}

function setEditorRatio(value: number, persist = true) {
  editorRatio = Math.min(.72, Math.max(.28, value));
  appShell.style.setProperty('--editor-ratio', `${editorRatio * 100}%`);
  if (persist) localStorage.setItem('qingyue-editor-ratio', String(editorRatio));
  requestAnimationFrame(() => editor.layout());
  scheduleSessionSave();
}

function setOutlineOpen(open: boolean) {
  outlinePanel.classList.toggle('open', open);
  workspaceElement.classList.toggle('outline-open', open);
  outlinePanel.setAttribute('aria-hidden', String(!open));
  document.querySelector<HTMLButtonElement>('#outline-button')!.classList.toggle('active', open);
  renderOutlineWidth();
  scheduleSessionSave();
}

function updateActiveOutlineItem() {
  const headings = [...preview.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4')];
  if (!headings.length) return;
  const threshold = previewScroll.getBoundingClientRect().top + 110;
  let active = headings[0];
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= threshold) active = heading;
    else break;
  }
  outlineList.querySelectorAll<HTMLButtonElement>('.outline-link').forEach((link) => {
    const selected = link.dataset.target === active.id;
    link.classList.toggle('active', selected);
    if (selected && outlinePanel.classList.contains('open')) link.scrollIntoView({ block: 'nearest' });
  });
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderMarkdown, 120);
}

function setDirty(value: boolean) {
  const changed = dirty !== value;
  dirty = value;
  const tab = activeTab();
  const tabChanged = Boolean(tab && tab.dirty !== value);
  if (tab) tab.dirty = value;
  dirtyDot.classList.toggle('visible', value);
  savedState.classList.toggle('unsaved', value);
  savedState.innerHTML = value ? '<span class="unsaved-mark">●</span> 未保存' : `${icons.check} 已保存`;
  window.qingyue.setDirty(tabs.some((item) => item.dirty));
  document.title = `${value ? '● ' : ''}${currentName} - 轻阅`;
  if (changed || tabChanged) renderTabs();
  scheduleSessionSave();
  if (value) scheduleHistorySnapshot();
}

function updateStats() {
  if (currentDocumentKind === 'docx') {
    documentStats.textContent = `${wordEditor.innerText.trim().length.toLocaleString()} 字符 · Word 轻量模式`;
    return;
  }
  if (currentDocumentKind === 'xlsx') {
    const sheet = excelSheets[activeSheetIndex];
    documentStats.textContent = sheet ? `${sheet.rowCount} 行 × ${sheet.columnCount} 列 · ${excelChanges.size} 处修改` : 'Excel 轻量模式';
    return;
  }
  const value = editor.getValue();
  const lines = editor.getModel()?.getLineCount() || 1;
  if (markdownDocument) {
    const plain = value.replace(/```[\s\S]*?```/g, '').replace(/[#>*_`\[\]()-]/g, ' ').trim();
    const cjk = plain.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length || 0;
    const words = plain.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
    documentStats.textContent = `${cjk + words} 字 · ${lines} 行`;
  } else {
    documentStats.textContent = `${value.length.toLocaleString()} 字符 · ${lines} 行`;
  }
}

function applyView(mode: ViewMode) {
  if (currentDocumentKind !== 'text') return;
  if (!markdownDocument && mode !== 'edit') {
    showToast('只有 Markdown 文件提供编译预览');
    mode = 'edit';
  }
  currentView = mode;
  appShell.dataset.view = mode;
  document.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (activeTab()) activeTab()!.view = mode;
  requestAnimationFrame(() => { editor.layout(); if (mode !== 'edit') void renderMermaidDiagrams(); });
  scheduleSessionSave();
}

function setPreviewZoom(value: number) {
  const oldScrollable = Math.max(1, previewScroll.scrollHeight - previewScroll.clientHeight);
  const position = previewScroll.scrollTop / oldScrollable;
  previewZoom = Math.min(2.5, Math.max(.6, Math.round(value * 10) / 10));
  preview.style.zoom = String(previewZoom);
  zoomLabel.textContent = `${Math.round(previewZoom * 100)}%`;
  localStorage.setItem('qingyue-preview-zoom', String(previewZoom));
  requestAnimationFrame(() => {
    const nextScrollable = Math.max(1, previewScroll.scrollHeight - previewScroll.clientHeight);
    previewScroll.scrollTop = position * nextScrollable;
  });
}

function setOfficeZoom(value: number) {
  const oldScrollable = Math.max(1, officeScroll.scrollHeight - officeScroll.clientHeight);
  const position = officeScroll.scrollTop / oldScrollable;
  officeZoom = Math.min(2.5, Math.max(.6, Math.round(value * 10) / 10));
  wordEditor.style.zoom = String(officeZoom);
  zoomLabel.textContent = `${Math.round(officeZoom * 100)}%`;
  localStorage.setItem('qingyue-office-zoom', String(officeZoom));
  requestAnimationFrame(() => {
    const nextScrollable = Math.max(1, officeScroll.scrollHeight - officeScroll.clientHeight);
    officeScroll.scrollTop = position * nextScrollable;
  });
}

function setActiveZoom(delta: number | 'reset') {
  if (currentDocumentKind === 'docx') setOfficeZoom(delta === 'reset' ? 1 : officeZoom + delta);
  else setPreviewZoom(delta === 'reset' ? 1 : previewZoom + delta);
}

function setDocumentKind(kind: DocumentKind) {
  currentDocumentKind = kind;
  appShell.dataset.documentKind = kind === 'text' ? 'text' : 'office';
  appShell.dataset.officeKind = kind;
  const office = kind !== 'text';
  if (formatButton) formatButton.disabled = office;
  document.querySelectorAll<HTMLButtonElement>('.view-tab, #fullscreen-button, #outline-button').forEach((button) => button.disabled = office);
  if (office) setOutlineOpen(false);
  zoomLabel.textContent = `${Math.round((kind === 'docx' ? officeZoom : previewZoom) * 100)}%`;
}

function setOfficeBase(name: string, filePath: string, kind: 'docx' | 'xlsx') {
  currentName = name;
  currentPath = filePath;
  currentEncoding = 'office';
  markdownDocument = false;
  setDocumentKind(kind);
  filenameEl.textContent = name;
  encodingStatus.textContent = kind === 'docx' ? 'DOCX' : 'XLSX';
  languageStatus.textContent = kind === 'docx' ? 'Word 轻量编辑' : 'Excel 轻量编辑';
  revealButton.hidden = false;
  officeCopyRequired = true;
  setDirty(false);
}

function copySuggestedName(name: string) {
  const extension = extensionOf(name);
  const stem = extension && name.toLowerCase().endsWith(extension) ? name.slice(0, -extension.length) : name;
  return `${stem}-轻阅副本${extension}`;
}

function textRuns(root: Node) {
  const runs: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean; break?: boolean }> = [];
  const visit = (node: Node, style = { bold: false, italic: false, underline: false }) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push({ text: node.textContent, ...style });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') { runs.push({ text: '', break: true, ...style }); return; }
    const next = {
      bold: style.bold || ['B', 'STRONG'].includes(node.tagName) || Number(getComputedStyle(node).fontWeight) >= 600,
      italic: style.italic || ['I', 'EM'].includes(node.tagName),
      underline: style.underline || node.tagName === 'U',
    };
    node.childNodes.forEach((child) => visit(child, next));
  };
  root.childNodes.forEach((child) => visit(child));
  return runs;
}

function serializeWordBlocks(root: HTMLElement = wordEditor) {
  const blocks: unknown[] = [];
  [...root.children].forEach((element) => {
    const tag = element.tagName;
    if (element.classList.contains('mermaid-diagram')) {
      blocks.push({ type: 'paragraph', runs: [{ text: `Mermaid 图表\n${(element as HTMLElement).dataset.source || element.textContent || ''}`, bold: false }] });
    } else if (tag === 'UL' || tag === 'OL') {
      [...element.children].filter((child) => child.tagName === 'LI').forEach((item) => blocks.push({ type: tag === 'UL' ? 'bullet' : 'number', level: 0, runs: textRuns(item) }));
    } else if (tag === 'TABLE') {
      const rows = [...element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')].map((row) => ({
        cells: [...row.children].map((cell) => ({ runs: textRuns(cell) })),
      }));
      blocks.push({ type: 'table', rows: rows.map((row) => row.cells) });
    } else if (/^H[1-3]$/.test(tag)) blocks.push({ type: 'heading', level: Number(tag.slice(1)), runs: textRuns(element) });
    else blocks.push({ type: 'paragraph', runs: textRuns(element) });
  });
  return blocks;
}

function columnLabel(column: number) {
  let value = column;
  let result = '';
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}

function excelChangeKey(sheetName: string, row: number, column: number) {
  return `${sheetName}\u0000${row}\u0000${column}`;
}

function renderSheet(index: number) {
  activeSheetIndex = index;
  sheetTabs.querySelectorAll<HTMLButtonElement>('button').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index));
  excelEditor.innerHTML = '';
  const sheet = excelSheets[index];
  if (!sheet) return;
  const table = document.createElement('table');
  table.className = 'excel-grid';
  const header = document.createElement('tr');
  header.append(document.createElement('th'));
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const th = document.createElement('th');
    th.textContent = columnLabel(column);
    th.style.width = `${sheet.widths[column - 1] * 7.5}px`;
    header.append(th);
  }
  const thead = document.createElement('thead'); thead.append(header); table.append(thead);
  const tbody = document.createElement('tbody');
  sheet.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th'); rowHeader.textContent = String(rowIndex + 1); tr.append(rowHeader);
    row.forEach((cell, columnIndex) => {
      const td = document.createElement('td');
      const change = excelChanges.get(excelChangeKey(sheet.name, rowIndex + 1, columnIndex + 1));
      td.contentEditable = 'true';
      td.spellcheck = false;
      td.textContent = change?.value ?? cell.value;
      td.dataset.row = String(rowIndex + 1);
      td.dataset.column = String(columnIndex + 1);
      td.dataset.original = change?.original ?? cell.value;
      td.style.width = `${sheet.widths[columnIndex] * 7.5}px`;
      if (cell.style.bold) td.style.fontWeight = '700';
      if (cell.style.italic) td.style.fontStyle = 'italic';
      if (cell.style.align) td.style.textAlign = cell.style.align;
      if (cell.style.fill) td.style.backgroundColor = cell.style.fill;
      if (cell.style.color) td.style.color = cell.style.color;
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  excelEditor.append(table);
  if (sheet.truncated) showToast('表格较大，轻量模式只显示前 500 行、100 列');
  updateStats();
}

function populateSheetTabs() {
  sheetTabs.innerHTML = '';
  excelSheets.forEach((sheet, index) => {
    const button = document.createElement('button');
    button.textContent = sheet.name;
    button.addEventListener('click', () => renderSheet(index));
    sheetTabs.append(button);
  });
}

async function openDocx(filePath: string) {
  const file = await window.qingyue.readDocx(filePath);
  const tab: TabState = {
    id: newTabId(), kind: 'docx', path: file.path, name: file.name, encoding: 'office', dirty: false, largeMode: false,
    docxHtml: DOMPurify.sanitize(file.html), activeSheetIndex: 0, officeCopyRequired: true, view: 'edit', previewScrollTop: 0,
    cursorLine: 1, cursorColumn: 1, bookmarks: [], annotations: [],
  };
  tabs.push(tab); activateTab(tab.id);
  if (file.warnings.length) showToast(`检测到 ${file.warnings.length} 项 Word 兼容性提示`);
}

async function openXlsx(filePath: string) {
  const file = await window.qingyue.readXlsx(filePath);
  const tab: TabState = {
    id: newTabId(), kind: 'xlsx', path: file.path, name: file.name, encoding: 'office', dirty: false, largeMode: false,
    sheets: file.sheets, excelChanges: new Map(), activeSheetIndex: 0, officeCopyRequired: true, view: 'edit', previewScrollTop: 0,
    cursorLine: 1, cursorColumn: 1, bookmarks: [], annotations: [],
  };
  tabs.push(tab); activateTab(tab.id);
}

function setDocument(name: string, filePath: string | null, content: string, encoding = 'utf8', largeMode = false, recovered = false) {
  return createTextTab(name, filePath, content, encoding, largeMode, recovered);
}

async function confirmBeforeDestructive(message: string): Promise<DestructiveChoice> {
  if (!dirty) return 'discard';
  document.querySelector<HTMLElement>('#confirm-message')!.textContent = message;
  confirmModal.hidden = false;
  return new Promise((resolve) => { confirmResolver = resolve; });
}

async function handleDestructiveAction(message: string, action: () => Promise<void>) {
  const choice = await confirmBeforeDestructive(message);
  if (choice === 'cancel') return;
  if (choice === 'save' && !(await saveCurrent())) return;
  await action();
}

async function openFile(filePath?: string) {
  const selected = filePath || await window.qingyue.openDialog();
  if (!selected) return;
  if (__LITE__ && ['.docx', '.xlsx', '.excalidraw', '.mindmap', '.smm', '.xmind', '.mm', '.opml', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(extensionOf(selected))) return showToast('轻量版只打开文本文件；Office、白板、导图及独立媒体请使用完整版');
  const existing = tabs.find((tab) => tab.path?.toLowerCase() === selected.toLowerCase());
  if (existing) return activateTab(existing.id);
  try {
    const extension = extensionOf(selected);
    if (!__LITE__ && ['.excalidraw', '.mindmap', '.smm', '.xmind', '.mm', '.opml', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(extension)) await openCreativeFile(selected);
    else if (!__LITE__ && extension === '.docx') await openDocx(selected);
    else if (!__LITE__ && extension === '.xlsx') await openXlsx(selected);
    else {
      let file: OpenedFile;
      try { file = await window.qingyue.readFile(selected); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (__LITE__ || !message.includes('超过 32 MB') || !window.confirm(`${message}\n\n是否使用大文件模式打开？预览、折叠和部分语法功能会关闭。`)) throw error;
        file = await window.qingyue.readLargeFile(selected);
      }
      setDocument(file.name, file.path, file.content, file.encoding, Boolean(file.largeMode));
      if (file.largeMode) showToast('已启用大文件模式：关闭预览、自动换行及部分语法分析，以保持流畅');
    }
    rememberRecent(selected);
    showToast(`已打开 ${selected.split(/[\\/]/).pop()}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  }
}

async function saveCurrent(saveAs = false): Promise<boolean> {
  if (!activeTab()) { showToast('请先打开或新建文档'); return false; }
  if (currentDocumentKind !== 'text') return saveOffice(saveAs);
  let destination = currentPath;
  if (!destination || saveAs) destination = await window.qingyue.saveAsDialog(currentName === '欢迎使用轻阅.md' ? '未命名.md' : currentName);
  if (!destination) return false;
  try {
    const result = await window.qingyue.writeFile({ path: destination, content: editor.getValue(), encoding: currentEncoding });
    const newName = result.name || destination.split(/[\\/]/).pop() || currentName;
    if (destination !== currentPath || newName !== currentName) {
      currentPath = destination;
      currentName = newName;
      const tab = activeTab();
      if (tab) { tab.path = destination; tab.name = newName; }
      filenameEl.textContent = newName;
      setDirty(false);
    } else setDirty(false);
    rememberRecent(destination);
    showToast('文件已保存');
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
    return false;
  }
}

async function saveOffice(saveAs = false): Promise<boolean> {
  if (!currentPath) return false;
  const sourcePath = currentPath;
  let destination: string | null = sourcePath;
  if (saveAs || officeCopyRequired) destination = await window.qingyue.saveAsDialog(copySuggestedName(currentName));
  if (!destination) return false;
  if (officeCopyRequired && destination.toLowerCase() === sourcePath.toLowerCase()) {
    showToast('为保护原文件，请换一个文件名保存副本', 'error');
    return false;
  }
  try {
    if (currentDocumentKind === 'docx') await window.qingyue.writeDocx({ path: destination, blocks: serializeWordBlocks() });
    else await window.qingyue.writeXlsx({ path: destination, sourcePath, changes: [...excelChanges.values()] });
    currentPath = destination;
    currentName = destination.split(/[\\/]/).pop() || currentName;
    filenameEl.textContent = currentName;
    officeCopyRequired = false;
    const tab = activeTab();
    if (tab) { tab.path = destination; tab.name = currentName; tab.officeCopyRequired = false; }
    if (currentDocumentKind === 'xlsx') {
      for (const change of excelChanges.values()) {
        const sheet = excelSheets.find((item) => item.name === change.sheetName);
        const cell = sheet?.rows[change.row - 1]?.[change.column - 1];
        if (cell) cell.value = change.value;
      }
    }
    excelChanges.clear();
    revealButton.hidden = false;
    setDirty(false);
    updateStats();
    rememberRecent(destination);
    showToast('副本已保存，可继续编辑');
    return true;
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
    return false;
  }
}

function newFile() {
  setDocument('未命名.md', null, '', 'utf8');
  applyView('edit');
}

async function formatDocument() {
  if (__LITE__ || !activeTab()) return;
  const language = editor.getModel()?.getLanguageId();
  const before = editor.getValue();
  if (language === 'yaml') {
    try {
      const YAML = await import('yaml');
      const parsed = YAML.parseDocument(before);
      if (parsed.errors.length) throw parsed.errors[0];
      const text = parsed.toString({ indent: 2 });
      if (text !== before) editor.executeEdits('format-yaml', [{ range: editor.getModel()!.getFullModelRange(), text }]);
      showToast(text === before ? '格式已规范，无需修改' : 'YAML 已格式化（缩进与排版）');
    } catch (error) { showToast('YAML 格式错误：' + String(error), 'error'); }
    return;
  }
  if (language === 'json') {
    try {
      const parsed = JSON.parse(editor.getValue());
      editor.executeEdits('format-json', [{ range: editor.getModel()!.getFullModelRange(), text: `${JSON.stringify(parsed, null, 2)}\n` }]);
      showToast(editor.getValue() === before ? '格式已规范，无需修改' : 'JSON 已格式化（缩进与换行）');
      return;
    } catch { /* Let Monaco attempt JSONC-aware formatting. */ }
  }
  const action = editor.getAction('editor.action.formatDocument');
  if (action?.isSupported()) {
    try { await action.run(); showToast(editor.getValue() === before ? '没有格式变化：内容可能已规范，或有语法错误' : '已整理缩进与换行，不改变代码含义'); }
    catch (error) { showToast('格式化失败：' + String(error), 'error'); }
  } else showToast('此格式没有可用的格式化器；支持 JSON/JSONC、JS/TS、CSS、HTML、YAML。Markdown 预览不需要格式化。');
}

function rememberRecent(filePath: string) {
  const recents = JSON.parse(localStorage.getItem('qingyue-recents') || '[]') as string[];
  localStorage.setItem('qingyue-recents', JSON.stringify([filePath, ...recents.filter((item) => item !== filePath)].slice(0, 10)));
}

function showToast(message: string, type: 'normal' | 'error' = 'normal') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.querySelector('#toast-region')!.append(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}

async function toggleFullscreen(force?: boolean) {
  const enabled = force ?? !(await window.qingyue.getFullscreen());
  if (enabled && (currentDocumentKind !== 'text' || !markdownDocument)) return showToast('请先打开 Markdown 文件');
  if (enabled) {
    viewBeforeFullscreen = currentView;
    setOutlineOpen(false);
    applyView('preview');
    appShell.classList.add('fullscreen-reading');
  } else {
    appShell.classList.remove('fullscreen-reading');
    applyView(viewBeforeFullscreen);
  }
  await window.qingyue.setFullscreen(enabled);
}

async function showSettings() {
  settingsModal.hidden = false;
  document.querySelector<HTMLSelectElement>('#default-view-select')!.value = startupSettings.defaultView;
  document.querySelector<HTMLSelectElement>('#startup-mode-select')!.value = startupSettings.startupMode;
  document.querySelector<HTMLInputElement>('#remember-folder-check')!.checked = startupSettings.rememberFolder;
  const description = document.querySelector<HTMLElement>('#association-description')!;
  const button = document.querySelector<HTMLButtonElement>('#association-button')!;
  try {
    const [status, info, update] = await Promise.all([window.qingyue.getAssociationStatus(), window.qingyue.getAppInfo(), window.qingyue.getUpdateState()]);
    lastAppInfo = info;
    button.dataset.registered = String(status.registered);
    button.textContent = status.registered ? '移除文件关联' : '注册文件关联';
    button.classList.toggle('danger-quiet', status.registered);
    button.classList.toggle('primary', !status.registered);
    description.textContent = status.registered ? '已注册。资源管理器右键“打开方式”中只显示“轻阅”，可执行脚本除外。' : info.packaged ? '尚未注册。注册后可从资源管理器直接打开支持的安全文件类型。' : '开发模式不能注册，请先生成便携版或安装版。';
    button.disabled = !info.packaged;
    document.querySelector<HTMLElement>('#app-version')!.textContent = `${__LITE__ ? '轻阅 Lite' : '轻阅'} ${info.version} · ${info.portable ? '便携运行' : info.updateCapable ? '安装版' : '开发模式'}`;
    renderUpdateState(update);
  } catch (error) {
    description.textContent = error instanceof Error ? error.message : String(error);
  }
}

function updateBytes(value: number) {
  if (!value) return '0 MB';
  return `${(value / 1024 / 1024).toFixed(value > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function renderUpdateState(state: UpdateState) {
  lastUpdateState = state;
  const description = document.querySelector<HTMLElement>('#update-description')!;
  const button = document.querySelector<HTMLButtonElement>('#update-button')!;
  const progress = document.querySelector<HTMLElement>('#update-progress')!;
  const progressBar = progress.querySelector<HTMLElement>('span')!;
  if (!state.supported) {
    description.textContent = lastAppInfo?.portable
      ? '便携版保留免安装方式，不自动覆盖；可前往发布页下载新版。'
      : '开发模式不检查更新。安装版会识别当前目录并原位升级。';
    button.textContent = lastAppInfo?.portable ? '查看新版本' : '检查更新';
    button.disabled = !lastAppInfo?.portable;
    button.dataset.action = lastAppInfo?.portable ? 'releases' : 'disabled';
    progress.hidden = true;
    return;
  }
  description.textContent = state.status === 'downloading' && state.total
    ? `${state.message} · ${updateBytes(state.transferred)} / ${updateBytes(state.total)}`
    : state.message || `安装目录：${state.installDirectory}；设置保存在独立数据目录，升级不会清空。`;
  progress.hidden = state.status !== 'downloading';
  progressBar.style.width = `${Math.max(0, Math.min(100, state.percent || 0))}%`;
  button.disabled = state.status === 'checking' || state.status === 'downloading';
  button.dataset.action = state.status === 'available' ? 'download' : state.status === 'ready' ? 'install' : 'check';
  button.textContent = state.status === 'available' ? '下载更新' : state.status === 'ready' ? '重启并安装' : state.status === 'checking' ? '检查中…' : state.status === 'downloading' ? '下载中…' : '检查更新';
}

function showUtility(title: string) {
  activeUtilityCleanup?.(); activeUtilityCleanup = null;
  utilityModal.querySelector('.utility-card')?.classList.remove('wide');
  utilityModal.querySelector('.utility-card')?.classList.remove('creative-card');
  utilityTitle.textContent = title;
  utilityContent.innerHTML = '';
  utilityModal.hidden = false;
  return utilityContent;
}

function currentIdentity() {
  return currentPath || activeTabId || currentName;
}

async function showHistory() {
  const content = showUtility(`历史版本 · ${currentName}`);
  content.innerHTML = '<div class="utility-empty">正在读取历史版本…</div>';
  const items = await window.qingyue.listHistory(currentIdentity());
  content.innerHTML = '';
  if (!items.length) return void (content.innerHTML = '<div class="utility-empty">暂无历史版本。编辑约 5 秒后会自动生成快照。</div>');
  items.forEach((item) => {
    const row = document.createElement('div'); row.className = 'utility-row';
    row.innerHTML = `<span>${new Date(item.timestamp).toLocaleString()}</span><span>${escapeHtml(item.name)}</span>`;
    const restore = document.createElement('button'); restore.className = 'button ghost'; restore.textContent = '恢复到新标签';
    restore.addEventListener('click', async () => {
      const snapshot = await window.qingyue.readHistory({ identity: currentIdentity(), file: item.file });
      createTextTab(`${snapshot.name}-恢复`, null, snapshot.content, 'utf8', false, true);
      utilityModal.hidden = true;
    });
    row.append(restore); content.append(row);
  });
}

function toggleBookmarkAtCurrentLine() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'text') return showToast('当前文件不支持书签');
  const line = editor.getPosition()?.lineNumber || 1;
  const existing = tab.bookmarks.indexOf(line);
  if (existing >= 0) { tab.bookmarks.splice(existing, 1); showToast(`已移除第 ${line} 行书签`); }
  else { tab.bookmarks.push(line); tab.bookmarks.sort((a, b) => a - b); showToast(`已添加第 ${line} 行书签`); }
  renderDocumentMarkers(); scheduleSessionSave();
}

function showBookmarks() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'text') return showToast('当前文件不支持书签');
  const line = editor.getPosition()?.lineNumber || 1;
  const content = showUtility(`书签管理 · ${currentName}`);
  const actions = document.createElement('div'); actions.className = 'utility-manager-bar';
  const currentBookmarked = tab.bookmarks.includes(line);
  actions.innerHTML = `<span>当前光标：第 ${line} 行</span>`;
  const toggle = document.createElement('button'); toggle.className = currentBookmarked ? 'button danger-quiet' : 'button primary';
  toggle.textContent = currentBookmarked ? '移除当前位置书签' : '添加当前位置书签';
  toggle.addEventListener('click', () => {
    if (currentBookmarked) tab.bookmarks = tab.bookmarks.filter((item) => item !== line); else tab.bookmarks.push(line);
    tab.bookmarks.sort((a, b) => a - b); renderDocumentMarkers(); scheduleSessionSave(); showBookmarks();
  });
  actions.append(toggle); content.append(actions);
  if (!tab.bookmarks.length) content.insertAdjacentHTML('beforeend', '<div class="utility-empty">当前文档没有书签。先把光标放到目标行，再点击“添加当前位置书签”。</div>');
  tab.bookmarks.forEach((bookmarkLine) => {
    const row = document.createElement('div'); row.className = 'utility-row marker-row';
    row.innerHTML = `<i class="codicon codicon-bookmark marker-icon bookmark"></i><div class="marker-copy"><strong>第 ${bookmarkLine} 行</strong><span>${escapeHtml(tab.model?.getLineContent(bookmarkLine).trim().slice(0, 120) || '空行')}</span></div>`;
    const jump = document.createElement('button'); jump.className = 'button ghost'; jump.textContent = '跳转';
    jump.addEventListener('click', () => jumpToSourceLine(bookmarkLine));
    const remove = document.createElement('button'); remove.className = 'button danger-quiet'; remove.textContent = '删除';
    remove.addEventListener('click', () => { tab.bookmarks = tab.bookmarks.filter((item) => item !== bookmarkLine); renderDocumentMarkers(); scheduleSessionSave(); showBookmarks(); });
    row.append(jump, remove); content.append(row);
  });
}

function startQuickAnnotation() {
  showAnnotations();
  requestAnimationFrame(() => utilityContent.querySelector<HTMLTextAreaElement>('.annotation-composer textarea')?.focus());
}

function showAnnotations() {
  const tab = activeTab();
  if (!tab || tab.kind !== 'text') return showToast('当前文件不支持批注');
  const content = showUtility(`文档批注 · ${currentName}`);
  const currentLine = editor.getPosition()?.lineNumber || 1;
  const composer = document.createElement('div'); composer.className = 'annotation-composer';
  composer.innerHTML = `<label>给第 ${currentLine} 行添加批注<textarea placeholder="记录想法、疑问或待办事项"></textarea></label><button class="button primary">添加批注</button>`;
  composer.querySelector('button')!.addEventListener('click', () => {
    const input = composer.querySelector('textarea')!;
    if (!input.value.trim()) return;
    tab.annotations.push({ id: newTabId(), line: currentLine, text: input.value.trim(), createdAt: Date.now() });
    renderDocumentMarkers(); scheduleSessionSave(); showAnnotations();
  });
  content.append(composer);
  if (!tab.annotations.length) content.insertAdjacentHTML('beforeend', '<div class="utility-empty">暂无批注。</div>');
  tab.annotations.forEach((note) => {
    const row = document.createElement('div'); row.className = 'utility-row marker-row';
    const source = tab.model?.getLineContent(note.line).trim().slice(0, 100) || '空行';
    row.innerHTML = `<i class="codicon codicon-comment-discussion marker-icon annotation"></i><div class="marker-copy"><strong>第 ${note.line} 行 · ${new Date(note.createdAt).toLocaleString()}</strong><span>${escapeHtml(source)}</span><em>${escapeHtml(note.text)}</em></div>`;
    const jump = document.createElement('button'); jump.className = 'button ghost'; jump.textContent = '跳转';
    jump.addEventListener('click', () => jumpToSourceLine(note.line));
    const edit = document.createElement('button'); edit.className = 'button ghost'; edit.textContent = '编辑';
    edit.addEventListener('click', () => { const next = window.prompt('编辑批注', note.text); if (next?.trim()) { note.text = next.trim(); renderDocumentMarkers(); scheduleSessionSave(); showAnnotations(); } });
    const remove = document.createElement('button'); remove.className = 'button danger-quiet'; remove.textContent = '删除';
    remove.addEventListener('click', () => { tab.annotations = tab.annotations.filter((item) => item.id !== note.id); renderDocumentMarkers(); scheduleSessionSave(); showAnnotations(); });
    row.append(jump, edit, remove); content.append(row);
  });
}

function showHelp() {
  const content = showUtility('轻阅使用帮助');
  content.innerHTML = `
    <div class="help-grid">
      <section><i class="codicon codicon-files"></i><div><h3>打开与管理</h3><p>拖入文件，或按 <kbd>Ctrl+O</kbd> 打开。文件夹面板可搜索文件名以及${__LITE__ ? '文本' : '文本、Word、Excel'}内容。</p></div></section>
      <section><i class="codicon codicon-preview"></i><div><h3>阅读与缩放</h3><p>Markdown 可切换分栏、阅读和全屏。按住 Ctrl 滚轮，或使用右下角按钮缩放。</p></div></section>
      <section><i class="codicon codicon-bookmark"></i><div><h3>书签与批注</h3><p>先把光标放到目标行，再打开书签或批注管理器。列表可跳转、编辑和删除。</p></div></section>
      <section><i class="codicon codicon-history"></i><div><h3>启动与恢复</h3><p>设置中可保存默认布局、选择空白/无文档/恢复历史启动，并选择记住文件夹。全新启动不删除恢复快照，可点“恢复上次标签”找回。</p></div></section>
      <section><i class="codicon codicon-unmute"></i><div><h3>朗读</h3><p>点击“朗读”选择系统语音并拖动进度。未选文字时，从当前可见段落或编辑光标处开始。</p></div></section>
      <section><i class="codicon codicon-keyboard"></i><div><h3>阅读按键</h3><p><kbd>←</kbd>/<kbd>→</kbd>、<kbd>PageUp</kbd>/<kbd>PageDown</kbd> 整页翻阅；<kbd>↑</kbd>/<kbd>↓</kbd> 小幅滚动。</p></div></section>
      ${__LITE__ ? '<section><i class="codicon codicon-edit"></i><div><h3>轻量编辑</h3><p>使用精简文本编辑器，不加载 IDE 语言服务。Ctrl+F 查找，Enter 下一处，Shift+Enter 上一处；单文件上限 32 MB。</p></div></section>' : '<section><i class="codicon codicon-symbol-color"></i><div><h3>白板与导图</h3><p>点击顶部调色板图标，新建本地白板、思维导图，或打开图片和音频。所有内容都保存在本机。</p></div></section>'}
      <section><i class="codicon codicon-attach"></i><div><h3>插入附件</h3><p>在 Markdown 中点击回形针，附件会复制到同名 .assets 文件夹并插入相对链接。</p></div></section>
    </div>
    <div class="shortcut-grid">
      <span><kbd>${shortcutDisplay(shortcutFor('bookmark'))}</kbd> 添加/移除书签</span><span><kbd>${shortcutDisplay(shortcutFor('annotation'))}</kbd> 快速批注</span>
      <span><kbd>${shortcutDisplay(shortcutFor('viewEdit'))} / ${shortcutDisplay(shortcutFor('viewSplit'))} / ${shortcutDisplay(shortcutFor('viewPreview'))}</kbd> 编辑/分栏/阅读</span><span><kbd>${shortcutDisplay(shortcutFor('projectSearch'))}</kbd> 文件夹搜索</span>
      ${__LITE__ ? '' : `<span><kbd>${shortcutDisplay(shortcutFor('diff'))}</kbd> 文件对比</span>`}<span><kbd>${shortcutDisplay(shortcutFor('export'))}</kbd> 导出</span>
      <span><kbd>${shortcutDisplay(shortcutFor('speech'))}</kbd> 朗读设置</span><span><kbd>${shortcutDisplay(shortcutFor('closeTab'))}</kbd> 关闭当前标签</span>
      <span><kbd>${shortcutDisplay(shortcutFor('nextTab'))}</kbd> 下一个标签</span><span><kbd>${shortcutDisplay(shortcutFor('help'))}</kbd> 打开帮助</span>
    </div>`;
}

function runShortcutCommand(id: string) {
  if (id === 'open') void openFile();
  else if (id === 'save') void saveCurrent(false);
  else if (id === 'saveAs') void saveCurrent(true);
  else if (id === 'new') void newFile();
  else if (id === 'bookmark') toggleBookmarkAtCurrentLine();
  else if (id === 'annotation') startQuickAnnotation();
  else if (id === 'diff') void compareCurrent();
  else if (id === 'export') showExportMenu();
  else if (id === 'speech') showSpeechPanel();
  else if (id === 'history') void showHistory();
  else if (id === 'outline') setOutlineOpen(!outlinePanel.classList.contains('open'));
  else if (id === 'projectSearch') { setProjectOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#project-query')?.focus()); }
  else if (id === 'viewEdit') applyView('edit');
  else if (id === 'viewSplit') applyView('split');
  else if (id === 'viewPreview') applyView('preview');
  else if (id === 'closeTab') void closeTabs([activeTabId]);
  else if (id === 'nextTab' || id === 'previousTab') {
    if (tabs.length < 2) return;
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const direction = id === 'previousTab' ? -1 : 1;
    activateTab(tabs[(index + direction + tabs.length) % tabs.length].id);
  } else if (id === 'format') formatDocument();
  else if (id === 'fullscreen') void toggleFullscreen();
  else if (id === 'help') showHelp();
}

function showShortcutManager() {
  settingsModal.hidden = true;
  const content = showUtility('自定义快捷键');
  utilityModal.querySelector('.utility-card')?.classList.add('wide');
  const values: Record<string, string> = Object.fromEntries(shortcutCommands.map((item) => [item.id, shortcutFor(item.id)]));
  content.innerHTML = `<p class="shortcut-manager-hint">快捷键只在轻阅窗口内生效，不注册为 Windows 全局热键。点击输入框后按下新组合；重复组合会被阻止。</p><div class="shortcut-manager">${shortcutCommands.map((item) => `<label><span>${escapeHtml(item.label)}</span><input class="shortcut-capture" data-shortcut-id="${item.id}" readonly value="${escapeHtml(shortcutDisplay(values[item.id]))}" title="点击后按下快捷键"></label>`).join('')}</div><p class="shortcut-manager-status" id="shortcut-manager-status"></p><div class="modal-actions"><button class="button ghost" id="shortcut-reset">恢复默认</button><button class="button primary" id="shortcut-save">保存快捷键</button></div>`;
  const status = content.querySelector<HTMLElement>('#shortcut-manager-status')!;
  const refreshInputs = () => content.querySelectorAll<HTMLInputElement>('.shortcut-capture').forEach((input) => { input.value = shortcutDisplay(values[input.dataset.shortcutId!]); });
  content.querySelectorAll<HTMLInputElement>('.shortcut-capture').forEach((input) => input.addEventListener('keydown', (event) => {
    event.preventDefault(); event.stopPropagation();
    const signature = shortcutSignature(event);
    if (!signature) return;
    const duplicate = Object.entries(values).find(([id, value]) => id !== input.dataset.shortcutId && value === signature);
    if (duplicate) {
      const definition = shortcutCommands.find((item) => item.id === duplicate[0]);
      status.textContent = `“${shortcutDisplay(signature)}”已用于“${definition?.label || duplicate[0]}”，请选择其他组合。`;
      status.classList.add('error'); return;
    }
    values[input.dataset.shortcutId!] = signature; input.value = shortcutDisplay(signature);
    status.textContent = `已设置 ${shortcutDisplay(signature)}，点击“保存快捷键”生效。`; status.classList.remove('error');
  }));
  content.querySelector('#shortcut-reset')!.addEventListener('click', () => {
    shortcutCommands.forEach((item) => { values[item.id] = item.defaultShortcut; }); refreshInputs(); status.textContent = '已恢复默认组合，点击保存后生效。'; status.classList.remove('error');
  });
  content.querySelector('#shortcut-save')!.addEventListener('click', () => {
    const overrides = Object.fromEntries(shortcutCommands.filter((item) => values[item.id] !== item.defaultShortcut).map((item) => [item.id, values[item.id]]));
    localStorage.setItem('qingyue-shortcuts', JSON.stringify(overrides)); utilityModal.hidden = true; showToast('快捷键已保存');
  });
}

function showCreativeMenu() {
  if (__LITE__) return;
  const content = showUtility('创作与媒体工具');
  content.innerHTML = `<div class="creative-menu">
    <button id="creative-whiteboard"><i class="codicon codicon-edit"></i><strong>新建白板</strong><span>自由书写、形状、连线、便签和图片</span></button>
    <button id="creative-mindmap"><i class="codicon codicon-type-hierarchy"></i><strong>新建思维导图</strong><span>创建节点、拖动调整并保存本地导图</span></button>
    <button id="creative-open"><i class="codicon codicon-folder-opened"></i><strong>打开创作文件</strong><span>Excalidraw、XMind、FreeMind、OPML、图片和音频</span></button>
    <button id="creative-image"><i class="codicon codicon-file-media"></i><strong>图片工具</strong><span>缩放、旋转、翻转、亮度和对比度</span></button>
  </div>`;
  content.querySelector('#creative-whiteboard')!.addEventListener('click', () => void showWhiteboard());
  content.querySelector('#creative-mindmap')!.addEventListener('click', () => void showMindMap());
  content.querySelector('#creative-open')!.addEventListener('click', async () => { const selected = await window.qingyue.openDialog(); if (selected) void openCreativeFile(selected); });
  content.querySelector('#creative-image')!.addEventListener('click', async () => { const selected = await window.qingyue.openDialog(); if (selected) void showImageEditor(selected); });
}

async function openCreativeFile(filePath: string) {
  if (__LITE__) return;
  const extension = extensionOf(filePath);
  if (extension === '.excalidraw') return showWhiteboard(filePath);
  if (['.mindmap', '.smm', '.xmind', '.mm', '.opml'].includes(extension)) return showMindMap(filePath);
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].includes(extension)) return showImageEditor(filePath);
  if (['.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(extension)) return showAudioPlayer(filePath);
  showToast('请选择白板、思维导图、图片或音频文件', 'error');
}

async function showWhiteboard(filePath?: string) {
  if (__LITE__) return;
  try {
    const lockWhiteboardTool = (appState: any = {}) => ({
      ...appState,
      viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
      activeTool: { type: appState.activeTool?.type || 'selection', lastActiveTool: appState.activeTool?.lastActiveTool ?? null, locked: true, customType: appState.activeTool?.customType ?? null },
    });
    let scene: any = { type: 'excalidraw', version: 2, source: 'qingyue', elements: [], appState: lockWhiteboardTool(), files: {} };
    if (filePath) {
      const stat = await window.qingyue.statFile(filePath);
      if (stat.size > 25 * 1024 * 1024) throw new Error('白板文件超过 25 MB，已阻止加载以避免崩溃。');
      scene = JSON.parse((await window.qingyue.readFile(filePath)).content);
      if (!Array.isArray(scene.elements)) throw new Error('不是有效的 Excalidraw 白板文件。');
      scene.appState = lockWhiteboardTool(scene.appState);
    }
    const content = showUtility(filePath ? `白板 · ${filePath.split(/[\\/]/).pop()}` : '新建白板');
    const card = utilityModal.querySelector('.utility-card')!; card.classList.add('wide', 'creative-card');
    content.innerHTML = `<div class="creative-toolbar"><span>本地离线白板</span><label class="whiteboard-tool-lock"><input id="whiteboard-tool-lock" type="checkbox" checked> 连续使用当前工具</label><button class="button ghost" id="whiteboard-new">清空</button><button class="button primary" id="whiteboard-save"><i class="codicon codicon-save"></i> 保存白板</button></div><div class="creative-host excalidraw-host" id="whiteboard-host"><div class="creative-loading">正在载入白板组件…</div></div>`;
    await import('@excalidraw/excalidraw/index.css');
    const ReactModule: any = await import('react');
    const ReactDomModule: any = await import('react-dom/client');
    const ExcalidrawModule: any = await import('@excalidraw/excalidraw');
    const host = content.querySelector<HTMLElement>('#whiteboard-host')!;
    const root = ReactDomModule.createRoot(host);
    let currentScene = scene;
    let api: any = null;
    let keepToolSelected = true;
    let syncingToolLock = false;
    const keepActiveToolLocked = (activeTool: any) => {
      if (!api || syncingToolLock || !keepToolSelected || !activeTool || activeTool.locked || activeTool.type === 'selection') return;
      syncingToolLock = true;
      queueMicrotask(() => {
        const tool = activeTool.type === 'custom' ? { type: 'custom', customType: activeTool.customType, locked: true } : { type: activeTool.type, locked: true };
        api?.setActiveTool(tool);
        syncingToolLock = false;
      });
    };
    root.render(ReactModule.createElement(ExcalidrawModule.Excalidraw, {
      initialData: { elements: scene.elements || [], appState: lockWhiteboardTool(scene.appState), files: scene.files || {} },
      langCode: 'zh-CN', theme: appShell.dataset.theme === 'dark' ? 'dark' : 'light',
      excalidrawAPI: (value: any) => { api = value; },
      onChange: (elements: any, appState: any, files: any) => {
        keepActiveToolLocked(appState.activeTool);
        currentScene = { type: 'excalidraw', version: 2, source: 'qingyue', elements, appState: { ...appState, collaborators: undefined, activeTool: { ...appState.activeTool, locked: keepToolSelected && appState.activeTool?.type !== 'selection' } }, files };
      },
    }));
    activeUtilityCleanup = () => root.unmount();
    content.querySelector<HTMLInputElement>('#whiteboard-tool-lock')!.addEventListener('change', (event) => {
      keepToolSelected = (event.target as HTMLInputElement).checked;
      const activeTool = currentScene.appState?.activeTool;
      if (activeTool && activeTool.type !== 'selection') api?.setActiveTool(activeTool.type === 'custom' ? { type: 'custom', customType: activeTool.customType, locked: keepToolSelected } : { type: activeTool.type, locked: keepToolSelected });
    });
    content.querySelector('#whiteboard-new')!.addEventListener('click', () => { if (window.confirm('确定清空当前白板吗？')) api?.resetScene(); });
    content.querySelector('#whiteboard-save')!.addEventListener('click', async () => {
      const destination = filePath || await window.qingyue.saveAsDialog('未命名白板.excalidraw');
      if (!destination) return;
      await window.qingyue.writeFile({ path: destination, content: JSON.stringify(currentScene, null, 2), encoding: 'utf8' });
      filePath = destination; showToast('白板已保存');
    });
  } catch (error) { showToast(`白板打开失败：${error instanceof Error ? error.message : String(error)}`, 'error'); }
}

function parseOutlineMindMap(xml: string, extension: string): any {
  const documentValue = new DOMParser().parseFromString(xml, 'text/xml');
  if (documentValue.querySelector('parsererror')) throw new Error('导图 XML 格式无效。');
  const rootElement = extension === '.mm' ? documentValue.querySelector('map > node') : documentValue.querySelector('body > outline');
  if (!rootElement) throw new Error(extension === '.mm' ? '未找到 FreeMind 根节点。' : '未找到 OPML 根节点。');
  const convert = (element: Element): any => ({
    data: { text: element.getAttribute(extension === '.mm' ? 'TEXT' : 'text') || element.getAttribute('title') || '未命名节点' },
    children: [...element.children].filter((child) => child.tagName.toLowerCase() === (extension === '.mm' ? 'node' : 'outline')).map(convert),
  });
  return convert(rootElement);
}

function countMindMapNodes(node: any): number {
  if (!node || typeof node !== 'object') return 0;
  return 1 + (Array.isArray(node.children) ? node.children.reduce((sum: number, child: any) => sum + countMindMapNodes(child), 0) : 0);
}

async function showMindMap(filePath?: string) {
  if (__LITE__) return;
  try {
    const MindMapModule: any = await import('simple-mind-map/full.js');
    const MindMap = MindMapModule.default;
    let data: any = { data: { text: '中心主题' }, children: [{ data: { text: '分支主题' }, children: [] }] };
    if (filePath) {
      const stat = await window.qingyue.statFile(filePath);
      if (stat.size > 40 * 1024 * 1024) throw new Error('思维导图超过 40 MB，已阻止加载以避免崩溃。');
      const extension = extensionOf(filePath);
      if (extension === '.xmind') {
        const binary = await window.qingyue.readBinary(filePath); const copy = new Uint8Array(binary.byteLength); copy.set(binary);
        data = await MindMap.xmind.parseXmindFile(new Blob([copy.buffer]));
      }
      else {
        const text = (await window.qingyue.readFile(filePath)).content;
        if (extension === '.mm' || extension === '.opml') data = parseOutlineMindMap(text, extension);
        else {
          const parsed = JSON.parse(text);
          data = parsed.type === 'qingyue-mindmap' ? parsed.data : parsed.root || parsed.data || parsed;
        }
      }
    }
    const nodeCount = countMindMapNodes(data);
    if (nodeCount > 8000) throw new Error(`导图包含 ${nodeCount} 个节点，超过 8000 节点安全上限。建议拆分后再编辑。`);
    const content = showUtility(filePath ? `思维导图 · ${filePath.split(/[\\/]/).pop()}` : '新建思维导图');
    utilityModal.querySelector('.utility-card')!.classList.add('wide', 'creative-card');
    content.innerHTML = `<div class="creative-toolbar"><span>${nodeCount} 个节点 · 双击节点编辑</span><button class="button ghost" data-mm-command="INSERT_CHILD_NODE">＋ 子节点</button><button class="button ghost" data-mm-command="INSERT_NODE">＋ 同级</button><button class="button ghost" data-mm-command="REMOVE_NODE">删除</button><button class="button ghost" data-mm-command="BACK">撤销</button><button class="button ghost" data-mm-command="FORWARD">重做</button><button class="button ghost" id="mindmap-fit">适应窗口</button><button class="button primary" id="mindmap-save"><i class="codicon codicon-save"></i> 保存</button><button class="button ghost" id="mindmap-xmind">导出 XMind</button></div><div class="creative-host mindmap-host" id="mindmap-host"></div>`;
    const host = content.querySelector<HTMLElement>('#mindmap-host')!;
    const mindMap: any = new MindMap({
      el: host, data, layout: 'mindMap', theme: 'default', enableFreeDrag: false,
      themeConfig: {
        paddingX: 22, paddingY: 12,
        root: { textAlign: 'center', paddingX: 28, paddingY: 16 },
        second: { textAlign: 'center', paddingX: 22, paddingY: 13 },
        node: { textAlign: 'center', paddingX: 18, paddingY: 10 },
      },
    });
    content.querySelectorAll<HTMLButtonElement>('[data-mm-command]').forEach((button) => button.addEventListener('click', () => mindMap.execCommand(button.dataset.mmCommand)));
    content.querySelector('#mindmap-fit')!.addEventListener('click', () => mindMap.view?.fit?.());
    content.querySelector('#mindmap-save')!.addEventListener('click', async () => {
      const destination = filePath && ['.mindmap', '.smm'].includes(extensionOf(filePath)) ? filePath : await window.qingyue.saveAsDialog('未命名导图.mindmap');
      if (!destination) return;
      const payload = { type: 'qingyue-mindmap', version: 1, data: mindMap.getData() };
      await window.qingyue.writeFile({ path: destination, content: JSON.stringify(payload, null, 2), encoding: 'utf8' });
      filePath = destination; showToast('思维导图已保存');
    });
    content.querySelector('#mindmap-xmind')!.addEventListener('click', async () => {
      const destination = await window.qingyue.saveAsDialog(`${(filePath?.split(/[\\/]/).pop() || '未命名导图').replace(/\.[^.]+$/, '')}.xmind`);
      if (!destination) return;
      const blob = await MindMap.xmind.transformToXmind(mindMap.getData(), destination.split(/[\\/]/).pop());
      await window.qingyue.writeBinary({ path: destination, data: new Uint8Array(await blob.arrayBuffer()) }); showToast('已导出 XMind');
    });
    const resize = () => mindMap.resize?.(); window.addEventListener('resize', resize);
    activeUtilityCleanup = () => { window.removeEventListener('resize', resize); mindMap.destroy?.(); };
  } catch (error) { showToast(`思维导图打开失败：${error instanceof Error ? error.message : String(error)}`, 'error'); }
}

async function showImageEditor(filePath: string) {
  if (__LITE__) return;
  try {
    const stat = await window.qingyue.statFile(filePath);
    if (stat.size > 48 * 1024 * 1024) throw new Error('图片超过 48 MB，已阻止加载以避免内存溢出。');
    const content = showUtility(`图片工具 · ${stat.name}`);
    utilityModal.querySelector('.utility-card')!.classList.add('wide', 'creative-card');
    content.innerHTML = `<div class="creative-toolbar image-toolbar"><button class="button ghost" data-image-action="rotate-left">↶ 左转</button><button class="button ghost" data-image-action="rotate-right">↷ 右转</button><button class="button ghost" data-image-action="flip-x">水平翻转</button><button class="button ghost" data-image-action="flip-y">垂直翻转</button><label>亮度 <input id="image-brightness" type="range" min="40" max="160" value="100"></label><label>对比度 <input id="image-contrast" type="range" min="40" max="160" value="100"></label><label>缩放 <input id="image-zoom" type="range" min="10" max="300" value="100"></label><button class="button ghost" data-image-action="reset">重置</button><button class="button primary" id="image-save">保存副本</button></div><div class="creative-host image-host"><canvas id="image-canvas"></canvas></div>`;
    const canvas = content.querySelector<HTMLCanvasElement>('#image-canvas')!; const context = canvas.getContext('2d')!;
    const image = new Image(); image.src = toAssetUrl(filePath); await image.decode();
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error(`图片分辨率 ${image.naturalWidth}×${image.naturalHeight} 过大，请先压缩后编辑。`);
    let rotation = 0; let flipX = 1; let flipY = 1; let brightness = 100; let contrast = 100; let zoom = 100;
    const draw = () => {
      const swap = Math.abs(rotation % 180) === 90; canvas.width = swap ? image.naturalHeight : image.naturalWidth; canvas.height = swap ? image.naturalWidth : image.naturalHeight;
      context.save(); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 180); context.scale(flipX, flipY); context.filter = `brightness(${brightness}%) contrast(${contrast}%)`; context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2); context.restore();
      canvas.style.width = `${canvas.width * zoom / 100}px`; canvas.style.height = `${canvas.height * zoom / 100}px`;
    };
    content.querySelectorAll<HTMLButtonElement>('[data-image-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.imageAction;
      if (action === 'rotate-left') rotation -= 90; else if (action === 'rotate-right') rotation += 90; else if (action === 'flip-x') flipX *= -1; else if (action === 'flip-y') flipY *= -1; else { rotation = 0; flipX = 1; flipY = 1; brightness = 100; contrast = 100; zoom = 100; (content.querySelector('#image-brightness') as HTMLInputElement).value = '100'; (content.querySelector('#image-contrast') as HTMLInputElement).value = '100'; (content.querySelector('#image-zoom') as HTMLInputElement).value = '100'; } draw();
    }));
    [['brightness', (value: number) => { brightness = value; }], ['contrast', (value: number) => { contrast = value; }], ['zoom', (value: number) => { zoom = value; }]].forEach(([name, setter]) => content.querySelector<HTMLInputElement>(`#image-${name}`)!.addEventListener('input', (event) => { (setter as (value: number) => void)(Number((event.target as HTMLInputElement).value)); draw(); }));
    content.querySelector('#image-save')!.addEventListener('click', async () => {
      const destination = await window.qingyue.saveAsDialog(`${stat.name.replace(/\.[^.]+$/, '')}-编辑.png`); if (!destination) return;
      const mime = /\.jpe?g$/i.test(destination) ? 'image/jpeg' : 'image/png';
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片编码失败')), mime, .92));
      await window.qingyue.writeBinary({ path: destination, data: new Uint8Array(await blob.arrayBuffer()) }); showToast('图片副本已保存');
    });
    draw();
  } catch (error) { showToast(`图片打开失败：${error instanceof Error ? error.message : String(error)}`, 'error'); }
}

async function showAudioPlayer(filePath: string) {
  try {
    const stat = await window.qingyue.statFile(filePath);
    const content = showUtility(`音频 · ${stat.name}`);
    content.innerHTML = `<div class="audio-player"><i class="codicon codicon-unmute"></i><strong>${escapeHtml(stat.name)}</strong><span>${(stat.size / 1024 / 1024).toFixed(1)} MB</span><audio controls preload="metadata" src="${toAssetUrl(filePath)}"></audio></div>`;
  } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
}

const droppedOpenExtensions = new Set([
  '.md', '.markdown', '.mdown', '.mkd', '.mdx', '.txt', '.log', '.json', '.jsonc', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.py', '.java',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.kts', '.sql', '.sh', '.bash', '.zsh', '.ps1', '.bat',
  '.cmd', '.properties', '.csv', '.tsv', '.docx', '.xlsx', '.excalidraw', '.mindmap', '.smm', '.xmind', '.mm', '.opml', '.png', '.jpg',
  '.jpeg', '.webp', '.gif', '.bmp', '.mp3', '.wav', '.m4a', '.ogg', '.flac',
]);
const droppedInsertExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.mp3', '.wav', '.m4a', '.ogg', '.flac']);

function isDroppedFileOpenable(filePath: string) {
  const base = filePath.split(/[\\/]/).pop()?.toLowerCase() || '';
  return droppedOpenExtensions.has(extensionOf(filePath)) || ['dockerfile', 'makefile', 'license', 'readme'].includes(base);
}

async function insertAttachment(sourcePath?: string) {
  if (currentDocumentKind !== 'text' || !markdownDocument) return showToast('请先打开 Markdown 文件');
  if (!currentPath && !(await saveCurrent(true))) return;
  if (!currentPath) return;
  const selected = sourcePath || await window.qingyue.openDialog(); if (!selected) return;
  try {
    const attached = await window.qingyue.attachFile({ source: selected, documentPath: currentPath });
    const extension = extensionOf(attached.name);
    const reference = encodeURI(attached.relative);
    const isAudio = isAudioReference(attached.name);
    const markup = droppedInsertExtensions.has(extension)
      ? `![${isAudio ? '音频：' : ''}${attached.name}](${reference})`
      : `[附件：${attached.name}](${reference})`;
    const position = editor.getPosition() || { lineNumber: 1, column: 1 };
    editor.executeEdits('insert-attachment', [{ range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: `\n${markup}\n`, forceMoveMarkers: true }]);
    editor.focus(); showToast(`已复制并插入 ${attached.name}`);
  } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
}

let fileDragDepth = 0;
function setFileDragActive(active: boolean) {
  appShell.classList.toggle('file-drag-active', active);
  fileDropOverlay.setAttribute('aria-hidden', String(!active));
}

window.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault(); fileDragDepth += 1; setFileDragActive(true);
});
window.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = currentDocumentKind === 'text' && markdownDocument && (event.target as Element | null)?.closest?.('.editor-pane') ? 'copy' : 'link';
  setFileDragActive(true);
});
window.addEventListener('dragleave', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (!fileDragDepth) setFileDragActive(false);
});
window.addEventListener('drop', async (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault(); fileDragDepth = 0; setFileDragActive(false);
  const droppedOnEditor = Boolean((event.target as Element | null)?.closest?.('.editor-pane'));
  const paths = [...event.dataTransfer.files].map((file) => {
    try { return window.qingyue.getPathForFile(file); } catch { return ''; }
  }).filter((filePath, index, all) => Boolean(filePath) && all.indexOf(filePath) === index);
  for (const filePath of paths) {
    const extension = extensionOf(filePath);
    if (droppedOnEditor && currentDocumentKind === 'text' && markdownDocument && (droppedInsertExtensions.has(extension) || !isDroppedFileOpenable(filePath))) await insertAttachment(filePath);
    else if (isDroppedFileOpenable(filePath)) await openFile(filePath);
    else showToast(`暂不支持直接打开 ${filePath.split(/[\\/]/).pop()}，可拖到 Markdown 编辑区作为附件插入`, 'error');
  }
});

function splitSpeechText(text: string, element?: HTMLElement, line?: number): SpeechQueueItem[] {
  return text.replace(/\s+/g, ' ').trim().match(/.{1,260}(?:[。！？；.!?;]|$)/g)?.map((part) => ({ text: part.trim(), element, line })).filter((part) => part.text) || [];
}

function firstVisibleSpeechElement(elements: HTMLElement[], scrollRoot: HTMLElement) {
  const rootRect = scrollRoot.getBoundingClientRect();
  const index = elements.findIndex((element) => element.getBoundingClientRect().bottom >= rootRect.top + 12);
  return index < 0 ? Math.max(0, elements.length - 1) : index;
}

function buildSpeechQueue(): { items: SpeechQueueItem[]; startIndex: number } {
  const selection = window.getSelection()?.toString().trim();
  if (selection) return { items: splitSpeechText(selection), startIndex: 0 };
  if (currentDocumentKind === 'docx') {
    const elements = [...wordEditor.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote,td')];
    const activeElement = firstVisibleSpeechElement(elements, officeScroll);
    const items = elements.flatMap((element, index) => splitSpeechText(element.innerText, element).map((item) => ({ ...item, line: index })));
    return { items, startIndex: Math.max(0, items.findIndex((item) => item.line === activeElement)) };
  }
  if (currentDocumentKind === 'xlsx') {
    const elements = [...excelEditor.querySelectorAll<HTMLElement>('tr')];
    const activeElement = firstVisibleSpeechElement(elements, officeScroll);
    const items = elements.flatMap((element, index) => splitSpeechText(element.innerText, element).map((item) => ({ ...item, line: index })));
    return { items, startIndex: Math.max(0, items.findIndex((item) => item.line === activeElement)) };
  }
  if (markdownDocument && currentView !== 'edit') {
    const elements = [...preview.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,li,blockquote,td')];
    const activeElement = firstVisibleSpeechElement(elements, previewScroll);
    const items = elements.flatMap((element, index) => splitSpeechText(element.innerText, element).map((item) => ({ ...item, line: index })));
    return { items, startIndex: Math.max(0, items.findIndex((item) => item.line === activeElement)) };
  }
  const selectionRange = editor.getSelection();
  const editorSelection = selectionRange ? editor.getModel()?.getValueInRange(selectionRange).trim() : '';
  if (editorSelection) return { items: splitSpeechText(editorSelection), startIndex: 0 };
  const items = editor.getValue().split(/\r?\n/).flatMap((line, index) => splitSpeechText(line, undefined, index + 1));
  const cursorLine = editor.getPosition()?.lineNumber || 1;
  const startIndex = items.findIndex((item) => (item.line || 1) >= cursorLine);
  return { items, startIndex: startIndex < 0 ? Math.max(0, items.length - 1) : startIndex };
}

function selectedSpeechVoice() {
  const name = localStorage.getItem('qingyue-speech-voice') || '';
  return window.speechSynthesis.getVoices().find((voice) => voice.name === name) || null;
}

function updateSpeechButton() {
  const active = window.speechSynthesis.speaking || speechPaused;
  document.querySelector<HTMLButtonElement>('#speech-button')!.classList.toggle('active', active);
}

function updateSpeechProgress(index = speechCurrentIndex >= 0 ? speechCurrentIndex : speechSelectedIndex) {
  const range = utilityContent.querySelector<HTMLInputElement>('#speech-progress');
  const label = utilityContent.querySelector<HTMLElement>('#speech-progress-value');
  const total = speechQueue.length;
  const safeIndex = total ? Math.min(total - 1, Math.max(0, index)) : 0;
  if (range) {
    range.max = String(Math.max(0, total - 1));
    range.value = String(safeIndex);
    range.disabled = total < 2;
  }
  if (label) label.textContent = total ? `第 ${safeIndex + 1} / ${total} 段 · ${Math.round(((safeIndex + 1) / total) * 100)}%` : '没有可朗读内容';
}

function stopSpeech(showMessage = false) {
  window.speechSynthesis.cancel();
  speechIndex = 0; speechCurrentIndex = -1; speechPaused = false;
  speechActiveElement?.classList.remove('speech-active-block'); speechActiveElement = null;
  updateSpeechButton(); updateSpeechProgress(speechSelectedIndex);
  if (showMessage) showToast('已停止朗读');
}

function speakNext() {
  speechActiveElement?.classList.remove('speech-active-block');
  const itemIndex = speechIndex;
  const item = speechQueue[speechIndex++];
  if (!item) { stopSpeech(); showToast('朗读完成'); return; }
  speechCurrentIndex = itemIndex; speechSelectedIndex = itemIndex;
  speechActiveElement = item.element || null;
  speechActiveElement?.classList.add('speech-active-block');
  speechActiveElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const utterance = new SpeechSynthesisUtterance(item.text);
  const voice = selectedSpeechVoice(); if (voice) utterance.voice = voice;
  utterance.rate = Number(localStorage.getItem('qingyue-speech-rate')) || 1;
  utterance.pitch = Number(localStorage.getItem('qingyue-speech-pitch')) || 1;
  utterance.volume = Number(localStorage.getItem('qingyue-speech-volume')) || 1;
  utterance.onend = () => { if (!speechPaused) speakNext(); };
  utterance.onerror = (event) => { if (event.error !== 'canceled' && event.error !== 'interrupted') showToast(`朗读失败：${event.error}`, 'error'); };
  window.speechSynthesis.speak(utterance);
  updateSpeechButton(); updateSpeechProgress(itemIndex);
}

function startSpeech(requestedIndex?: number) {
  window.speechSynthesis.cancel();
  speechActiveElement?.classList.remove('speech-active-block'); speechActiveElement = null;
  speechPaused = false; speechCurrentIndex = -1;
  const built = buildSpeechQueue();
  speechQueue = built.items;
  if (!speechQueue.length) return showToast('当前文档没有可朗读的内容');
  speechSelectedIndex = Math.min(speechQueue.length - 1, Math.max(0, typeof requestedIndex === 'number' ? requestedIndex : built.startIndex));
  speechIndex = speechSelectedIndex; updateSpeechProgress(); speakNext();
}

function toggleSpeechPause() {
  if (!window.speechSynthesis.speaking && !speechPaused) return startSpeech();
  if (speechPaused) { speechPaused = false; window.speechSynthesis.resume(); }
  else { speechPaused = true; window.speechSynthesis.pause(); }
  updateSpeechButton(); showSpeechPanel();
}

function showSpeechPanel() {
  const content = showUtility('朗读设置');
  if (!window.speechSynthesis.speaking && !speechPaused) {
    const built = buildSpeechQueue();
    speechQueue = built.items; speechSelectedIndex = built.startIndex; speechCurrentIndex = -1;
  }
  const voices = window.speechSynthesis.getVoices();
  const savedVoice = localStorage.getItem('qingyue-speech-voice') || '';
  content.innerHTML = `<div class="speech-settings">
    <div class="speech-progress-card"><div><strong>朗读进度</strong><span id="speech-progress-value"></span></div><input id="speech-progress" type="range" min="0" max="${Math.max(0, speechQueue.length - 1)}" step="1" value="${speechSelectedIndex}"><p>拖动到任意段落；点击开始后会从该位置继续朗读。</p></div>
    <label>语音<select id="speech-voice"><option value="">系统默认语音</option>${voices.map((voice) => `<option value="${escapeHtml(voice.name)}" ${voice.name === savedVoice ? 'selected' : ''}>${escapeHtml(voice.name)} · ${escapeHtml(voice.lang)}</option>`).join('')}</select></label>
    <label>语速 <span id="speech-rate-value">${localStorage.getItem('qingyue-speech-rate') || '1.0'}×</span><input id="speech-rate" type="range" min="0.5" max="2" step="0.1" value="${localStorage.getItem('qingyue-speech-rate') || '1'}"></label>
    <label>音调 <span id="speech-pitch-value">${localStorage.getItem('qingyue-speech-pitch') || '1.0'}</span><input id="speech-pitch" type="range" min="0.5" max="2" step="0.1" value="${localStorage.getItem('qingyue-speech-pitch') || '1'}"></label>
    <label>音量 <span id="speech-volume-value">${Math.round((Number(localStorage.getItem('qingyue-speech-volume')) || 1) * 100)}%</span><input id="speech-volume" type="range" min="0" max="1" step="0.1" value="${localStorage.getItem('qingyue-speech-volume') || '1'}"></label>
    <p class="speech-hint">这里显示 Windows 已安装语音。需要更多声音时，可在系统“时间和语言 → 语音”中添加。</p>
    <div class="modal-actions"><button class="button primary" id="speech-start"><i class="codicon codicon-play"></i> 从当前位置朗读</button><button class="button ghost" id="speech-pause"><i class="codicon codicon-debug-pause"></i> ${speechPaused ? '继续' : '暂停'}</button><button class="button danger-quiet" id="speech-stop"><i class="codicon codicon-debug-stop"></i> 停止</button></div>
  </div>`;
  content.querySelector<HTMLSelectElement>('#speech-voice')!.addEventListener('change', (event) => localStorage.setItem('qingyue-speech-voice', (event.target as HTMLSelectElement).value));
  const progress = content.querySelector<HTMLInputElement>('#speech-progress')!;
  progress.addEventListener('input', () => { speechSelectedIndex = Number(progress.value); updateSpeechProgress(speechSelectedIndex); });
  progress.addEventListener('change', () => {
    speechSelectedIndex = Number(progress.value);
    if (window.speechSynthesis.speaking || speechPaused) startSpeech(speechSelectedIndex);
  });
  ['rate', 'pitch', 'volume'].forEach((key) => content.querySelector<HTMLInputElement>(`#speech-${key}`)!.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value; localStorage.setItem(`qingyue-speech-${key}`, value);
    content.querySelector(`#speech-${key}-value`)!.textContent = key === 'rate' ? `${value}×` : key === 'volume' ? `${Math.round(Number(value) * 100)}%` : value;
  }));
  content.querySelector('#speech-start')!.addEventListener('click', () => startSpeech(speechSelectedIndex));
  content.querySelector('#speech-pause')!.addEventListener('click', toggleSpeechPause);
  content.querySelector('#speech-stop')!.addEventListener('click', () => stopSpeech(true));
  updateSpeechProgress();
}

async function validateCurrent(schemaPath?: string) {
  if (__LITE__) return;
  if (currentDocumentKind !== 'text') return showToast('当前文件类型不支持结构校验');
  const language = editor.getModel()?.getLanguageId();
  const content = showUtility(`结构校验 · ${currentName}`);
  try {
    let value: unknown;
    if (language === 'json') value = JSON.parse(editor.getValue());
    else if (language === 'yaml') {
      const YAML = await import('yaml');
      const documentValue = YAML.parseDocument(editor.getValue());
      if (documentValue.errors.length) throw new Error(documentValue.errors.map((error) => error.message).join('\n'));
      value = documentValue.toJS();
    } else throw new Error('请打开 JSON 或 YAML 文件。');
    content.innerHTML = '<div class="diagnostic-ok">✓ 语法和基础结构有效</div>';
    if (schemaPath) {
      const schemaFile = await window.qingyue.readFile(schemaPath);
      const schema = JSON.parse(schemaFile.content);
      const { default: Ajv } = await import('ajv');
      const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
      if (!validate(value)) {
        content.innerHTML = '';
        validate.errors?.forEach((error) => content.insertAdjacentHTML('beforeend', `<div class="diagnostic-error">${escapeHtml(`${error.instancePath || '/'} ${error.message || ''}`)}</div>`));
      } else content.insertAdjacentHTML('beforeend', '<div class="diagnostic-ok">✓ 通过所选 JSON Schema</div>');
    }
    if (language === 'json') {
      const schemaButton = document.createElement('button'); schemaButton.className = 'button ghost'; schemaButton.textContent = '选择 JSON Schema 继续校验';
      schemaButton.addEventListener('click', async () => { const selected = await window.qingyue.openDialog(); if (selected) validateCurrent(selected); });
      content.append(schemaButton);
    }
  } catch (error) {
    content.innerHTML = `<div class="diagnostic-error">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

async function compareCurrent() {
  if (__LITE__) return;
  if (currentDocumentKind !== 'text') return showToast('当前文件类型暂不支持文本对比');
  const selected = await window.qingyue.openDialog();
  if (!selected) return;
  try {
    const other = await window.qingyue.readFile(selected);
    if (other.content.length + editor.getValue().length > 8_000_000) throw new Error('参与对比的文本总量超过 8 MB。');
    const { diffArrays, diffWords, diffWordsWithSpace } = await import('diff');
    const content = showUtility(`差异对比 · ${other.name} → ${currentName}`);
    utilityModal.querySelector('.utility-card')?.classList.add('wide');
    type DiffRow = { kind: 'same' | 'added' | 'removed' | 'modified'; leftLine: number | null; rightLine: number | null; left: string; right: string };
    const leftLines = other.content.replace(/\r/g, '').split('\n');
    const rightLines = editor.getValue().replace(/\r/g, '').split('\n');
    if (leftLines.at(-1) === '') leftLines.pop();
    if (rightLines.at(-1) === '') rightLines.pop();
    let rows: DiffRow[] = [];
    let ignoreWhitespace = true;
    let mode: 'all' | 'changes' = 'changes';
    const enabledKinds = new Set<DiffRow['kind']>(['added', 'removed', 'modified']);
    const normalizeWhitespace = (line: string) => line.replace(/[\t\u00a0 ]+/g, ' ').trim();
    const buildRows = () => {
      const leftComparable = ignoreWhitespace ? leftLines.map(normalizeWhitespace) : leftLines;
      const rightComparable = ignoreWhitespace ? rightLines.map(normalizeWhitespace) : rightLines;
      const parts = diffArrays(leftComparable, rightComparable, { timeout: 3000 }) || [];
      const result: DiffRow[] = [];
      let leftIndex = 0; let rightIndex = 0;
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index]; const next = parts[index + 1];
        if ((part.removed && next?.added) || (part.added && next?.removed)) {
          const removedCount = (part.removed ? part : next).value.length;
          const addedCount = (part.added ? part : next).value.length;
          const removed = leftLines.slice(leftIndex, leftIndex + removedCount);
          const added = rightLines.slice(rightIndex, rightIndex + addedCount);
          for (let line = 0; line < Math.max(removedCount, addedCount); line += 1) {
            const hasLeft = line < removedCount; const hasRight = line < addedCount;
            result.push({ kind: hasLeft && hasRight ? 'modified' : hasLeft ? 'removed' : 'added', leftLine: hasLeft ? leftIndex + line + 1 : null, rightLine: hasRight ? rightIndex + line + 1 : null, left: removed[line] || '', right: added[line] || '' });
          }
          leftIndex += removedCount; rightIndex += addedCount; index += 1; continue;
        }
        const count = part.value.length;
        if (part.added) {
          for (let line = 0; line < count; line += 1) result.push({ kind: 'added', leftLine: null, rightLine: rightIndex + line + 1, left: '', right: rightLines[rightIndex + line] || '' });
          rightIndex += count;
        } else if (part.removed) {
          for (let line = 0; line < count; line += 1) result.push({ kind: 'removed', leftLine: leftIndex + line + 1, rightLine: null, left: leftLines[leftIndex + line] || '', right: '' });
          leftIndex += count;
        } else {
          for (let line = 0; line < count; line += 1) result.push({ kind: 'same', leftLine: leftIndex + line + 1, rightLine: rightIndex + line + 1, left: leftLines[leftIndex + line] || '', right: rightLines[rightIndex + line] || '' });
          leftIndex += count; rightIndex += count;
        }
      }
      return result;
    };
    content.innerHTML = `<div class="diff-summary"><div><strong>${escapeHtml(other.name)}</strong><i class="codicon codicon-arrow-right"></i><strong>${escapeHtml(currentName)}</strong></div><div class="diff-counts"><span class="modified" id="diff-modified-count"></span><span class="added" id="diff-added-count"></span><span class="removed" id="diff-removed-count"></span></div></div>
      <div class="diff-options"><label><input id="diff-ignore-whitespace" type="checkbox" checked> 忽略空格、Tab 与行首尾空白</label><div class="diff-kind-filters"><button data-diff-kind="modified" class="active modified">修改</button><button data-diff-kind="added" class="active added">新增</button><button data-diff-kind="removed" class="active removed">删除</button></div></div>
      <div class="diff-toolbar"><div class="diff-mode"><button data-diff-mode="changes" class="active">仅差异</button><button data-diff-mode="all">全量显示</button></div><span id="diff-position">0 / 0</span><button class="button ghost" id="diff-previous"><i class="codicon codicon-arrow-up"></i> 上一处</button><button class="button ghost" id="diff-next">下一处 <i class="codicon codicon-arrow-down"></i></button></div>
      <div class="diff-columns"><strong>${escapeHtml(other.name)}（对比文件）</strong><strong>${escapeHtml(currentName)}（当前文件）</strong></div><div class="diff-view" id="diff-view"></div>`;
    const view = content.querySelector<HTMLElement>('#diff-view')!;
    let activeDifference = 0;
    const inlineMarkup = (row: DiffRow, side: 'left' | 'right') => {
      if (row.kind !== 'modified') return escapeHtml(side === 'left' ? row.left : row.right) || '&nbsp;';
      const words = ignoreWhitespace ? diffWords(row.left, row.right) : diffWordsWithSpace(row.left, row.right);
      return words.filter((word) => side === 'left' ? !word.added : !word.removed).map((word) => `<mark class="${word.added ? 'word-added' : word.removed ? 'word-removed' : ''}">${escapeHtml(word.value)}</mark>`).join('') || '&nbsp;';
    };
    const renderDiff = () => {
      const totals = { added: rows.filter((row) => row.kind === 'added').length, removed: rows.filter((row) => row.kind === 'removed').length, modified: rows.filter((row) => row.kind === 'modified').length };
      content.querySelector('#diff-modified-count')!.textContent = `修改 ${totals.modified}`;
      content.querySelector('#diff-added-count')!.textContent = `新增 ${totals.added}`;
      content.querySelector('#diff-removed-count')!.textContent = `删除 ${totals.removed}`;
      const visible = rows.filter((row) => row.kind === 'same' ? mode === 'all' : enabledKinds.has(row.kind));
      const differenceCount = visible.filter((row) => row.kind !== 'same').length;
      view.innerHTML = visible.length ? visible.map((row) => `<div class="diff-row diff-${row.kind}" data-difference="${row.kind !== 'same'}"><div class="diff-line-number">${row.leftLine ?? ''}</div><pre>${inlineMarkup(row, 'left')}</pre><div class="diff-status">${row.kind === 'modified' ? '修改' : row.kind === 'added' ? '新增' : row.kind === 'removed' ? '删除' : ''}</div><div class="diff-line-number">${row.rightLine ?? ''}</div><pre>${inlineMarkup(row, 'right')}</pre></div>`).join('') : `<div class="diagnostic-ok">${ignoreWhitespace ? '没有实际内容差异（空格与 Tab 差异已忽略）' : '两个文件内容完全一致'}</div>`;
      activeDifference = 0;
      const first = view.querySelector<HTMLElement>('[data-difference="true"]'); first?.classList.add('active-difference');
      content.querySelector('#diff-position')!.textContent = `${differenceCount ? '1' : '0'} / ${differenceCount}`;
    };
    const navigateDifference = (step: number) => {
      const differences = [...view.querySelectorAll<HTMLElement>('[data-difference="true"]')];
      if (!differences.length) return;
      differences[activeDifference]?.classList.remove('active-difference');
      activeDifference = (activeDifference + step + differences.length) % differences.length;
      differences[activeDifference].classList.add('active-difference'); differences[activeDifference].scrollIntoView({ block: 'center', behavior: 'smooth' });
      content.querySelector('#diff-position')!.textContent = `${activeDifference + 1} / ${differences.length}`;
    };
    content.querySelectorAll<HTMLButtonElement>('[data-diff-mode]').forEach((button) => button.addEventListener('click', () => {
      mode = button.dataset.diffMode as 'all' | 'changes'; content.querySelectorAll('[data-diff-mode]').forEach((item) => item.classList.toggle('active', item === button)); renderDiff();
    }));
    content.querySelectorAll<HTMLButtonElement>('[data-diff-kind]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.diffKind as DiffRow['kind'];
      if (enabledKinds.has(kind)) enabledKinds.delete(kind); else enabledKinds.add(kind);
      button.classList.toggle('active', enabledKinds.has(kind)); renderDiff();
    }));
    content.querySelector<HTMLInputElement>('#diff-ignore-whitespace')!.addEventListener('change', (event) => {
      ignoreWhitespace = (event.target as HTMLInputElement).checked; rows = buildRows(); renderDiff();
    });
    content.querySelector('#diff-previous')!.addEventListener('click', () => navigateDifference(-1));
    content.querySelector('#diff-next')!.addEventListener('click', () => navigateDifference(1));
    rows = buildRows(); renderDiff();
  } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
}

function activeExcelRowsForExport() {
  const sheet = excelSheets[activeSheetIndex];
  if (!sheet) return [] as string[][];
  return sheet.rows.map((row, rowIndex) => Array.from({ length: sheet.columnCount }, (_value, columnIndex) => {
    const change = excelChanges.get(excelChangeKey(sheet.name, rowIndex + 1, columnIndex + 1));
    return change?.value ?? row[columnIndex]?.value ?? '';
  }));
}

function plainTextForExport() {
  if (currentDocumentKind === 'docx') return wordEditor.innerText.trim();
  if (currentDocumentKind === 'xlsx') return activeExcelRowsForExport().map((row) => row.join('\t')).join('\n');
  return markdownDocument ? (preview.innerText.trim() || markdownToPlainText(editor.getValue())) : editor.getValue();
}

function markdownCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function rowsToMarkdownTable(rows: string[][]) {
  if (!rows.length) return '';
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: columns }, (_value, index) => markdownCell(row[index] || '')));
  return [`| ${normalized[0].join(' | ')} |`, `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`, ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function documentToMarkdown() {
  if (currentDocumentKind === 'text') return editor.getValue();
  if (currentDocumentKind === 'xlsx') return `# ${excelSheets[activeSheetIndex]?.name || currentName}\n\n${rowsToMarkdownTable(activeExcelRowsForExport())}\n`;
  const blocks = [...wordEditor.children].map((element) => {
    const text = (element as HTMLElement).innerText.trim();
    if (!text) return '';
    if (/^H[1-6]$/.test(element.tagName)) return `${'#'.repeat(Number(element.tagName.slice(1)))} ${text}`;
    if (element.tagName === 'UL') return [...element.querySelectorAll(':scope > li')].map((item) => `- ${(item as HTMLElement).innerText.trim()}`).join('\n');
    if (element.tagName === 'OL') return [...element.querySelectorAll(':scope > li')].map((item, index) => `${index + 1}. ${(item as HTMLElement).innerText.trim()}`).join('\n');
    if (element.tagName === 'TABLE') return rowsToMarkdownTable([...element.querySelectorAll('tr')].map((row) => [...row.children].map((cell) => (cell as HTMLElement).innerText.trim())));
    return text;
  }).filter(Boolean);
  return `${blocks.join('\n\n')}\n`;
}

function createExportRoot() {
  const root = document.createElement('article');
  root.className = 'document-content';
  if (currentDocumentKind === 'docx') root.append(...[...wordEditor.children].map((child) => child.cloneNode(true)));
  else if (currentDocumentKind === 'xlsx') {
    const table = excelEditor.querySelector('table')?.cloneNode(true) as HTMLTableElement | undefined;
    if (table) {
      table.querySelectorAll('tr').forEach((row) => row.firstElementChild?.remove());
      table.querySelectorAll('[contenteditable]').forEach((cell) => cell.removeAttribute('contenteditable'));
      root.append(table);
    }
  } else if (markdownDocument) root.append(...[...preview.children].map((child) => child.cloneNode(true)));
  else {
    const pre = document.createElement('pre'); pre.textContent = editor.getValue(); root.append(pre);
  }
  root.querySelectorAll('.header-anchor, .copy-code, .audio-error').forEach((item) => item.remove());
  return root;
}

function rtfFromText(value: string) {
  let body = '';
  for (const character of value) {
    if (character === '\\' || character === '{' || character === '}') body += `\\${character}`;
    else if (character === '\n') body += '\\par\n';
    else if (character === '\r') continue;
    else if (character === '\t') body += '\\tab ';
    else {
      for (let index = 0; index < character.length; index += 1) {
        const code = character.charCodeAt(index);
        body += code >= 32 && code <= 126 ? character[index] : `\\u${code > 32767 ? code - 65536 : code}?`;
      }
    }
  }
  return `{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0 Microsoft YaHei;}}\\uc1\\f0\\fs22 ${body}}`;
}

function csvFromRows(rows: string[][]) {
  return rows.map((row) => row.map((value) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\r\n');
}

async function exportHtmlDocument() {
  const theme = appShell.dataset.theme || 'light';
  const background = theme === 'dark' ? '#20242b' : theme === 'paper' ? '#f7f0df' : theme === 'eye' ? '#f4f8e8' : '#fff';
  const color = theme === 'dark' ? '#e7eaf0' : '#1f2329';
  const clone = createExportRoot();
  for (const media of clone.querySelectorAll<HTMLElement>('img[src],audio[src],source[src]')) {
    const source = media.getAttribute('src') || '';
    if (!source.startsWith('qingyue-file:')) continue;
    try {
      const blob = await (await fetch(source)).blob();
      media.setAttribute('src', await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); }));
    } catch { media.remove(); }
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(currentName)}</title><style>body{margin:0;background:${background};color:${color};font:15px/1.82 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.document{max-width:${getComputedStyle(appShell).getPropertyValue('--reading-width') || '820px'};margin:auto;padding:54px 44px 100px}h1{font-size:30px;border-bottom:1px solid #ddd;padding-bottom:14px}h2{margin-top:40px;font-size:23px}h3{margin-top:30px;font-size:19px}pre{padding:18px;overflow:auto;white-space:pre-wrap;background:rgba(127,127,127,.1);border-radius:8px}code{font-family:Consolas,monospace}blockquote{padding:12px 18px;border-left:4px solid #6594ff;background:rgba(101,148,255,.1)}table{width:100%;border-collapse:collapse}th,td{padding:9px 12px;border:1px solid #dfe1e5}img,svg{max-width:100%;height:auto}audio{width:min(520px,100%)}@media print{.document{padding:0}}</style></head><body><article class="document">${clone.innerHTML}</article></body></html>`;
}

type ExportFormat = 'pdf' | 'html' | 'docx' | 'md' | 'txt' | 'rtf' | 'csv';
const exportFormatOptions: Array<{ id: ExportFormat; label: string; detail: string; available?: () => boolean }> = [
  { id: 'pdf', label: 'PDF', detail: '便于分享与打印' },
  { id: 'html', label: 'HTML 网页', detail: '保留排版，可在浏览器打开' },
  { id: 'docx', label: 'Word（DOCX）', detail: '可继续在 Word 中编辑' },
  { id: 'md', label: 'Markdown', detail: '文本、Word、表格均可转换' },
  { id: 'txt', label: '纯文本 TXT', detail: '去除排版后的可读文本' },
  { id: 'rtf', label: '富文本 RTF', detail: '兼容 Word 与写字板' },
  { id: 'csv', label: 'CSV 表格', detail: '导出当前工作表', available: () => currentDocumentKind === 'xlsx' },
];

async function exportMarkdown(format: ExportFormat) {
  if (!activeTab()) return showToast('请先打开或新建文档');
  const option = exportFormatOptions.find((item) => item.id === format);
  if (option?.available && !option.available()) return showToast('当前文件类型不支持该导出格式');
  if (markdownDocument) await renderMermaidDiagrams();
  const stem = currentName.replace(/\.[^.]+$/, '');
  const destination = await window.qingyue.saveAsDialog(`${stem}.${format}`);
  if (!destination) return;
  try {
    if (format === 'md') await window.qingyue.writeFile({ path: destination, content: documentToMarkdown(), encoding: 'utf8' });
    else if (format === 'txt') {
      const text = plainTextForExport();
      await window.qingyue.writeFile({ path: destination, content: text.endsWith('\n') ? text : `${text}\n`, encoding: 'utf8' });
    } else if (format === 'rtf') await window.qingyue.writeFile({ path: destination, content: rtfFromText(plainTextForExport()), encoding: 'utf8' });
    else if (format === 'csv') await window.qingyue.writeFile({ path: destination, content: `\uFEFF${csvFromRows(activeExcelRowsForExport())}`, encoding: 'utf8' });
    else if (format === 'docx') {
      const exportRoot = createExportRoot();
      const blocks = currentDocumentKind === 'text' && !markdownDocument
        ? editor.getValue().split(/\r?\n/).map((text) => ({ type: 'paragraph', runs: [{ text }] }))
        : serializeWordBlocks(exportRoot);
      await window.qingyue.writeDocx({ path: destination, blocks });
    } else {
      const html = await exportHtmlDocument();
      if (format === 'pdf') await window.qingyue.exportPdf({ path: destination, html });
      else await window.qingyue.exportHtml({ path: destination, html });
    }
    showToast(`已导出 ${destination.split(/[\\/]/).pop()}`);
  } catch (error) { showToast(error instanceof Error ? error.message : String(error), 'error'); }
}

function showExportMenu() {
  const content = showUtility('导出文档');
  content.innerHTML = '<p>按当前内容选择格式。PDF / HTML / Word 保留排版，Markdown / TXT / RTF 便于继续编辑；Excel 还可导出当前工作表为 CSV。</p><div class="export-grid" id="export-grid"></div>';
  const grid = content.querySelector<HTMLElement>('#export-grid')!;
  if (__LITE__) content.querySelector('p')!.textContent = '轻量版支持 PDF、HTML、Markdown、TXT、RTF。文件在本地生成，无需联网。';
  exportFormatOptions.forEach((format) => {
    if (__LITE__ && ['docx', 'csv'].includes(format.id)) return;
    const button = document.createElement('button'); button.className = 'export-choice';
    button.innerHTML = `<i class="codicon codicon-export"></i><strong>${format.label}</strong><span>${format.detail}</span>`;
    button.disabled = Boolean(format.available && !format.available());
    button.addEventListener('click', () => { utilityModal.hidden = true; exportMarkdown(format.id); }); grid.append(button);
  });
}

async function loadProject(root: string) {
  projectRoot = root;
  setProjectOpen(true);
  if (startupSettings.rememberFolder) localStorage.setItem('qingyue-project-root', root);
  document.querySelector<HTMLElement>('#project-name')!.textContent = root.split(/[\\/]/).pop() || root;
  fileTree.innerHTML = '<div class="utility-empty">正在读取文件夹…</div>';
  const tree = await window.qingyue.loadTree(root);
  fileTree.innerHTML = '';
  tree.items.forEach((item) => {
    const row = document.createElement('button'); row.className = `tree-item ${item.type}`; row.style.paddingLeft = `${8 + item.depth * 13}px`;
    row.innerHTML = `<i class="codicon ${item.type === 'directory' ? 'codicon-folder-opened' : 'codicon-file'}"></i><span>${escapeHtml(item.name)}</span>`; row.title = item.path;
    if (item.type === 'file') row.addEventListener('click', () => openFile(item.path));
    fileTree.append(row);
  });
  if (tree.truncated) showToast('文件夹较大，文件树仅显示前 5000 项');
  scheduleSessionSave();
}

function setProjectOpen(open: boolean) {
  projectPanel.classList.toggle('open', open);
  workspaceElement.classList.toggle('project-open', open);
  projectPanel.setAttribute('aria-hidden', String(!open));
  document.querySelector<HTMLButtonElement>('#project-button')!.classList.toggle('active', open);
  localStorage.setItem('qingyue-project-open', String(open));
  renderOutlineWidth();
  scheduleSessionSave();
}

async function chooseProject() {
  const root = await window.qingyue.openFolderDialog();
  if (root) await loadProject(root);
}

async function searchProject() {
  if (!projectRoot) return chooseProject();
  const query = document.querySelector<HTMLInputElement>('#project-query')!.value;
  if (!query) return;
  projectResults.innerHTML = '<div class="utility-empty">正在搜索…</div>';
  const results = await window.qingyue.searchFolder({ root: projectRoot, query, matchCase: document.querySelector<HTMLInputElement>('#project-case')!.checked });
  projectResults.innerHTML = '';
  if (!results.length) projectResults.innerHTML = '<div class="utility-empty">没有找到匹配内容</div>';
  results.forEach((result) => {
    const row = document.createElement('button'); row.className = 'search-result';
    const location = result.officeKind === 'xlsx' ? `${result.sheetName || '工作表'} · ${result.row || 1} 行` : result.line ? `第 ${result.line} 行` : '文件名';
    row.innerHTML = `<strong>${escapeHtml(result.relative)}</strong><small>${escapeHtml(location)}</small><span>${escapeHtml(result.preview)}</span>`;
    row.addEventListener('click', async () => {
      await openFile(result.path);
      if (result.officeKind === 'xlsx') {
        const sheetIndex = excelSheets.findIndex((sheet) => sheet.name === result.sheetName);
        if (sheetIndex >= 0) { activeSheetIndex = sheetIndex; populateSheetTabs(); renderSheet(sheetIndex); }
        requestAnimationFrame(() => {
          const cell = excelEditor.querySelector<HTMLElement>(`td[data-row="${result.row}"][data-column="${result.cellColumn}"]`);
          cell?.scrollIntoView({ block: 'center', inline: 'center' }); cell?.focus(); cell?.classList.add('search-hit-flash');
          window.setTimeout(() => cell?.classList.remove('search-hit-flash'), 1600);
        });
      } else if (result.officeKind === 'docx') {
        const walker = document.createTreeWalker(wordEditor, NodeFilter.SHOW_TEXT);
        const needle = document.querySelector<HTMLInputElement>('#project-query')!.value;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const source = node.textContent || '';
          const offset = document.querySelector<HTMLInputElement>('#project-case')!.checked ? source.indexOf(needle) : source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
          if (offset < 0) continue;
          const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + needle.length);
          const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
          (node.parentElement as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); break;
        }
      } else if (result.line) jumpToSourceLine(result.line);
    });
    projectResults.append(row);
  });
}

async function replaceProject() {
  if (!projectRoot) return chooseProject();
  const search = document.querySelector<HTMLInputElement>('#project-query')!.value;
  const replacement = document.querySelector<HTMLInputElement>('#project-replacement')!.value;
  if (!search) return showToast('请先输入查找内容');
  if (!window.confirm(`将在整个文件夹中把“${search}”替换为“${replacement}”。轻阅会先创建备份，确定继续吗？`)) return;
  const result = await window.qingyue.replaceFolder({ root: projectRoot, search, replacement, matchCase: document.querySelector<HTMLInputElement>('#project-case')!.checked });
  showToast(result.changed.length ? `已修改 ${result.changed.length} 个文件，备份位于 .qingyue-backup` : '没有文件需要修改');
  await searchProject();
}

function applyAppearance() {
  const preference = localStorage.getItem('qingyue-theme') || 'system';
  const theme = preference === 'system' ? (systemThemeQuery.matches ? 'dark' : 'light') : preference;
  const fontSize = Number(localStorage.getItem('qingyue-font-size')) || 15;
  const lineWidth = Number(localStorage.getItem('qingyue-line-width')) || 820;
  appShell.dataset.theme = theme;
  appShell.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  appShell.style.setProperty('--reading-font-size', `${fontSize}px`);
  appShell.style.setProperty('--reading-width', `${lineWidth}px`);
  monaco.editor.setTheme(theme === 'dark' ? 'qingyue-dark' : theme === 'eye' ? 'qingyue-eye' : theme === 'paper' ? 'qingyue-paper' : 'qingyue-light');
  const themeSelect = document.querySelector<HTMLSelectElement>('#theme-select'); if (themeSelect) themeSelect.value = preference;
  const fontRange = document.querySelector<HTMLInputElement>('#font-size-range'); if (fontRange) fontRange.value = String(fontSize);
  const widthRange = document.querySelector<HTMLInputElement>('#line-width-range'); if (widthRange) widthRange.value = String(lineWidth);
  document.querySelector('#font-size-value')!.textContent = `${fontSize}px`;
  document.querySelector('#line-width-value')!.textContent = `${lineWidth}px`;
  if (markdownDocument) renderMarkdown();
}

systemThemeQuery.addEventListener('change', () => { if ((localStorage.getItem('qingyue-theme') || 'system') === 'system') applyAppearance(); });

type SavedSession = {
  activeTabId?: string;
  projectRoot?: string;
  projectOpen?: boolean;
  outlineOpen?: boolean;
  outlineWidth?: number;
  outlineScrollTop?: number;
  projectScrollTop?: number;
  editorRatio?: number;
  tabs?: Array<Record<string, unknown>>;
};

function restoreWorkspaceState(session: SavedSession | null) {
  if (Number.isFinite(session?.outlineWidth)) setOutlineWidth(Number(session!.outlineWidth), false);
  else renderOutlineWidth();
  if (Number.isFinite(session?.editorRatio)) setEditorRatio(Number(session!.editorRatio), false);
  else setEditorRatio(editorRatio, false);
  setOutlineOpen(Boolean(session?.outlineOpen && markdownDocument && tabs.length));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    outlinePanel.scrollTop = Math.max(0, Number(session?.outlineScrollTop) || 0);
    fileTree.scrollTop = Math.max(0, Number(session?.projectScrollTop) || 0);
  }));
}

function showEmptyWorkspace() {
  editor.setModel(null);
  activeTabId = ''; currentPath = null; currentName = ''; dirty = false;
  appShell.dataset.empty = 'true';
  filenameEl.textContent = '未打开文档';
  preview.innerHTML = ''; outlineList.innerHTML = '';
  documentStats.textContent = ''; cursorStatus.textContent = '';
  revealButton.hidden = true; dirtyDot.classList.remove('visible');
  savedState.textContent = '就绪';
  document.title = __LITE__ ? '轻阅 Lite' : '轻阅';
  renderTabs(); setOutlineOpen(false);
}

async function restoreSavedTabs(session: SavedSession | null) {
  for (const saved of session?.tabs || []) {
    if (saved.path && tabs.some((tab) => tab.path?.toLowerCase() === String(saved.path).toLowerCase())) continue;
    if (tabs.some((tab) => tab.id === saved.id)) continue;
    try {
      if (saved.kind === 'text') {
        let content = typeof saved.content === 'string' ? saved.content : '';
        let encoding = String(saved.encoding || 'utf8');
        let largeMode = Boolean(saved.largeMode);
        if (saved.path && typeof saved.content !== 'string') {
          const file = largeMode ? await window.qingyue.readLargeFile(String(saved.path)) : await window.qingyue.readFile(String(saved.path));
          content = file.content; encoding = file.encoding; largeMode = Boolean(file.largeMode);
        }
        const tab = createTextTab(String(saved.name || '恢复文档.md'), saved.path ? String(saved.path) : null, content, encoding, largeMode, Boolean(saved.dirty), String(saved.id || newTabId()), false);
        tab.view = ['edit', 'split', 'preview'].includes(String(saved.view)) ? saved.view as ViewMode : tab.view;
        tab.previewScrollTop = Number(saved.previewScrollTop) || 0;
        tab.cursorLine = Number(saved.cursorLine) || 1; tab.cursorColumn = Number(saved.cursorColumn) || 1;
        tab.bookmarks = Array.isArray(saved.bookmarks) ? saved.bookmarks.map(Number) : [];
        tab.annotations = Array.isArray(saved.annotations) ? saved.annotations as Annotation[] : [];
      } else if (!__LITE__ && saved.path && (saved.kind === 'docx' || saved.kind === 'xlsx')) {
        const common = { id: String(saved.id || newTabId()), path: String(saved.path), name: String(saved.name), encoding: 'office', dirty: Boolean(saved.dirty), largeMode: false, activeSheetIndex: Number(saved.activeSheetIndex) || 0, officeCopyRequired: saved.officeCopyRequired !== false, view: 'edit' as ViewMode, previewScrollTop: Number(saved.previewScrollTop) || 0, cursorLine: 1, cursorColumn: 1, bookmarks: [], annotations: [] };
        if (saved.kind === 'docx') {
          const file = await window.qingyue.readDocx(String(saved.path));
          tabs.push({ ...common, kind: 'docx', docxHtml: DOMPurify.sanitize(typeof saved.docxHtml === 'string' ? saved.docxHtml : file.html) });
        } else {
          const file = await window.qingyue.readXlsx(String(saved.path));
          const changes = Array.isArray(saved.excelChanges) ? saved.excelChanges as ExcelChange[] : [];
          tabs.push({ ...common, kind: 'xlsx', sheets: file.sheets, excelChanges: new Map(changes.map((change) => [excelChangeKey(change.sheetName, change.row, change.column), change])) });
        }
      }
    } catch { /* One missing file must not stop other restored tabs or explicit opens. */ }
  }
}

async function openExternalFiles(paths: string[]) {
  for (const filePath of [...new Set(paths)]) {
    await openFile(filePath);
    // An explicitly opened Markdown always wins over the restored tab's old view.
    if (currentPath?.toLowerCase() === filePath.toLowerCase() && markdownDocument) applyView(startupSettings.defaultView);
  }
}

function clearProject() {
  projectRoot = null;
  localStorage.removeItem('qingyue-project-root');
  localStorage.removeItem('qingyue-project-open');
  fileTree.innerHTML = ''; projectResults.innerHTML = '';
  document.querySelector('#project-name')!.textContent = '文件夹';
  setProjectOpen(false); scheduleSessionSave();
}

async function restorePreviousSession() {
  settingsModal.hidden = true;
  const session = await window.qingyue.loadArchivedSession() as SavedSession | null;
  if (!session?.tabs?.length) return showToast('没有可恢复的上次标签');
  restoringSession = true;
  try {
    captureActiveTab();
    await restoreSavedTabs(session);
    const selected = tabs.find((tab) => tab.id === session.activeTabId) || tabs[tabs.length - 1];
    if (selected) activateTab(selected.id);
    if (startupSettings.rememberFolder && session.projectRoot) {
      try { await loadProject(session.projectRoot); setProjectOpen(session.projectOpen !== false); }
      catch { clearProject(); }
    }
    restoreWorkspaceState(session);
    renderTabs();
  } finally { restoringSession = false; scheduleSessionSave(); }
}

async function restoreSession(initialPaths: string[]) {
  restoringSession = true;
  const initialModel = editor.getModel();
  editor.setModel(null); initialModel?.dispose();
  try {
    const session = await window.qingyue.loadSession() as SavedSession | null;
    const restoringPreviousState = startupSettings.startupMode === 'restore';
    if (restoringPreviousState) await restoreSavedTabs(session);
    else await window.qingyue.archiveSession();
    if (initialPaths.length) await openExternalFiles(initialPaths);
    else if (tabs.length) activateTab(tabs.find((tab) => tab.id === session?.activeTabId)?.id || tabs[0].id);
    if (!tabs.length) {
      if (!initialPaths.length && startupSettings.startupMode === 'blank') newFile();
      else showEmptyWorkspace();
    }
    if (startupSettings.rememberFolder) {
      const root = localStorage.getItem('qingyue-project-root') || session?.projectRoot;
      if (root) {
        try {
          await loadProject(root);
          const rememberedOpen = localStorage.getItem('qingyue-project-open');
          const shouldOpen = restoringPreviousState && typeof session?.projectOpen === 'boolean'
            ? session.projectOpen
            : rememberedOpen !== 'false';
          setProjectOpen(shouldOpen);
        } catch { clearProject(); }
      }
    }
    if (restoringPreviousState) restoreWorkspaceState(session);
    else { setOutlineOpen(false); renderOutlineWidth(); setEditorRatio(editorRatio, false); }
  } catch (error) {
    if (!tabs.length) showEmptyWorkspace();
    showToast('启动恢复失败，可从“历史”或“恢复上次标签”重试', 'error');
    // A corrupt recovery file must not block explicit file opens.
    if (initialPaths.length) await openExternalFiles(initialPaths);
  } finally { restoringSession = false; scheduleSessionSave(); }
}

document.querySelector('#save-startup-settings')!.addEventListener('click', () => {
  startupSettings = {
    defaultView: document.querySelector<HTMLSelectElement>('#default-view-select')!.value as ViewMode,
    startupMode: document.querySelector<HTMLSelectElement>('#startup-mode-select')!.value as StartupSettings['startupMode'],
    rememberFolder: document.querySelector<HTMLInputElement>('#remember-folder-check')!.checked,
  };
  localStorage.setItem('qingyue-startup-settings', JSON.stringify(startupSettings));
  if (startupSettings.rememberFolder && projectRoot) localStorage.setItem('qingyue-project-root', projectRoot);
  else localStorage.removeItem('qingyue-project-root');
  showToast('设置已保存，下次打开文件和启动时生效');
});
document.querySelector('#clear-project')!.addEventListener('click', clearProject);
document.querySelector('#restore-previous-session')!.addEventListener('click', () => void restorePreviousSession());

editor.onDidChangeModelContent(() => {
  if (!loadingContent) setDirty(true);
  scheduleRender();
  updateStats();
});

editor.onDidChangeCursorPosition(({ position }) => {
  cursorStatus.textContent = `第 ${position.lineNumber} 行，第 ${position.column} 列`;
  scheduleSessionSave();
});

editor.onDidScrollChange((event) => {
  if (currentView !== 'split' || !event.scrollTopChanged) return;
  const editorScrollable = Math.max(1, editor.getScrollHeight() - editor.getLayoutInfo().height);
  const previewScrollable = Math.max(1, previewScroll.scrollHeight - previewScroll.clientHeight);
  previewScroll.scrollTop = (event.scrollTop / editorScrollable) * previewScrollable;
});

preview.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
  if (!anchor) return;
  const localPath = anchor.dataset.localPath;
  if (localPath) {
    event.preventDefault();
    openFile(localPath);
  } else if (/^https?:\/\//i.test(anchor.href)) {
    event.preventDefault();
    window.qingyue.openExternal(anchor.href);
  }
});

previewScroll.addEventListener('scroll', updateActiveOutlineItem, { passive: true });
previewScroll.addEventListener('scroll', () => {
  const maximum = Math.max(1, previewScroll.scrollHeight - previewScroll.clientHeight);
  const percent = Math.min(100, Math.max(0, (previewScroll.scrollTop / maximum) * 100));
  readingProgressBar.style.width = `${percent}%`;
  const tab = activeTab(); if (tab) tab.previewScrollTop = previewScroll.scrollTop;
  scheduleSessionSave();
}, { passive: true });
outlinePanel.addEventListener('scroll', scheduleSessionSave, { passive: true });
fileTree.addEventListener('scroll', scheduleSessionSave, { passive: true });
previewScroll.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || currentDocumentKind !== 'text' || currentView !== 'preview') return;
  event.preventDefault();
  setPreviewZoom(previewZoom + (event.deltaY < 0 ? .1 : -.1));
}, { passive: false });

wordEditor.addEventListener('input', () => { if (currentDocumentKind === 'docx') { setDirty(true); updateStats(); } });
excelEditor.addEventListener('input', (event) => {
  const cell = (event.target as HTMLElement).closest<HTMLTableCellElement>('td[data-row][data-column]');
  const sheet = excelSheets[activeSheetIndex];
  if (!cell || !sheet) return;
  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const key = excelChangeKey(sheet.name, row, column);
  const value = cell.innerText.replace(/\r?\n/g, ' ');
  if (value === cell.dataset.original) excelChanges.delete(key);
  else excelChanges.set(key, { sheetName: sheet.name, row, column, value, original: cell.dataset.original || '' });
  setDirty(excelChanges.size > 0);
  updateStats();
});

officeScroll.addEventListener('scroll', () => {
  if (currentDocumentKind !== 'docx') return;
  const maximum = Math.max(1, officeScroll.scrollHeight - officeScroll.clientHeight);
  readingProgressBar.style.width = `${Math.min(100, Math.max(0, officeScroll.scrollTop / maximum * 100))}%`;
  const tab = activeTab(); if (tab) tab.previewScrollTop = officeScroll.scrollTop;
  scheduleSessionSave();
}, { passive: true });
officeScroll.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || currentDocumentKind !== 'docx') return;
  event.preventDefault(); setOfficeZoom(officeZoom + (event.deltaY < 0 ? .1 : -.1));
}, { passive: false });

document.querySelector('#zoom-out')!.addEventListener('click', () => setActiveZoom(-.1));
document.querySelector('#zoom-in')!.addEventListener('click', () => setActiveZoom(.1));

document.querySelector('#empty-new')!.addEventListener('click', newFile);
document.querySelector('#empty-open')!.addEventListener('click', () => openFile());
document.querySelector('#empty-recover')!.addEventListener('click', () => void restorePreviousSession());
document.querySelector('#new-tab')!.addEventListener('click', newFile);
document.querySelector('#open-button')!.addEventListener('click', () => openFile());
document.querySelector('#save-button')!.addEventListener('click', () => saveCurrent());
formatButton?.addEventListener('click', formatDocument);
document.querySelector('#validate-button')?.addEventListener('click', () => validateCurrent());
document.querySelector('#diff-button')?.addEventListener('click', compareCurrent);
document.querySelector('#export-button')!.addEventListener('click', showExportMenu);
document.querySelector('#insert-button')!.addEventListener('click', () => void insertAttachment());
document.querySelector('#creative-button')?.addEventListener('click', showCreativeMenu);
document.querySelector('#help-button')!.addEventListener('click', showHelp);
document.querySelector('#settings-button')!.addEventListener('click', showSettings);
document.querySelector('#shortcut-settings-button')!.addEventListener('click', showShortcutManager);
document.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((button) => button.addEventListener('click', () => applyView(button.dataset.mode as ViewMode)));
document.querySelector('#outline-button')!.addEventListener('click', () => setOutlineOpen(!outlinePanel.classList.contains('open')));
document.querySelector('#outline-close')!.addEventListener('click', () => setOutlineOpen(false));
document.querySelector('#project-button')!.addEventListener('click', () => setProjectOpen(!projectPanel.classList.contains('open')));
document.querySelector('#project-close')!.addEventListener('click', () => setProjectOpen(false));
document.querySelector('#open-folder-button')!.addEventListener('click', chooseProject);
document.querySelector('#project-search-button')!.addEventListener('click', searchProject);
document.querySelector('#project-replace-button')!.addEventListener('click', replaceProject);
document.querySelector<HTMLInputElement>('#project-query')!.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchProject(); });
document.querySelector('#bookmark-button')!.addEventListener('click', showBookmarks);
document.querySelector('#annotation-button')!.addEventListener('click', showAnnotations);
document.querySelector('#history-button')!.addEventListener('click', showHistory);
document.querySelector('#speech-button')!.addEventListener('click', showSpeechPanel);
document.querySelector('#fullscreen-button')!.addEventListener('click', () => toggleFullscreen(true));
document.querySelector('#exit-fullscreen')!.addEventListener('click', () => toggleFullscreen(false));
revealButton.addEventListener('click', () => currentPath && window.qingyue.revealFile(currentPath));

document.querySelector('#tab-menu-button')!.addEventListener('click', (event) => { event.stopPropagation(); tabMenu.hidden = !tabMenu.hidden; });
tabMenu.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-action]')?.dataset.tabAction;
  tabMenu.hidden = true;
  if (action === 'close-current') void closeTabs([activeTabId]);
  if (action === 'close-right') void closeTabsToRight();
  if (action === 'close-all') void closeTabs(tabs.map((tab) => tab.id));
});
document.addEventListener('click', (event) => { if (!(event.target as HTMLElement).closest('#tab-menu-button, #tab-menu')) tabMenu.hidden = true; });

document.querySelectorAll<HTMLButtonElement>('#confirm-modal [data-choice]').forEach((button) => button.addEventListener('click', () => {
  confirmModal.hidden = true;
  confirmResolver?.(button.dataset.choice as DestructiveChoice);
  confirmResolver = null;
}));

document.querySelector('#settings-close')!.addEventListener('click', () => { settingsModal.hidden = true; });
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) settingsModal.hidden = true; });
document.querySelector('#default-apps-button')!.addEventListener('click', () => window.qingyue.openDefaultApps());
document.querySelector('#update-button')!.addEventListener('click', async () => {
  const button = document.querySelector<HTMLButtonElement>('#update-button')!;
  const action = button.dataset.action || 'check';
  if (action === 'releases') return void window.qingyue.openExternal('https://github.com/HeYun0576/qingyue/releases');
  if (action === 'disabled') return;
  button.disabled = true;
  try {
    let state: UpdateState;
    if (action === 'download') state = await window.qingyue.downloadUpdate();
    else if (action === 'install') {
      await window.qingyue.saveSession(serializeSession());
      await window.qingyue.installUpdate();
      return;
    } else state = await window.qingyue.checkForUpdates();
    renderUpdateState(state);
  } catch (error) {
    renderUpdateState(await window.qingyue.getUpdateState());
    showToast(error instanceof Error ? error.message : String(error), 'error');
  }
});
document.querySelector('#utility-close')!.addEventListener('click', () => { activeUtilityCleanup?.(); activeUtilityCleanup = null; utilityModal.hidden = true; });
utilityModal.addEventListener('click', (event) => { if (event.target === utilityModal) { activeUtilityCleanup?.(); activeUtilityCleanup = null; utilityModal.hidden = true; } });
document.querySelector<HTMLSelectElement>('#theme-select')!.addEventListener('change', (event) => { localStorage.setItem('qingyue-theme', (event.target as HTMLSelectElement).value); applyAppearance(); });
document.querySelector<HTMLInputElement>('#font-size-range')!.addEventListener('input', (event) => { localStorage.setItem('qingyue-font-size', (event.target as HTMLInputElement).value); applyAppearance(); });
document.querySelector<HTMLInputElement>('#line-width-range')!.addEventListener('input', (event) => { localStorage.setItem('qingyue-line-width', (event.target as HTMLInputElement).value); applyAppearance(); });
document.querySelector('#association-button')!.addEventListener('click', async () => {
  const button = document.querySelector<HTMLButtonElement>('#association-button')!;
  button.disabled = true;
  try {
    if (button.dataset.registered === 'true') await window.qingyue.unregisterAssociations();
    else await window.qingyue.registerAssociations();
    await showSettings();
    showToast(button.dataset.registered === 'true' ? '文件关联已注册' : '文件关联已移除');
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally { button.disabled = false; }
});

outlineResizer.addEventListener('pointerdown', (event) => {
  if (!outlinePanel.classList.contains('open')) return;
  event.preventDefault();
  outlineResizer.setPointerCapture(event.pointerId);
  outlineResizer.classList.add('dragging');
  const panelLeft = outlinePanel.getBoundingClientRect().left;
  const move = (moveEvent: PointerEvent) => setOutlineWidth(moveEvent.clientX - panelLeft);
  const up = () => {
    outlineResizer.classList.remove('dragging');
    outlineResizer.removeEventListener('pointermove', move);
    outlineResizer.removeEventListener('pointerup', up);
    outlineResizer.removeEventListener('pointercancel', up);
  };
  outlineResizer.addEventListener('pointermove', move);
  outlineResizer.addEventListener('pointerup', up);
  outlineResizer.addEventListener('pointercancel', up);
});

outlineResizer.addEventListener('keydown', (event) => {
  let next = outlineWidthPreference;
  if (event.key === 'ArrowLeft') next -= 20;
  else if (event.key === 'ArrowRight') next += 20;
  else if (event.key === 'Home') next = OUTLINE_WIDTH_MIN;
  else if (event.key === 'End') next = maximumOutlineWidth();
  else return;
  event.preventDefault(); event.stopPropagation(); setOutlineWidth(next);
});

window.addEventListener('resize', renderOutlineWidth);

splitter.addEventListener('pointerdown', (event) => {
  if (currentView !== 'split') return;
  splitter.setPointerCapture(event.pointerId);
  splitter.classList.add('dragging');
  const move = (moveEvent: PointerEvent) => {
    const workspace = document.querySelector<HTMLElement>('.workspace')!;
    const sidebarWidth = (workspace.classList.contains('project-open') ? projectPanel.offsetWidth : 0) + (workspace.classList.contains('outline-open') ? outlinePanel.offsetWidth : 0);
    const availableWidth = Math.max(1, workspace.clientWidth - sidebarWidth);
    setEditorRatio((moveEvent.clientX - workspace.getBoundingClientRect().left - sidebarWidth) / availableWidth);
  };
  const up = () => {
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', move);
    splitter.removeEventListener('pointerup', up);
  };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', up);
});

window.addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement)?.classList?.contains('shortcut-capture')) return;
  const signature = shortcutSignature(event);
  const command = shortcutCommands.find((item) => shortcutFor(item.id) === signature);
  if (command) { event.preventDefault(); runShortcutCommand(command.id); return; }
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && ((currentDocumentKind === 'text' && currentView === 'preview') || currentDocumentKind === 'docx')) {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setActiveZoom(.1); }
    if (event.key === '-') { event.preventDefault(); setActiveZoom(-.1); }
    if (event.key === '0') { event.preventDefault(); setActiveZoom('reset'); }
  }
  const target = event.target as HTMLElement;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
  if (!ctrl && !event.altKey && !typing && ((currentDocumentKind === 'text' && currentView === 'preview') || currentDocumentKind === 'docx')) {
    const scrollTarget = currentDocumentKind === 'docx' ? officeScroll : previewScroll;
    const page = Math.max(120, scrollTarget.clientHeight - 72);
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) {
      event.preventDefault(); scrollTarget.scrollBy({ top: page, behavior: 'smooth' });
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) {
      event.preventDefault(); scrollTarget.scrollBy({ top: -page, behavior: 'smooth' });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault(); scrollTarget.scrollBy({ top: 72, behavior: 'smooth' });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); scrollTarget.scrollBy({ top: -72, behavior: 'smooth' });
    }
  }
  if (event.key === 'Escape') {
    if (!settingsModal.hidden) settingsModal.hidden = true;
    else if (!confirmModal.hidden) {
      confirmModal.hidden = true;
      confirmResolver?.('cancel');
      confirmResolver = null;
    } else if (outlinePanel.classList.contains('open')) setOutlineOpen(false);
    else if (projectPanel.classList.contains('open')) setProjectOpen(false);
    else if (appShell.classList.contains('fullscreen-reading')) toggleFullscreen(false);
  }
});

let externalOpenQueue = Promise.resolve();
window.qingyue.onOpenFiles((paths) => {
  externalOpenQueue = externalOpenQueue.then(() => startupReady).then(() => openExternalFiles(paths)).catch((error) => showToast(String(error), 'error'));
});
window.qingyue.onRequestClose(async () => {
  try {
    captureActiveTab();
    await window.qingyue.saveSession(serializeSession());
    await Promise.all(tabs.filter((tab) => tab.dirty && tab.kind === 'text' && tab.model).map((tab) => window.qingyue.saveHistory({ identity: tab.path || tab.id, name: tab.name, content: tab.model!.getValue() })));
    window.qingyue.respondToClose(true);
  } catch {
    const choice = await confirmBeforeDestructive('自动恢复数据写入失败。仍然退出可能丢失未保存内容。');
    window.qingyue.respondToClose(choice === 'discard');
  }
});
window.qingyue.onFullscreenChanged((enabled) => {
  if (!enabled && appShell.classList.contains('fullscreen-reading')) {
    appShell.classList.remove('fullscreen-reading');
    applyView(viewBeforeFullscreen);
  }
});
window.qingyue.onUpdateState((state) => renderUpdateState(state));

applyAppearance();
setPreviewZoom(previewZoom);
renderOutlineWidth();
setEditorRatio(editorRatio, false);
const startupReady = (async () => {
  const initialFiles = await window.qingyue.takeStartupFiles();
  await restoreSession(initialFiles);
  const lateFiles = await window.qingyue.rendererReady();
  if (lateFiles.length) await openExternalFiles(lateFiles);
  appShell.dataset.ready = 'true';
})();
