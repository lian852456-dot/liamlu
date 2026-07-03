#!/bin/bash
set -e
TOKEN=$(grep github.com ~/.git-credentials | head -1 | sed 's|https://||;s|:x-oauth-basic@github.com||')
if [ -z "$TOKEN" ]; then
  echo "❌ 找不到 token，請先提供 PAT"
  exit 1
fi
git -C /home/user/liamlu remote set-url gh-direct "https://${TOKEN}@github.com/lian852456-dot/liamlu.git" 2>/dev/null || \
  git -C /home/user/liamlu remote add gh-direct "https://${TOKEN}@github.com/lian852456-dot/liamlu.git"
git -C /home/user/liamlu push gh-direct main
echo "✅ 推送完成"
