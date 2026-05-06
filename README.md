# note ミュート

noteのホームフィードから特定クリエイターの記事を非表示にするツールです。

- **Chrome拡張機能**（PC向け）
- **Userscript**（iOS Safari + [Userscripts](https://apps.apple.com/jp/app/userscripts/id1463298887) アプリ）

## Chrome拡張機能

### インストール方法

1. ダウンロードしたZIPファイルを解凍する
2. Chromeで `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」をONにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. 解凍したフォルダを選択する

### 使い方

1. Chromeのツールバーに表示される 🔇 アイコンをクリック
2. ミュートしたいクリエイターのIDを入力して「追加」
   - IDはプロフィールURLの `note.com/ここの部分` です
   - URLをそのまま貼り付けてもOK
3. noteのホーム等でそのクリエイターの記事が非表示になります

## Userscript

### iOS Safari

1. App Storeから [Userscripts](https://apps.apple.com/jp/app/userscripts/id1463298887) をインストール
2. 設定 → Safari → 機能拡張 → Userscripts を有効にする
3. Userscriptsアプリを開き、スクリプトの保存先フォルダを設定する
4. `userscript/note-mute.user.js` ファイルをそのフォルダに保存する
5. Safariで note.com を開くと自動で適用されます

### Android（Firefox + Tampermonkey）

1. Google Playから [Firefox](https://play.google.com/store/apps/details?id=org.mozilla.firefox) をインストール
2. Firefoxのメニュー → アドオン → 「Tampermonkey」を検索してインストール
3. Firefoxで以下のリンクを開く → 自動でインストール画面が表示されます

   👉 **[ワンタップインストール](https://github.com/hiyori-labo/note-mute-extension/raw/main/userscript/note-mute.user.js)**

4. 「インストール」をタップ → Firefoxで note.com を開くと自動で適用されます

### PC（Tampermonkey）

1. お使いのブラウザに [Tampermonkey](https://www.tampermonkey.net/) をインストール
2. 以下のリンクを開く → 自動でインストール画面が表示されます

   👉 **[インストール](https://github.com/hiyori-labo/note-mute-extension/raw/main/userscript/note-mute.user.js)**

### 使い方

1. note.com を開く
2. 画面右下の 🔇 ボタンをタップ
3. ミュート管理パネルが開くので、クリエイターIDを入力して「追加」
4. パネル外をタップすると閉じます

## 仕組み

- 記事カード要素内のリンクからクリエイターIDを判定
- MutationObserverで無限スクロールによる動的追加にも対応
- SPAのページ遷移も監視
- 追加時にnote APIからクリエイターの表示名を自動取得

## 注意

- これは非公式ツールです。noteの仕様変更で動作しなくなる場合があります
- ブロックではなく表示の非表示のみです（相手には影響しません）
- 自己責任でご利用ください

## ライセンス

[MIT](LICENSE)

