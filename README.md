# entry.io.vn MCP server

Cho **agent AI (Claude Desktop / Claude Code / bất kỳ MCP client)** tự dùng dịch vụ entry.io.vn:
mở **tunnel**, quản **DDNS**, **SSH key**, **subdomain** giữ chỗ, xem **VPN**/thống kê — qua các *tool*.

Transport: **stdio** (chạy local cùng máy agent). Auth: **API token** (Bearer).

## 1. Lấy API token
Dashboard → <https://app.entry.io.vn> → **API tokens** → tạo → copy chuỗi `entry_…` (chỉ hiện 1 lần).

## 2. Cài

**Cách A — npx từ GitHub (nhanh nhất, không cần npm publish):**
```bash
claude mcp add entry-io-vn -e ENTRY_API_TOKEN=entry_xxx -- npx -y github:NguyenSen/entry.io.vn#mcp-dist
```
> Repo đang **private** → cách này chỉ chạy trên máy **đã đăng nhập GitHub** có quyền truy cập repo (vd máy của bạn).
> Cần chia sẻ cho người ngoài → publish npm (`npx entry-io-mcp`) hoặc tạo repo public riêng.
> Cập nhật code MCP → chạy `bash mcp/publish-github.sh` để đẩy lại nhánh `mcp-dist`.

**Cách B — clone thủ công:**
```bash
git clone <repo> && cd mcp
npm install
```

## 3. Cấu hình client

**Claude Desktop** — `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "entry-io-vn": {
      "command": "node",
      "args": ["/ĐƯỜNG/DẪN/mcp/src/index.mjs"],
      "env": { "ENTRY_API_TOKEN": "entry_xxxxxxxx" }
    }
  }
}
```

**Claude Code**:
```bash
claude mcp add entry-io-vn -e ENTRY_API_TOKEN=entry_xxxxxxxx -- node /ĐƯỜNG/DẪN/mcp/src/index.mjs
```

Biến môi trường (tùy chọn): `ENTRY_BASE_URL` (mặc định `https://app.entry.io.vn`),
`ENTRY_SSH_HOST` (`entry.io.vn`), `ENTRY_SSH_PORT` (`2222`).

## 4. Tools
| Tool | Việc |
|---|---|
| `entry_whoami` | Tài khoản hiện tại (email, gói) |
| `entry_stats` / `entry_usage` | Thống kê nền tảng / mức dùng tài khoản |
| `entry_tunnels` | Tunnel HTTP đang chạy |
| `entry_ddns_list` / `entry_ddns_create` | Xem / tạo tên DDNS `*.ddns.entry.io.vn` |
| `entry_ssh_keys` / `entry_ssh_key_add` | Xem / thêm SSH key |
| `entry_reserved` / `entry_reserve_subdomain` | Xem / giữ subdomain cố định |
| `entry_vpn_devices` | Thiết bị trong mạng riêng |
| **`entry_tunnel_open`** | **Mở tunnel** đưa cổng local ra internet (spawn `ssh -R`), trả URL HTTPS |
| `entry_tunnel_close` / `entry_tunnels_local` | Đóng / liệt kê tunnel đang chạy |

## Ví dụ agent dùng
> "Đưa app local cổng 3000 của tôi ra internet" → agent gọi `entry_tunnel_open({local_port:3000})` → nhận `https://abc.entry.io.vn` → đưa link cho bạn / tự test webhook.

## Lưu ý
- `entry_tunnel_open` cần **`ssh` có sẵn** trên máy + **SSH key của máy đã thêm** vào tài khoản (dùng `entry_ssh_key_add` hoặc Dashboard). Tunnel chạy nền tới khi `entry_tunnel_close` hoặc tắt MCP.
- Token = toàn quyền tài khoản → giữ kín, thu hồi trong Dashboard nếu lộ.
