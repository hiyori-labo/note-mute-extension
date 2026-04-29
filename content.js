(() => {
  "use strict";

  let mutedIds = [];

  // ストレージからミュートリストを取得
  function loadMuteList() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ mutedCreators: [] }, (result) => {
        mutedIds = result.mutedCreators.map((c) => c.id.toLowerCase());
        resolve();
      });
    });
  }

  // noteの予約パス（クリエイターIDではないもの）
  const RESERVED_PATHS = new Set([
    "search", "explore", "notifications", "settings", "login",
    "signup", "terms", "privacy", "help", "about", "ranking",
    "contests", "categories", "hashtag", "membership", "api",
    "recommends", "topic", "policies", "official", "premium",
    "magazines", "tag", "n",
  ]);

  // リンクのhrefからクリエイターIDを抽出（相対パス・絶対URL両対応）
  function extractCreatorId(href) {
    if (!href) return null;

    // 絶対URL対応: https://note.com/username/... からusernameを抽出
    const absoluteMatch = href.match(/^https?:\/\/note\.com\/([^/?#]+)/);
    if (absoluteMatch) {
      const id = absoluteMatch[1].toLowerCase();
      if (RESERVED_PATHS.has(id)) return null;
      return id;
    }

    // 相対パス対応: /username/... からusernameを抽出
    const relativeMatch = href.match(/^\/([^/?#]+)(?:\/|$)/);
    if (relativeMatch) {
      const id = relativeMatch[1].toLowerCase();
      if (RESERVED_PATHS.has(id)) return null;
      return id;
    }

    return null;
  }

  // note記事リンクセレクタ（相対パス + 絶対URL両方）
  const NOTE_LINK_SELECTOR = 'a[href^="/"], a[href^="https://note.com/"]';

  // カードセレクター（元の方式 - 横スクロール等で有効）
  const CARD_SELECTOR =
    'section.m-largeNoteWrapper, [class*="NoteWrapper"], article, [class*="noteCard"], [class*="NoteCard"]';

  // カード要素内のリンクからクリエイターIDを判定して非表示
  function hideIfMuted(el) {
    if (!mutedIds.length || el.dataset.noteMuted) return;
    const links = el.querySelectorAll("a[href]");
    for (const link of links) {
      const creatorId = extractCreatorId(link.getAttribute("href"));
      if (creatorId && mutedIds.includes(creatorId)) {
        el.style.display = "none";
        el.dataset.noteMuted = "true";
        return;
      }
    }
  }

  // リンクから最も近い記事ブロック（非表示対象）を探す
  function findArticleBlock(link) {
    let el = link.parentElement;
    while (el && el !== document.body) {
      // ① 既知のセレクタにマッチするカード要素
      if (
        el.matches &&
        el.matches(
          'article, [class*="NoteWrapper"], [class*="noteCard"], [class*="NoteCard"], [class*="TimelineItem"]'
        )
      ) {
        if (el === link) {
          el = el.parentElement;
          continue;
        }
        return el;
      }

      // ② 兄弟要素が複数あり、記事リンクを含む要素（汎用カード検出）
      const parent = el.parentElement;
      if (parent && parent.children.length > 1 && el.querySelector("a[href]")) {
        // 相対パスまたは絶対URLのnoteリンクを持つ兄弟が複数あるかチェック
        const parentLinks = parent.querySelectorAll(
          ':scope > * > a[href^="/"], :scope > * > a[href^="https://note.com/"]'
        );
        if (parentLinks.length > 1) {
          return el;
        }

        // もう少し深い階層のリンクもチェック（カテゴリページ等のネスト構造対応）
        const deepLinks = parent.querySelectorAll(
          ':scope > * a[href*="/n/"]'
        );
        if (deepLinks.length > 1) {
          return el;
        }
      }

      el = el.parentElement;
    }
    return null;
  }

  // ページ全体をスキャン
  function scanAll() {
    if (!mutedIds.length) return;

    // ① カードセレクター方式（横スクロール等で確実に動くやつ）
    document.querySelectorAll(CARD_SELECTOR).forEach(hideIfMuted);

    // ② リンクスキャン方式で追加検出
    //    相対パスリンクと絶対URLリンクの両方をスキャン
    const allLinks = document.querySelectorAll(NOTE_LINK_SELECTOR);
    for (const link of allLinks) {
      // 既に非表示済みの要素内なら飛ばす
      if (link.closest('[data-note-muted="true"]')) continue;
      const creatorId = extractCreatorId(link.getAttribute("href"));
      if (!creatorId || !mutedIds.includes(creatorId)) continue;
      const block = findArticleBlock(link);
      if (block && !block.dataset.noteMuted) {
        block.style.display = "none";
        block.dataset.noteMuted = "true";
      }
    }
  }

  // ミュート解除（リスト更新時に再表示するため）
  function unhideAll() {
    document.querySelectorAll('[data-note-muted="true"]').forEach((el) => {
      el.style.display = "";
      delete el.dataset.noteMuted;
    });
  }

  // 新しいノードが追加されたら再スキャン
  function startObserver() {
    let scanTimer = null;
    const observer = new MutationObserver(() => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(scanAll, 200);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // noteはSPAなのでURLの変化も監視
  function watchNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // ページ遷移後に少し待ってから再スキャン
        setTimeout(scanAll, 500);
        setTimeout(scanAll, 1500);
      }
    };
    // popstate + setIntervalの二重監視
    window.addEventListener("popstate", check);
    setInterval(check, 1000);
  }

  // ストレージ変更時にリストを再読み込み
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.mutedCreators) {
      unhideAll();
      mutedIds = (changes.mutedCreators.newValue || []).map((c) =>
        c.id.toLowerCase()
      );
      scanAll();
    }
  });

  // 初期化
  async function init() {
    await loadMuteList();
    scanAll();
    startObserver();
    watchNavigation();
    // 初回読み込み時にまだレンダリングされていない場合のフォールバック
    setTimeout(scanAll, 1000);
    setTimeout(scanAll, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
