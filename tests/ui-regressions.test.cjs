const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');

test('preview-only layout owns a visible full-width grid column', () => {
  assert.match(styles, /\[data-view="preview"\] \.workspace\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /\[data-view="preview"\] \.preview-pane\s*\{\s*grid-column:\s*1/);
});

test('outline is a left workspace drawer with independent scrolling', () => {
  const workspaceStart = source.indexOf('<main class="workspace">');
  const outlineStart = source.indexOf('<aside class="outline-panel"');
  const editorStart = source.indexOf('<section class="editor-pane"');
  assert.ok(workspaceStart < outlineStart && outlineStart < editorStart);
  assert.match(styles, /\.outline-panel\s*\{[^}]*inset:\s*0 auto 0 0[^}]*overflow-y:\s*auto/s);
  assert.match(source, /id="outline-resizer"[^>]*role="separator"/);
  assert.match(source, /setOutlineWidth\(moveEvent\.clientX - panelLeft\)/);
  assert.match(styles, /\.outline-resizer[^}]*cursor:\s*col-resize/);
});

test('startup restores stable workspace state by default', () => {
  assert.match(source, /version:\s*2[\s\S]*projectOpen:[\s\S]*outlineOpen:[\s\S]*outlineWidth:[\s\S]*editorRatio/);
  assert.match(source, /restoreWorkspaceState\(session\)/);
  assert.match(source, /恢复上次状态（推荐）/);
  assert.match(source, /qingyue-editor-ratio/);
  assert.match(source, /qingyue-outline-width/);
});

