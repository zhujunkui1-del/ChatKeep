# 聊存 ChatKeep

Windows 桌面工具，用于读取、查看和保存本人电脑上的微信文字聊天记录。

## 功能

- 自动获取本机微信数据库密钥，也支持手动输入已有密钥。
- 明文显示密钥，支持复制；已有密钥时无需重新获取。
- 按好友备注、昵称和群名称搜索会话；未能识别的名称会明确提示。
- 日历选择开始、结束日期，结束日期包含当天；留空代表不限日期。
- 文字预览每批 50 条，滚动到边界再加载，直到没有更多记录。
- 下载 JSON 或 TXT，导出范围内全部文字，不受预览页数限制。
- 按账号、会话增量保存到本机，重复保存去重，不接入云端账号。

## 使用

1. 解压完整软件包，保留整个文件夹，运行 `聊存 ChatKeep.exe`。
2. 点击「检查程序」。检查不会连接微信。
3. 选择 微信默认存储路径`C:\Users\你的用户名\xwechat_files` 或其下包含 `db_storage` 的账号目录，确认账号。
4. 粘贴已有密钥并点击「使用此密钥」；没有密钥时，刷新窗口列表，选正确的微信窗口，按提示开始获取并完成微信登录。
5. 点击「创建副本并读取会话」，选择好友或群聊。
6. 按需选择日期，点击「查看所选时段」。
7. 选择 JSON 或 TXT 后下载，或者点击「保存到本机」。

程序不会自动关闭或重启微信。微信进程重启后，请刷新窗口列表重新选择。

## 文件和个人数据

TXT 适合记事本阅读，包含会话名称、时段、时区、发送者和完整文字，使用 UTF-8 BOM 与 Windows 换行。

JSON 的 `time` 为本机时区的 `YYYY-MM-DD HH:mm:ss`，`timestamp` 为秒级 Unix 时间戳，`timezone` 记录导出时区。

应用数据目录是 `%APPDATA%\ChatKeep`：

- `local-sync/`：用户主动保存的聊天文字，不在退出时删除。
- `working-copies/`：临时数据库副本，正常退出清理；异常退出可能残留。

旧版应用数据仍留在原处。本版不会自动迁移、删除旧数据；如需迁移，可在两个程序均关闭时将旧应用数据目录中的 `local-sync` 复制至新目录。

密钥在界面中明文显示，复制后存在系统剪贴板中。请妥善保存，不要泄露。聊天导出和本机保存文件包含原文，也需要自行保护。本版不提供加密密钥备份功能。

## 数据边界与限制

- 只处理本人、本机、经授权的数据；原始微信数据库只复制，读取操作在副本上执行。
- 应用自身无聊天上传和云端账号功能；页面禁止联网，但不据此宣称第三方闭源组件已完成网络审计。
- 当前仅 Windows x64、仅文字消息；已验证微信 4.1.0.34，不保证所有版本兼容。
- 数据库副本上限 4 GB；文件复制检查不是事务级快照，数据变化时可能需要重试。
- 读取器当前未合并数据库 WAL，尚未写回主数据库的最新消息可能暂时不可见。
- 部分会话无法识别名称；群内成员专属昵称不保证完全匹配微信界面。

## 开发

需要 Node.js、npm。原生组件准备说明见 [native/README.md](native/README.md)。

```powershell
npm ci
npm run setup:runtime
npm test
npm start
```

如果 Electron 下载因网络失败，可使用当前终端的临时镜像环境变量重试，不需修改全局设置。

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm run setup:runtime
```

```powershell
npm run check:components
npm run check:ui
npm run check:clipboard
npm run pack
```

`pack` 输出 `release/win-unpacked` 完整运行目录。`dist` 生成便携包；发布前必须另行确认原生组件的公开分发条件。

`check:ui` 使用隐藏窗口检查界面及来源校验，不读取真实聊天数据。`check:clipboard` 使用测试字符串检查系统剪贴板后恢复原有文本、HTML、RTF 和图片。

## GitHub 提交范围

提交 `src/`、`test/`、通用 `scripts/`、`native/README.md`、`native/manifest.json`、`licenses/`、依赖清单和项目文档。

不提交 EXE、Electron 运行时、原生 DLL、`app.asar`、构建目录、`node_modules`、密钥、聊天导出和真实数据库。完整发行包应作为 Releases 附件，而不是源码提交；是否可公开发行，需先确认第三方组件条件。

聊天导出统一放入 `exports/` 等忽略目录。不要全局忽略 JSON 或 TXT，否则会误排除依赖清单、测试样例和许可证。公开前仍需检查 `git status`，忽略规则不能替代内容检查。

## 授权状态

本项目自身代码的开源许可证尚未由维护者选定，当前 `UNLICENSED` 表示未授予开放许可，不代表第三方组件没有许可证。第三方来源和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及 `licenses/`，不能移除这些声明。
