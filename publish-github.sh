#!/usr/bin/env bash
# Đẩy thư mục mcp/ lên repo PUBLIC github.com/NguyenSen/entry-mcp (nhánh main, MCP ở GỐC repo)
# để mọi người cài bằng:  npx -y github:NguyenSen/entry-mcp
# Chạy lại mỗi khi sửa code MCP. (Maintainer cần quyền push vào repo entry-mcp.)
set -e
REPO="https://github.com/NguyenSen/entry-mcp-server.git"
cd "$(dirname "$0")/.."   # về gốc repo monorepo
git branch -D _mcp_dist 2>/dev/null || true
git subtree split --prefix mcp -b _mcp_dist
git push -f "$REPO" _mcp_dist:main
git branch -D _mcp_dist 2>/dev/null || true
echo "✅ Đã đẩy mcp/ -> github.com/NguyenSen/entry-mcp-server (main)."
echo "   Cài: npx -y github:NguyenSen/entry-mcp-server"
