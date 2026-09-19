# 原生组件准备

当前自动获取密钥的接口参考 WeFlow 5.0.0：https://github.com/hicccc77/WeFlow 。作者 cc / WeFlow contributors。参考仓库许可证全文见 `licenses/WeFlow-LICENSE.txt`。

当前封装器仍加载并校验以下文件：

```text
wx_key.dll
wcdb_api.dll
WCDB.dll
SDL2.dll
msvcp140.dll
msvcp140_1.dll
vcruntime140.dll
vcruntime140_1.dll
```

把通过授权渠道取得的 Windows x64 文件放在本目录。`manifest.json` 存储 SHA256 校验值，匹配当前已验证版本。不要绕过校验；更新组件时应核实来源和版本后再更新清单。

数据库读取已经使用 Node.js 加密实现和 SQLite WASM；上述数据库 DLL 仍因封装初始化依赖而需要保留，不可单独删掉。

Git 忽略实际二进制，只提交说明和清单。仓库许可证不能替代对每个闭源二进制来源、使用和分发条件的确认。本目录的组件准备说明不构成公开分发授权。
