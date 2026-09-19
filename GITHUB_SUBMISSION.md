# GitHub 提交清单

## 源码提交

```powershell
git add .gitignore README.md GITHUB_SUBMISSION.md THIRD_PARTY_NOTICES.md package.json package-lock.json src test scripts licenses native/README.md native/manifest.json
git diff --cached --stat
git status --short
```

上述命令只作为维护说明，工程整理时没有执行暂存、提交或推送。

确认没有聊天原文、密钥、真实账号路径和二进制后，再自行提交。`test/` 中的数字密钥是合成测试数据，不是用户密钥。

## 不提交的内容

`.gitignore` 排除安装包、运行时、`node_modules`、原生组件二进制、临时数据库、用户导出、备份和回滚目录。根目录的 `resources/` 和 `locales/` 是已解包运行时，也不进入源码提交。

用户聊天文件统一放在 `exports/`；任意放到根目录的聊天 JSON/TXT 不会被通配规则自动识别，仍需检查待提交内容。不要全局忽略 JSON/TXT。

## 软件包

`release/win-unpacked/` 是完整运行包，需整体保留或整体压缩，不能只分发 EXE。旧运行包保存在忽略目录 `rollback-legacy-runtime/`，新版确认正常后可删除。

实际原生二进制未获明确公开分发许可前，不应上传到 GitHub Releases。自有代码的开源许可证尚待维护者选择，当前依赖清单标记 `UNLICENSED`。
