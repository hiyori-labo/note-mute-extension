#!/bin/bash
# ============================================================
#  note ツール 配布パッケージ ビルドスクリプト
#  - note ミュート (Chrome拡張 / iOS Userscript)
#  - スキ数非表示  (Chrome拡張 / iOS Userscript)
#  ※ 将来 Android 版を追加する場合はセクションを追加してください
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MUTE_DIR="$SCRIPT_DIR"
LIKES_DIR="$SCRIPT_DIR/../hide-note-likes"
DIST_DIR="$SCRIPT_DIR/dist"

# --- 色付き出力 ---
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
cyan()   { printf "\033[36m%s\033[0m\n" "$1"; }

# --- dist ディレクトリ初期化 ---
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo ""
cyan "━━━ note ツール配布パッケージ ビルド ━━━"
echo ""

# ============================================================
#  1. note ミュート — Chrome拡張
# ============================================================
yellow "📦 [1/4] note ミュート — Chrome拡張..."

MUTE_CHROME_DIR="$DIST_DIR/_tmp_mute_chrome/note-mute-chrome"
mkdir -p "$MUTE_CHROME_DIR"

cp "$MUTE_DIR/manifest.json"  "$MUTE_CHROME_DIR/"
cp "$MUTE_DIR/content.js"     "$MUTE_CHROME_DIR/"
cp "$MUTE_DIR/popup.html"     "$MUTE_CHROME_DIR/"
cp "$MUTE_DIR/popup.js"       "$MUTE_CHROME_DIR/"
cp -r "$MUTE_DIR/icons"       "$MUTE_CHROME_DIR/"

# ZIP作成（フォルダ構造を維持）
(cd "$DIST_DIR/_tmp_mute_chrome" && zip -r "$DIST_DIR/note-mute-chrome.zip" note-mute-chrome/ -x "*.DS_Store")

rm -rf "$DIST_DIR/_tmp_mute_chrome"
green "  ✔ note-mute-chrome.zip"

# ============================================================
#  2. note ミュート — iOS Userscript
# ============================================================
yellow "📦 [2/4] note ミュート — iOS Userscript..."

cp "$MUTE_DIR/userscript/note-mute.user.js" "$DIST_DIR/"
(cd "$DIST_DIR" && zip -j "note-mute-ios.zip" "note-mute.user.js" -x "*.DS_Store")
rm "$DIST_DIR/note-mute.user.js"

green "  ✔ note-mute-ios.zip"

# ============================================================
#  3. スキ数非表示 — Chrome拡張
# ============================================================
yellow "📦 [3/4] スキ数非表示 — Chrome拡張..."

LIKES_CHROME_DIR="$DIST_DIR/_tmp_likes_chrome/hide-note-likes-chrome"
mkdir -p "$LIKES_CHROME_DIR"

cp "$LIKES_DIR/manifest.json"  "$LIKES_CHROME_DIR/"
cp "$LIKES_DIR/content.js"     "$LIKES_CHROME_DIR/"
cp "$LIKES_DIR/hide.css"       "$LIKES_CHROME_DIR/"
cp "$LIKES_DIR/bg.js"          "$LIKES_CHROME_DIR/"

(cd "$DIST_DIR/_tmp_likes_chrome" && zip -r "$DIST_DIR/hide-note-likes-chrome.zip" hide-note-likes-chrome/ -x "*.DS_Store")

rm -rf "$DIST_DIR/_tmp_likes_chrome"
green "  ✔ hide-note-likes-chrome.zip"

# ============================================================
#  4. スキ数非表示 — iOS Userscript
# ============================================================
yellow "📦 [4/4] スキ数非表示 — iOS Userscript..."

cp "$LIKES_DIR/userscript/note_like_hide.js" "$DIST_DIR/"
(cd "$DIST_DIR" && zip -j "hide-note-likes-ios.zip" "note_like_hide.js" -x "*.DS_Store")
rm "$DIST_DIR/note_like_hide.js"

green "  ✔ hide-note-likes-ios.zip"

# ============================================================
#  (将来) Android 版
# ============================================================
# Android (Firefox / Kiwi Browser) 対応を追加する場合:
#   - Userscript 形式ならそのまま流用可能
#   - Firefox 用 manifest v2 の拡張を作る場合はここにセクション追加
# yellow "📦 [5/6] note ミュート — Android..."
# yellow "📦 [6/6] スキ数非表示 — Android..."

# ============================================================
#  完了
# ============================================================
echo ""
cyan "━━━ ビルド完了 ━━━"
echo ""
echo "📁 出力先: $DIST_DIR/"
echo ""
ls -lh "$DIST_DIR/"
echo ""
green "BOOTH / GitHub Releases にアップロードできます 🚀"
echo ""