test('outline navigation synchronizes preview and editor source line', () => {
  assert.match(source, /sourceHeadings[\s\S]*token\.type === 'heading_open'/);
  assert.match(source, /editor\.setPosition\(\{ lineNumber: sourceLine, column: 1 \}\)/);
  assert.match(source, /editor\.revealLineInCenter\(sourceLine/);
});

test('reading mode supports persistent zoom and whole-page keyboard navigation', () => {
  assert.match(source, /qingyue-preview-zoom/);
  assert.match(source, /previewScroll\.addEventListener\('wheel'/);
  assert.match(source, /event\.key === 'ArrowRight' \|\| event\.key === 'PageDown'[\s\S]*scrollTarget\.scrollBy/);
  assert.match(source, /event\.key === 'ArrowDown'[\s\S]*top: 72/);
  assert.match(source, /qingyue-office-zoom/);
  assert.match(source, /officeScroll\.addEventListener\('wheel'/);
  assert.match(styles, /\.reading-controls/);
});

test('themes follow the operating system and cover formerly white surfaces', () => {
  assert.match(source, /value="system">跟随系统/);
  assert.match(source, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(source, /dataset\.themePreference = preference/);
  assert.match(styles, /\.app-shell\[data-theme="dark"\]/);
  assert.match(styles, /\.app-shell \.brand-name[\s\S]*color:var\(--text-strong\)/);
  assert.match(styles, /\.app-shell \.project-panel[\s\S]*background:var\(--surface-panel\)/);
  assert.match(styles, /\.app-shell \.tab-menu[\s\S]*background:var\(--surface\)/);
});

test('common shortcuts and reader navigation are discoverable', () => {
  for (const shortcut of ['Ctrl+Shift+KeyB', 'Ctrl+Shift+KeyM', 'Ctrl+Shift+KeyD', 'Ctrl+Shift+KeyE', 'Ctrl+Shift+KeyL', 'Ctrl+KeyW', 'Ctrl+Tab']) {
    assert.match(source, new RegExp(shortcut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /qingyue-shortcuts/);
  assert.match(source, /shortcut-capture/);
  assert.match(source, /event\.key === 'ArrowLeft' \|\| event\.key === 'PageUp'/);
  assert.match(styles, /\.shortcut-grid/);
});

test('speech exposes selectable progress and starts from the visible or cursor position', () => {
  assert.match(source, /id="speech-progress"/);
  assert.match(source, /speechSelectedIndex/);
  assert.match(source, /firstVisibleSpeechElement/);
  assert.match(source, /cursorLine/);
});

test('creative tools include local whiteboard, mind map, image editing and attachments', () => {
  assert.match(source, /showWhiteboard/);
  assert.match(source, /showMindMap/);
  assert.match(source, /showImageEditor/);
  assert.match(source, /attachFile/);
  assert.match(styles, /\.creative-host/);
});

test('1.3.2 exports, persistent whiteboard tools, centered mind map text and playable audio', () => {
  assert.match(source, /exportFormatOptions/);
  assert.match(source, /id: 'md'/);
  assert.match(source, /id: 'txt'/);
  assert.match(source, /id: 'rtf'/);
  assert.match(source, /id: 'csv'/);
  assert.match(source, /activeExcelRowsForExport/);
  assert.match(source, /normalizeEmbeddedAudio/);
  assert.match(source, /isAudioReference/);
  assert.match(source, /setActiveTool/);
  assert.match(source, /连续使用当前工具/);
  assert.match(source, /root: \{ textAlign: 'center', paddingX: 28, paddingY: 16 \}/);
  assert.match(styles, /mindmap-host[\s\S]*align-items:\s*center/);
  assert.match(styles, /audio-embed/);
});

test('files can be dragged to open or inserted into Markdown', () => {
  assert.match(source, /file-drop-overlay/);
  assert.match(source, /addEventListener\('dragover'/);
  assert.match(source, /addEventListener\('drop'/);
  assert.match(source, /getPathForFile/);
  assert.match(source, /insertAttachment\(filePath\)/);
  assert.match(styles, /file-drag-active/);
});

test('diff view offers full and changes-only modes with line and word detail', () => {
  assert.match(source, /diffWordsWithSpace/);
  assert.match(source, /data-diff-mode="changes"/);
  assert.match(source, /data-diff-mode="all"/);
  assert.match(source, /diff-\$\{row\.kind\}/);
  assert.match(styles, /\.diff-row/);
  assert.match(styles, /\.word-added/);
  assert.doesNotMatch(styles, /diff-remove[^}]*text-decoration:\s*line-through/);
});

test('Word and Excel lightweight editors are present and copy-first protected', () => {
  assert.match(source, /class="word-editor"/);
  assert.match(source, /class="excel-editor"/);
  assert.match(source, /为保护原文件，请换一个文件名保存副本/);
  assert.match(styles, /\.excel-grid thead th[^}]*position:\s*sticky/s);
});

test('next version exposes tabs, recovery, project search, exports and annotations', () => {
  for (const marker of ['document-tabs', 'project-panel', 'project-search-button', 'project-replace-button', 'export-button', 'bookmark-button', 'annotation-button', 'history-button', 'theme-select']) {
    assert.match(source, new RegExp(`id="${marker}"`), marker);
  }
  assert.match(source, /saveSession\(serializeSession\(\)\)/);
  assert.match(source, /saveHistory/);
  assert.match(source, /import\('mermaid'\)/);
  assert.match(source, /import\('yaml'\)/);
  assert.match(source, /import\('diff'\)/);
});

test('reference layout and reader utilities remain directly accessible', () => {
  assert.match(styles, /\.workspace\.project-open\s*\{\s*padding-left:\s*310px/);
  assert.match(source, /data-tab-action="close-right"/);
  assert.match(source, /id="help-button"/);
  assert.match(source, /id="speech-button"/);
  assert.match(source, /codicon-export/);
  assert.match(source, /updateMarkerCounts/);
  assert.match(styles, /\.annotation-line-highlight/);
});

test('Office implementation is lazy-loaded off the startup path', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.doesNotMatch(main.split('function office()')[0], /require\('\.\/office\.cjs'\)/);
  assert.match(main, /function office\(\)[\s\S]*require\('\.\/office\.cjs'\)/);
});

test('tab models are explicitly owned and fast portable data stays beside the app', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.match(source, /const welcomeModel = monaco\.editor\.createModel/);
  assert.match(source, /monaco\.editor\.create[^]*model: welcomeModel/);
  assert.match(main, /QingYue-Portable\.txt/);
});

test('packaged application includes a valid Windows icon', () => {
  const icon = fs.readFileSync(path.join(root, 'build', 'icon.ico'));
  assert.equal(icon[0], 0);
  assert.equal(icon[1], 0);
  assert.equal(icon[2], 1);
  assert.equal(icon[3], 0);
  assert.ok(icon.length > 10_000);
});
