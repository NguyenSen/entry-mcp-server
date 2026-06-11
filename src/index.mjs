#!/usr/bin/env node
// MCP server cho entry.io.vn — để agent (Claude…) tự dùng dịch vụ: tunnel, DDNS, SSH key,
// subdomain giữ chỗ, VPN, thống kê. Auth bằng API token (Dashboard ▸ API tokens).
// Transport: stdio (chạy local cùng máy agent).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';

const BASE = (process.env.ENTRY_BASE_URL || 'https://app.entry.io.vn').replace(/\/$/, '');
const TOKEN = process.env.ENTRY_API_TOKEN || '';
const SSH_HOST = process.env.ENTRY_SSH_HOST || 'entry.io.vn';
const SSH_PORT = process.env.ENTRY_SSH_PORT || '2222';
const DOMAIN_RE = /https:\/\/[a-z0-9.-]+\.(entry|micromap)\.io\.vn/i;

// ---- helpers ----
async function api(method, path, body) {
  if (!TOKEN) throw new Error('Thiếu ENTRY_API_TOKEN. Lấy token ở Dashboard ▸ API tokens rồi đặt biến môi trường.');
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: 'Bearer ' + TOKEN, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}
const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: '❌ ' + msg }], isError: true });
const wrap = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { return fail(e.message || String(e)); } };

const server = new McpServer({ name: 'entry-io-vn', version: '1.0.0' });

// ============ READ ============
server.tool('entry_whoami', 'Thông tin tài khoản entry.io.vn hiện tại (email, gói).',
  wrap(() => api('GET', '/v1/me')));

server.tool('entry_stats', 'Thống kê công khai của nền tảng entry.io.vn (số tunnel, băng thông…).',
  wrap(() => api('GET', '/v1/stats')));

server.tool('entry_usage', 'Mức sử dụng của tài khoản (tunnel, băng thông theo thời gian).',
  wrap(() => api('GET', '/v1/usage')));

server.tool('entry_tunnels', 'Danh sách tunnel HTTP đang hoạt động của tài khoản.',
  wrap(() => api('GET', '/v1/tunnels')));

server.tool('entry_ddns_list', 'Danh sách tên DDNS (*.ddns.entry.io.vn) của tài khoản.',
  wrap(() => api('GET', '/v1/ddns')));

server.tool('entry_ssh_keys', 'Danh sách SSH key đã thêm (dùng để mở tunnel).',
  wrap(() => api('GET', '/v1/ssh-keys')));

server.tool('entry_reserved', 'Danh sách subdomain cố định đã giữ chỗ.',
  wrap(() => api('GET', '/v1/reserved')));

server.tool('entry_vpn_devices', 'Danh sách thiết bị trong mạng riêng (VPN/headscale).',
  wrap(() => api('GET', '/v1/vpn/devices')));

// ============ WRITE ============
server.tool('entry_ssh_key_add', 'Thêm 1 SSH public key vào tài khoản (để mở tunnel bằng key đó).',
  { public_key: z.string().describe('Nội dung public key, vd "ssh-ed25519 AAAA... user@host"'), label: z.string().optional().describe('Nhãn gợi nhớ') },
  wrap(({ public_key, label }) => api('POST', '/v1/ssh-keys', { public_key, label })));

server.tool('entry_ddns_create', 'Tạo 1 tên DDNS mới (tên.ddns.entry.io.vn). Trả về fqdn + token + update_url để cập nhật IP.',
  { label: z.string().describe('Phần tên trước .ddns.entry.io.vn (a-z, 0-9, dấu -)') },
  wrap(({ label }) => api('POST', '/v1/ddns', { label })));

server.tool('entry_reserve_subdomain', 'Giữ chỗ 1 subdomain cố định (sub.entry.io.vn) cho tunnel của bạn.',
  { subdomain: z.string().describe('Tên subdomain muốn giữ (a-z, 0-9, dấu -, 1–63 ký tự)') },
  wrap(({ subdomain }) => api('POST', '/v1/reserved', { subdomain })));

// ============ TUNNEL (spawn ssh -R, chạy local) ============
const tunnels = new Map(); // id -> { child, url, local_port, subdomain }
let seq = 0;

server.tool('entry_tunnel_open',
  'Mở tunnel đưa 1 cổng local ra internet qua entry.io.vn (chạy ssh -R nền). Trả về URL HTTPS công khai. Cần SSH key của máy đã được thêm vào tài khoản (entry_ssh_key_add) và cổng local đang chạy.',
  { local_port: z.number().int().min(1).max(65535).describe('Cổng local cần đưa ra, vd 3000'),
    subdomain: z.string().optional().describe('Subdomain cố định muốn dùng (bỏ trống = ngẫu nhiên). Phải đã giữ chỗ nếu muốn cố định.') },
  async ({ local_port, subdomain }) => {
    const remote = subdomain ? `${subdomain}:80:localhost:${local_port}` : `80:localhost:${local_port}`;
    const args = ['-NT', '-p', String(SSH_PORT),
      '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ExitOnForwardFailure=yes',
      '-o', 'ServerAliveInterval=30', '-R', remote, SSH_HOST];
    let child;
    try { child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return fail('Không chạy được ssh: ' + e.message); }
    const id = 't' + (++seq);
    const url = await new Promise((resolve) => {
      let buf = '';
      const onData = (d) => { buf += d.toString(); const m = buf.match(DOMAIN_RE); if (m) resolve(m[0]); };
      child.stdout.on('data', onData); child.stderr.on('data', onData);
      child.on('exit', () => resolve(null));
      setTimeout(() => resolve(null), 12000);
    });
    if (!url) { try { child.kill(); } catch {} return fail('Không lấy được URL trong 12s. Kiểm tra: SSH key đã thêm vào entry.io.vn chưa, cổng local có app đang chạy không, mạng có chặn cổng ' + SSH_PORT + ' không.'); }
    tunnels.set(id, { child, url, local_port, subdomain: subdomain || null });
    child.on('exit', () => tunnels.delete(id));
    return ok({ id, url, local_port, subdomain: subdomain || '(ngẫu nhiên)', note: 'Tunnel đang chạy nền. Đóng bằng entry_tunnel_close.' });
  });

server.tool('entry_tunnel_close', 'Đóng 1 tunnel đã mở bằng entry_tunnel_open.',
  { id: z.string().describe('id tunnel trả về khi mở (vd "t1")') },
  async ({ id }) => {
    const t = tunnels.get(id);
    if (!t) return fail('Không thấy tunnel id=' + id);
    try { t.child.kill(); } catch {}
    tunnels.delete(id);
    return ok({ closed: id, url: t.url });
  });

server.tool('entry_tunnels_local', 'Liệt kê các tunnel do MCP này đang chạy (local).',
  async () => ok({ tunnels: [...tunnels.entries()].map(([id, t]) => ({ id, url: t.url, local_port: t.local_port, subdomain: t.subdomain })) }));

// dọn khi thoát
const cleanup = () => { for (const t of tunnels.values()) { try { t.child.kill(); } catch {} } };
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

await server.connect(new StdioServerTransport());
console.error('entry.io.vn MCP server sẵn sàng (base=' + BASE + ', token=' + (TOKEN ? 'có' : 'THIẾU') + ')');
