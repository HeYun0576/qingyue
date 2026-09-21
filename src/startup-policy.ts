export type StartupSettings = {
  defaultView: 'preview' | 'edit' | 'split';
  startupMode: 'empty' | 'blank' | 'restore';
  rememberFolder: boolean;
};

export const defaultStartupSettings: StartupSettings = { defaultView: 'split', startupMode: 'restore', rememberFolder: true };

export function normalizeStartupSettings(value: unknown): StartupSettings {
  const input = value && typeof value === 'object' ? value as Partial<StartupSettings> : {};
  return {
    defaultView: ['preview', 'edit', 'split'].includes(input.defaultView || '') ? input.defaultView! : 'split',
    startupMode: ['empty', 'blank', 'restore'].includes(input.startupMode || '') ? input.startupMode! : defaultStartupSettings.startupMode,
    rememberFolder: typeof input.rememberFolder === 'boolean' ? input.rememberFolder : defaultStartupSettings.rememberFolder,
  };
}

export function readStartupSettings(storage: Pick<Storage, 'getItem'>): StartupSettings {
  try { return normalizeStartupSettings(JSON.parse(storage.getItem('qingyue-startup-settings') || '{}')); }
  catch { return { ...defaultStartupSettings }; }
}
