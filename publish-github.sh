#!/usr/bin/env bash
# Đẩy thư mục mcp/ lên nhánh "mcp-dist" (MCP nằm ở GỐC nhánh) để cài bằng:
#   npx -y github:NguyenSen/entry.io.vn#mcp-dist
# Chạy lại mỗi khi sửa code MCP. (Repo private → chỉ máy có quyền truy cập repo dùng được.)
set -e
cd "$(dirname "$0")/.."   # về gốc repo
git branch -D mcp-dist 2>/dev/null || true
git subtree split --prefix mcp -b mcp-dist
git push -f origin mcp-dist
git branch -D mcp-dist 2>/dev/null || true
echo "✅ Đã cập nhật nhánh mcp-dist."
echo "   Dùng: npx -y github:NguyenSen/entry.io.vn#mcp-dist"
