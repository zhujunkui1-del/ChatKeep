const { decompress } = require('fzstd');
function cleanWxid(name) {
  return name.startsWith('wxid_') ? (name.match(/^(wxid_[^_]+)/)?.[1] || name) : name.replace(/_[a-zA-Z0-9]{4}$/, '');
}
function parseJson(text) {
  return JSON.parse(text.replace(/("(?:server_id|local_id|svr_id)"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g, '$1"$2"'));
}
function normalizeSessions(rows, names = {}) {
  if (!Array.isArray(rows)) throw new Error('SESSION_FORMAT');
  return rows.map(r => {
    const id = String(r.username || r.user_name || r.userName || r.usrName || r.UsrName || r.talker || r.talker_id || r.talkerId || '');
    const n = names[id];
    return {id, name: typeof n === 'string' ? n : String(r.display_name || r.displayName || id),
      time: Number(r.sort_timestamp || r.sortTimestamp || r.last_timestamp || 0), group: id.endsWith('@chatroom')};
  }).filter(r => r.id).sort((a,b) => b.time-a.time);
}
function decodeContent(raw) {
  if (raw == null) return '';
  let bytes = null;
  if (Array.isArray(raw) || Buffer.isBuffer(raw) || raw instanceof Uint8Array) bytes = Buffer.from(raw);
  else if (raw?.type === 'Buffer' && Array.isArray(raw.data)) bytes = Buffer.from(raw.data);
  else if (typeof raw === 'string') {
    // Only decode encoded strings when the compression signature is present.
    // Ordinary text such as hex IDs or base64-like words must remain unchanged.
    if (/^28b52ffd/i.test(raw) && /^[0-9a-f]+$/i.test(raw)) bytes = Buffer.from(raw, 'hex');
    else if (raw.startsWith('KLUv/Q')) bytes = Buffer.from(raw, 'base64');
    else return raw;
  }
  if (!bytes) return '';
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0xfd2fb528) bytes = Buffer.from(decompress(bytes));
  return bytes.toString('utf8');
}
function normalizeMessages(rows, self) {
  if (!Array.isArray(rows)) throw new Error('MESSAGE_FORMAT');
  return rows.filter(r => Number(r.local_type ?? r.localType ?? r.type) === 1).map(r => {
    let text = decodeContent(r.compress_content ?? r.compressContent) || decodeContent(r.message_content ?? r.messageContent ?? r.content);
    const sender = String(r.sender_username || r.senderUsername || r.real_sender_id || '');
    const direction = r.is_send === 1 || r.is_send === '1' || (sender && sender === self) ? '本人' : r.is_send === 0 || r.is_send === '0' ? '对方' : '未确定';
    return {id: String(r.server_id ?? r.local_id ?? ''), time: Number(r.create_time ?? r.createTime ?? 0), direction, text: text.slice(0, 2000)};
  }).filter(r => r.text).slice(0, 10);
}
module.exports = {cleanWxid, parseJson, normalizeSessions, normalizeMessages, decodeContent};
