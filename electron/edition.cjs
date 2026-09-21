const metadata = require('../package.json');
const isLite = metadata.qingyueEdition === 'lite' || process.env.QINGYUE_EDITION === 'lite';
const appName = isLite ? '轻阅 Lite' : '轻阅';
const dataDirectory = isLite ? 'QingYueLite-Data' : 'QingYue-Data';
const updateChannel = isLite ? 'lite' : 'latest';
const excludedExtensions = new Set(isLite ? ['.docx', '.xlsx', '.excalidraw', '.mindmap', '.smm', '.xmind', '.mm', '.opml', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp3', '.wav', '.m4a', '.ogg', '.flac'] : []);
module.exports = { isLite, appName, dataDirectory, updateChannel, excludedExtensions };
