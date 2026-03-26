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

  // 単一の記事カードを判定して非表示にする
  function hideIfMuted(el) {
    if (!mutedIds.length) return;
    const links = el.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      // note.com/creatorId/... のパターンにマッチ
      const match = href.match(/^\/([^/]+)\//);
      if (match) {
        const creatorId = match[1].toLowerCase();
        if (mutedIds.includes(creatorId)) {
          el.style.display = "none";
          el.dataset.noteMuted = "true";
          return;
        }
      }
    }
  }

  // ページ上の全記事カードをスキャン
  function scanAll() {
    // メインの記事カード
    const cards = document.querySelectorAll(
      'section.m-largeNoteWrapper, [class*="NoteWrapper"], article'
    );
    cards.forEach(hideIfMuted);

    // 横スクロール内のカード（おすすめ等）
    const smallCards = document.querySelectorAll(
      '[class*="noteCard"], [class*="NoteCard"]'
    );
    smallCards.forEach(hideIfMuted);
  }

  // ミュート解除（リスト更新時に再表示するため）
  function unhideAll() {
    document.querySelectorAll('[data-note-muted="true"]').forEach((el) => {
      el.style.display = "";
      delete el.dataset.noteMuted;
    });
  }

  // MutationObserverで動的に追加される要素を監視
  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // 追加されたノード自身がカードか
          if (
            node.matches &&
            node.matches(
              'section.m-largeNoteWrapper, [class*="NoteWrapper"], article, [class*="noteCard"], [class*="NoteCard"]'
            )
          ) {
            hideIfMuted(node);
          }

          // 追加されたノードの子孫にカードがあるか
          const innerCards = node.querySelectorAll
            ? node.querySelectorAll(
                'section.m-largeNoteWrapper, [class*="NoteWrapper"], article, [class*="noteCard"], [class*="NoteCard"]'
              )
            : [];
          innerCards.forEach(hideIfMuted);
        }
      }
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
