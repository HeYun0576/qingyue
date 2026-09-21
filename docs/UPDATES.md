# 安装包与增量更新

轻阅同时保留免安装便携版和 NSIS 安装版。安装版由 `electron-updater` 读取 GitHub Releases 中的更新清单，优先下载变化块；旧版 blockmap 缺失、网络代理不支持范围请求或差分失败时，会自动回退到完整 Setup 包。

## 构建

```powershell
pnpm dist:installer
pnpm dist:lite:installer
```

本地构建使用 `--publish never`，只生成产物，不会上传 GitHub。完整版输出到 `release/`，Lite 输出到 `release/lite/`。

## 发布资产

同一个最新 GitHub Release 必须同时包含相互匹配的安装包、blockmap 和更新清单：

- 完整版：`QingYue-Markdown-<version>-Setup-x64.exe`、对应 `.blockmap`、`latest.yml`；
- Lite：`QingYue-Lite-<version>-Setup-x64.exe`、对应 `.blockmap`、`lite.yml`。

清单与安装包必须由同一次构建生成，不能混用旧清单。发布前分别递增完整版和 Lite 的版本号，再生成两套产物。便携 EXE / ZIP 可以放在同一 Release，但不会被应用内更新器使用。

## 兼容性约束

- 不要更改完整版 `appId`：`com.local.qingyue.markdown`；
- 不要更改 Lite `appId`：`com.local.qingyue.lite`；
- 完整版更新通道固定为 `latest`，Lite 固定为 `lite`；
- 不要把 `QingYue-Portable.txt` 打进 NSIS 安装包；
- 不要在升级脚本中删除 `QingYue-Data`、`QingYueLite-Data` 或 Electron `userData`；
- `deleteAppDataOnUninstall` 保持 `false`；
- 正式发布建议使用稳定的 Windows 代码签名证书，减少 SmartScreen 警告并加强更新包身份校验。

NSIS 使用稳定的 `appId` 派生升级标识，因此再次运行 Setup 或应用内更新都会识别当前安装位置并原位覆盖。安装程序文件与用户设置分开保存；更新前渲染进程会先刷新会话快照，重启后恢复标签、当前文档、阅读位置、目录与侧栏状态。
