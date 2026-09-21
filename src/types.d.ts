interface OpenedFile {
  path: string;
  name: string;
  content: string;
  encoding: string;
  size: number;
  modifiedAt: number;
  largeMode?: boolean;
}

interface AssociationStatus {
  registered: boolean;
  executablePath?: string;
}

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error';
  supported: boolean;
  channel: 'latest' | 'lite';
  version: string | null;
  percent: number;
  transferred: number;
  total: number;
  message: string;
  installDirectory: string;
}

interface OfficeFileBase {
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
}

interface DocxFile extends OfficeFileBase {
  html: string;
  warnings: string[];
}

interface ExcelCellData {
  value: string;
  style: { bold: boolean; italic: boolean; align: string; fill: string; color: string };
}

interface ExcelSheetData {
  name: string;
  rowCount: number;
  columnCount: number;
  truncated: boolean;
  widths: number[];
  rows: ExcelCellData[][];
}

interface XlsxFile extends OfficeFileBase {
  sheets: ExcelSheetData[];
}

interface Window {
  qingyue: {
    takeStartupFiles(): Promise<string[]>;
    rendererReady(): Promise<string[]>;
    archiveSession(): Promise<boolean>;
    loadArchivedSession(): Promise<unknown>;
    openDialog(): Promise<string | null>;
    openFolderDialog(): Promise<string | null>;
    saveAsDialog(suggestedName: string): Promise<string | null>;
    getPathForFile(file: File): string;
    readFile(filePath: string): Promise<OpenedFile>;
    readLargeFile(filePath: string): Promise<OpenedFile>;
    writeFile(payload: { path: string; content: string; encoding: string }): Promise<Partial<OpenedFile>>;
    statFile(filePath: string): Promise<{ path: string; name: string; size: number; modifiedAt: number; isFile: boolean }>;
    readBinary(filePath: string): Promise<Uint8Array>;
    writeBinary(payload: { path: string; data: Uint8Array }): Promise<{ path: string; name: string; size: number }>;
    attachFile(payload: { source: string; documentPath: string }): Promise<{ path: string; name: string; relative: string }>;
    readDocx(filePath: string): Promise<DocxFile>;
    writeDocx(payload: { path: string; blocks: unknown[] }): Promise<OfficeFileBase>;
    readXlsx(filePath: string): Promise<XlsxFile>;
    writeXlsx(payload: { path: string; sourcePath: string; changes: Array<{ sheetName: string; row: number; column: number; value: string }> }): Promise<OfficeFileBase>;
    loadTree(root: string): Promise<{ root: string; items: Array<{ type: 'file' | 'directory'; name: string; path: string; relative: string; depth: number }>; truncated: boolean }>;
    searchFolder(payload: { root: string; query: string; matchCase: boolean }): Promise<Array<{ path: string; relative: string; line: number; column: number; preview: string; matchKind?: 'text' | 'filename' | 'office'; officeKind?: 'docx' | 'xlsx'; sheetName?: string; row?: number; cellColumn?: number }>>;
    replaceFolder(payload: { root: string; search: string; replacement: string; matchCase: boolean }): Promise<{ changed: string[]; backupRoot: string | null }>;
    saveSession(payload: unknown): Promise<boolean>;
    loadSession(): Promise<unknown>;
    saveHistory(payload: { identity: string; name: string; content: string }): Promise<boolean>;
    listHistory(identity: string): Promise<Array<{ timestamp: number; name: string; file: string }>>;
    readHistory(payload: { identity: string; file: string }): Promise<{ timestamp: number; name: string; content: string }>;
    exportHtml(payload: { path: string; html: string }): Promise<{ path: string; name: string }>;
    exportPdf(payload: { path: string; html: string }): Promise<{ path: string; name: string }>;
    revealFile(filePath: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    setFullscreen(enabled: boolean): Promise<void>;
    getFullscreen(): Promise<boolean>;
    setDirty(dirty: boolean): void;
    respondToClose(allow: boolean): void;
    getAssociationStatus(): Promise<AssociationStatus>;
    registerAssociations(): Promise<AssociationStatus>;
    unregisterAssociations(): Promise<AssociationStatus>;
    openDefaultApps(): Promise<void>;
    getAppInfo(): Promise<{ version: string; packaged: boolean; executablePath: string; portable: boolean; updateCapable: boolean; updateChannel: 'latest' | 'lite'; installationDirectory: string; userDataDirectory: string }>;
    getUpdateState(): Promise<UpdateState>;
    checkForUpdates(): Promise<UpdateState>;
    downloadUpdate(): Promise<UpdateState>;
    installUpdate(): Promise<boolean>;
    onUpdateState(callback: (state: UpdateState) => void): () => void;
    onOpenFiles(callback: (paths: string[]) => void): () => void;
    onRequestClose(callback: () => void): () => void;
    onFullscreenChanged(callback: (enabled: boolean) => void): () => void;
  };
}

declare module 'markdown-it-front-matter';
declare module 'markdown-it-task-lists';
declare module 'markdown-it-katex';
declare module 'simple-mind-map/full.js';
