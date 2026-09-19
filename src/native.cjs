const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { parseJson } = require('./model.cjs');
const required = ['wx_key.dll', 'wcdb_api.dll', 'WCDB.dll', 'SDL2.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'];
function verifyFiles(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const file of required) {
    const data = fs.readFileSync(path.join(root, file));
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (manifest[file] !== hash) throw new Error('RESOURCE_INTEGRITY');
  }
  return required.length;
}
function bindings(root) {
  verifyFiles(root);
  const koffi = require('koffi');
  const libs = [];
  for (const name of ['vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','msvcp140_1.dll','WCDB.dll','SDL2.dll']) libs.push(koffi.load(path.join(root, name)));
  const k = koffi.load(path.join(root, 'wx_key.dll'));
  const d = koffi.load(path.join(root, 'wcdb_api.dll'));
  const api = {
    hook: k.func('bool InitializeHook(uint32 targetPid)'),
    poll: k.func('bool PollKeyData(_Out_ char* buffer, int bufferSize)'),
    cleanup: k.func('bool CleanupHook()'),
    status: k.func('bool GetStatusMessage(_Out_ char* buffer, int bufferSize, _Out_ int* level)'),
    protection: d.func('int32 InitProtection(const char* path)'),
    init: d.func('int32 wcdb_init()'), shutdown: d.func('int32 wcdb_shutdown()'),
    open: d.func('int32 wcdb_open_account(const char* path, const char* key, _Out_ int64* handle)'),
    close: d.func('int32 wcdb_close_account(int64 handle)'),
    self: d.func('int32 wcdb_set_my_wxid(int64 handle, const char* wxid)'),
    sessions: d.func('int32 wcdb_get_sessions(int64 handle, _Out_ void** json)'),
    names: d.func('int32 wcdb_get_display_names(int64 handle, const char* names, _Out_ void** json)'),
    messages: d.func('int32 wcdb_get_messages(int64 handle, const char* session, int32 limit, int32 offset, _Out_ void** json)'),
    free: d.func('void wcdb_free_string(void* ptr)'),
    json(fn, ...args) {
      const out = [null];
      try {
        const rc = fn(...args, out);
        if (rc !== 0 || !out[0]) throw new Error(`READ_FAILED:${rc}`);
        return parseJson(koffi.decode(out[0], 'char', -1));
      } finally { if (out[0]) api.free(out[0]); }
    },
    // Keep loaded libraries reachable throughout native calls.
    libs: [...libs, k, d]
  };
  return api;
}
module.exports = {bindings, verifyFiles};
