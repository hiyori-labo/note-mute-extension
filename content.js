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
  ]);

  // リンクのhrefからクリエイターIDを抽出
  function extractCreatorId(href) {
    if (!href) return null;
    const match = href.match(/^\/([^/]+)(?:\/|$)/);
    if (!match) return null;
    const id = match[1].toLowerCase();
    if (RESERVED_PATHS.has(id)) return null;
    return id;
  }

  // リンクから最も近い記事ブロック（非表示対象）を探す
  function findArticleBlock(link) {
    let el = link.parentElement;
    while (el && el !== document.body) {
      if (
        el.matches &&
        el.matches(
          'article, [class*="NoteWrapper"], [class*="noteCard"], [class*="NoteCard"], [class*="TimelineItem"]'
        )
      ) {
        // リンク自身がNoteWrapperクラスを含む場合はスキップ（もっと上の要素を探す）
        if (el === link) {
          el = el.parentElement;
          continue;
        }
        return el;
      }
      const parent = el.parentElement;
      if (parent && parent.children.length > 1 && el.querySelector("a[href]")) {
        const parentLinks = parent.querySelectorAll(':scope > * > a[href^="/"]');
        if (parentLinks.length > 1) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return null;
  }

  // 要素を非表示にする
  function hideElement(el) {
    if (!el.dataset.noteMuted) {
      el.style.display = "none";
      el.dataset.noteMuted = "true";
    }
  }

  // 横スクロールセクションの処理
  // カードパーツがフラットに並んでいるため、リンクから次のカードリンクまでの兄弟を全て非表示
  function scanHorizontalSections() {
    const containers = document.querySelectorAll(
      '[class*="horizontalScrolling"], [class*="HorizontalScroll"]'
    );
    for (const container of containers) {
      const allLinks = container.querySelectorAll('a[href^="/"]');
      for (const link of allLinks) {
        const creatorId = extractCreatorId(link.getAttribute("href"));
        if (!creatorId || !mutedIds.includes(creatorId)) continue;

        // このリンク自体を非表示
        hideElement(link);

        // 次の兄弟要素を非表示にする（次のカードのメインリンクが出るまで）
        let sibling = link.nextElementSibling;
        while (sibling) {
          // 次のカードのメインリンク（別のクリエイターの記事リンク）なら停止
          if (sibling.tagName === "A" && sibling.getAttribute("href")) {
            const siblingHref = sibling.getAttribute("href");
            const siblingCreator = extractCreatorId(siblingHref);
            // 別のクリエイターの記事リンクなら停止（同じクリエイターなら続けて非表示）
            if (siblingCreator && siblingCreator !== creatorId) break;
            // 同じクリエイターの関連リンク（プロフィールリンク等）は非表示
            if (siblingCreator === creatorId) {
              hideElement(sibling);
              sibling = sibling.nextElementSibling;
              continue;
            }
          }
          // ボタンやスペーサー等のカード構成要素も非表示
          hideElement(sibling);
          sibling = sibling.nextElementSibling;
        }
      }
    }
  }

  // ページ全体のリンクをスキャンしてミュート対象を非表示
  function scanAll() {
    if (!mutedIds.length) return;

    // 横スクロールセクションの処理
    scanHorizontalSections();

    // 通常セクションの処理
    const allLinks = document.querySelectorAll('a[href^="/"]');
    for (const link of allLinks) {
      // 既に処理済みなら飛ばす
      if (link.dataset.noteMuted) continue;
      // 横スクロールセクション内は上で処理済み
      if (link.closest('[class*="horizontalScrolling"], [class*="HorizontalScroll"]')) continue;
      const creatorId = extractCreatorId(link.getAttribute("href"));
      if (!creatorId || !mutedIds.includes(creatorId)) continue;
      const block = findArticleBlock(link);
      if (block) {
        hideElement(block);
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
