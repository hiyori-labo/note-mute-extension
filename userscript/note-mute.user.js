// ==UserScript==
// @name         note ミュート
// @namespace    https://github.com/hiyori-labo/note-mute-extension
// @version      1.5.0
// @description  noteのホームフィードから特定クリエイターの記事を非表示にします
// @match        https://note.com/*
// @run-at       document-start
// @noframes
// @updateURL    https://github.com/hiyori-labo/note-mute-extension/raw/main/userscript/note-mute.user.js
// @downloadURL  https://github.com/hiyori-labo/note-mute-extension/raw/main/userscript/note-mute.user.js
// ==/UserScript==

(() => {
  "use strict";

  // 埋め込みカード等の iframe 内では動かない（FAB の二重表示防止）
  if (window.top !== window.self) return;

  const STORAGE_KEY = "noteMute_creators";

  // ── ストレージ ──
  function loadCreators() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveCreators(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  // ── note APIから表示名を取得 ──
  async function fetchNickname(id) {
    try {
      const res = await fetch(
        `https://note.com/api/v2/creators/${encodeURIComponent(id)}`
      );
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.nickname || null;
    } catch {
      return null;
    }
  }

  // ── 記事の非表示ロジック ──
  let mutedIds = [];

  function updateMutedIds() {
    mutedIds = loadCreators().map((c) => c.id.toLowerCase());
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
    'section.m-largeNoteWrapper, [class*="NoteWrapper"], article, [class*="noteCard"], [class*="NoteCard"], figure[embedded-service="note"]';

  // ── 即時CSS ──
  // JSでDOMを走査する前に、CSSだけで描画前に隠す（初回表示のチラつき対策）。
  // 取りこぼしは従来どおり scanAll() が拾う。
  const HIDE_STYLE_ID = "nm-hide-style";

  // :has() 未対応ブラウザではCSS方式をスキップ（JSスキャンのみで従来通り動く）
  const SUPPORTS_HAS = (() => {
    try {
      return !!(window.CSS && CSS.supports && CSS.supports("selector(article:has(a))"));
    } catch {
      return false;
    }
  })();

  // CSSに埋め込んで安全なIDだけ対象にする（それ以外はJSスキャンに任せる）
  const SAFE_ID_RE = /^[a-z0-9_-]+$/i;

  // CARD_SELECTOR と同等。ただし記事詳細ページ本体（h1を持つarticle）は除外。
  // grid-rows-subgrid は現在のnote.comのカード要素の目印（タグ/クリエイター/検索ページで確認）。
  // それ以外は旧デザイン用で、現在のnote.comにはヒットしないが害もないため残している。
  const CSS_CARD_SELECTOR =
    'article:not(:has(h1)), [class~="grid-rows-subgrid"], section.m-largeNoteWrapper, [class*="NoteWrapper"], [class*="noteCard"], [class*="NoteCard"], [class*="TimelineItem"], figure[embedded-service="note"]';

  // note.com は Tailwind ベースになり、カードに意味のあるクラス名が付かなくなった。
  // 固定のセレクタだけだとページやログイン状態でレイアウトが変わると外れるので、
  // 実際に表示されているカードから目印になるクラスを見つけて補う。
  const ARTICLE_HREF_RE = /^(?:https:\/\/note\.com)?\/[^/]+\/n\/n/;
  let detectedTokens = null;

  function detectCardTokens() {
    if (detectedTokens) return detectedTokens;
    const links = [...document.querySelectorAll(NOTE_LINK_SELECTOR)]
      .filter((a) => ARTICLE_HREF_RE.test(a.getAttribute("href") || ""))
      .slice(0, 40);

    const cards = [];
    for (const link of links) {
      const card = findArticleBlock(link);
      if (card) cards.push(card);
    }
    if (cards.length < 3) return null;

    const freq = new Map();
    for (const card of cards) {
      for (const token of card.classList) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }

    // 全カードが共通して持つクラスだけを使い、それらを「すべて併せ持つ要素」に絞る。
    // border-b のような汎用クラスを単独で使うと、別ページでカードより広い範囲を
    // 巻き込むため、AND で組み合わせて特定する。
    const common = [];
    for (const [token, n] of freq) {
      if (n !== cards.length) continue;
      if (/["\\]/.test(token)) continue; // セレクタに埋め込めない文字
      let total;
      try {
        total = document.querySelectorAll(`[class~="${token}"]`).length;
      } catch {
        continue;
      }
      common.push({ token, total });
    }
    if (!common.length) return null;

    // ページ内で珍しいクラスほどカードを言い当てる力が強いので、それを優先する
    common.sort((a, b) => a.total - b.total);
    detectedTokens = common.slice(0, 6).map((c) => c.token);
    return detectedTokens;
  }

  // 固定セレクタ＋このページで検出したカードの目印（検出分はANDで1セレクタ）
  function cardSelector() {
    const tokens = detectCardTokens();
    if (!tokens) return CSS_CARD_SELECTOR;
    return `${CSS_CARD_SELECTOR},${tokens.map((t) => `[class~="${t}"]`).join("")}`;
  }

  // 1クリエイター分のリンクセレクタ
  function creatorLinkSelector(id) {
    return [
      `a[href="/${id}" i]`,
      `a[href^="/${id}/" i]`,
      `a[href^="/${id}?" i]`,
      `a[href="https://note.com/${id}" i]`,
      `a[href^="https://note.com/${id}/" i]`,
      `a[href^="https://note.com/${id}?" i]`,
    ].join(",");
  }

  function buildHideCss() {
    if (!SUPPORTS_HAS) return "";
    const ids = mutedIds.filter((id) => SAFE_ID_RE.test(id));
    if (!ids.length) return "";
    const linkSelector = ids.map(creatorLinkSelector).join(",");
    return `:is(${cardSelector()}):has(:is(${linkSelector})){display:none !important;}`;
  }

  // コンテンツブロッカー（AdGuard等）用のルールを生成する。
  // Userscriptsアプリの注入が遅い環境では、こちらに貼ると描画前に非表示にできる。
  function buildBlockRules() {
    const cards = cardSelector();
    return mutedIds
      .filter((id) => SAFE_ID_RE.test(id))
      .map(
        (id) => `note.com##:is(${cards}):has(:is(${creatorLinkSelector(id)}))`
      )
      .join("\n");
  }

  function applyHideCss() {
    const root = document.documentElement;
    if (!root) return;
    const css = buildHideCss();
    let style = document.getElementById(HIDE_STYLE_ID);
    if (!css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = HIDE_STYLE_ID;
    }
    if (style.textContent !== css) style.textContent = css;
    // note.com の再描画で外された場合に備えて <html> 直下に貼り直す
    if (!style.isConnected) root.appendChild(style);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // クリップボードAPIが使えない場合は、選択済みの入力欄を出して手動コピーしてもらう
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText =
        "position:fixed;top:20%;left:5%;width:90%;height:140px;z-index:1000001;" +
        "font-size:16px;padding:8px;border-radius:8px;border:1px solid #888;";
      document.body.appendChild(ta);
      ta.select();
      ta.addEventListener("blur", () => ta.remove(), { once: true });
      return false;
    }
  }

  // 記事詳細ページのURL判定（DOM判定のフォールバック）
  const ARTICLE_DETAIL_PATH_RE = /^\/[^/]+\/n\/[^/]+/;
  function isArticleDetailPage() {
    return ARTICLE_DETAIL_PATH_RE.test(location.pathname);
  }

  // 「今読んでいる記事自体」のページ最上位 <article> を判定
  function isPageMainArticle(el) {
    if (!el || el.tagName !== "ARTICLE") return false;
    if (el.parentElement && el.parentElement.closest("article")) return false;
    const main = document.querySelector("main");
    const inMainWithH1 = !!(main && main.contains(el) && el.querySelector("h1"));
    return inMainWithH1 || isArticleDetailPage();
  }

  function hideIfMuted(el) {
    if (!mutedIds.length || el.dataset.noteMuted) return;
    if (isPageMainArticle(el)) return;
    const links = el.querySelectorAll("a[href]");
    for (const link of links) {
      // コメント欄内のリンクは別ロジック（findCommentItem）で処理するためスキップ
      if (link.closest(".o-commentSection")) continue;
      const creatorId = extractCreatorId(link.getAttribute("href"));
      if (creatorId && mutedIds.includes(creatorId)) {
        el.style.setProperty("display", "none", "important");
        el.dataset.noteMuted = "true";
        return;
      }
    }
  }

  // コメント1件のwrapper要素を特定する
  function findCommentItem(link) {
    let el = link.parentElement;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("o-commentSection")) return null;
      const firstChild = el.firstElementChild;
      if (
        firstChild &&
        firstChild.classList &&
        firstChild.classList.contains("flex-shrink-0") &&
        firstChild.querySelector(".comment-avatar")
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // リンクから最も近い記事ブロック（非表示対象）を探す
  function findArticleBlock(link) {
    // 埋め込みカード（記事本文中の note 埋め込み figure）が祖先なら最優先でそれを隠す
    const embedFigure = link.closest('figure[embedded-service="note"]');
    if (embedFigure) return embedFigure;

    // 記事詳細ページ本文内のインラインリンクは何も隠さない
    const enclosingArticle = link.closest("article");
    if (enclosingArticle && isPageMainArticle(enclosingArticle)) return null;

    let el = link.parentElement;
    while (el && el !== document.body) {
      if (
        el.matches &&
        el.matches(
          'article, [class*="NoteWrapper"], [class*="noteCard"], [class*="NoteCard"], [class*="TimelineItem"], figure[embedded-service="note"]'
        )
      ) {
        if (el === link) {
          el = el.parentElement;
          continue;
        }
        return el;
      }
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

  function scanAll() {
    if (!mutedIds.length) return;

    // ① カードセレクター方式
    document.querySelectorAll(CARD_SELECTOR).forEach(hideIfMuted);

    // ② リンクスキャン方式で追加検出
    //    相対パスリンクと絶対URLリンクの両方をスキャン
    const allLinks = document.querySelectorAll(NOTE_LINK_SELECTOR);
    for (const link of allLinks) {
      if (link.closest('#nm-panel, #nm-fab, [data-note-muted="true"]')) continue;
      const creatorId = extractCreatorId(link.getAttribute("href"));
      if (!creatorId || !mutedIds.includes(creatorId)) continue;
      // コメント欄内のリンクはコメント1件単位で非表示にする
      const block = link.closest(".o-commentSection")
        ? findCommentItem(link)
        : findArticleBlock(link);
      if (block && !block.dataset.noteMuted) {
        block.style.setProperty("display", "none", "important");
        block.dataset.noteMuted = "true";
      }
    }
  }

  function unhideAll() {
    document.querySelectorAll('[data-note-muted="true"]').forEach((el) => {
      el.style.removeProperty("display");
      delete el.dataset.noteMuted;
    });
  }

  // 新しいノードが追加されたら再スキャン
  function startObserver() {
    let scanTimer = null;
    let pendingSince = 0;
    const DEBOUNCE_MS = 200;
    const MAX_WAIT_MS = 500;

    const run = () => {
      clearTimeout(scanTimer);
      scanTimer = null;
      pendingSince = 0;
      scanAll();
    };

    const observer = new MutationObserver(() => {
      // デバウンスで過度なスキャンを防止。
      // ただし読み込み中はDOMの変更が途切れず、素のデバウンスだと
      // 延期され続けて一度も走らないため、最大500msで必ず実行する。
      const now = Date.now();
      if (!pendingSince) pendingSince = now;
      if (now - pendingSince >= MAX_WAIT_MS) {
        run();
        return;
      }
      clearTimeout(scanTimer);
      scanTimer = setTimeout(run, DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function watchNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        detectedTokens = null; // ページ種別が変わるとカードの形も変わる
        setTimeout(scanAll, 500);
        setTimeout(scanAll, 1500);
      }
    };
    window.addEventListener("popstate", check);
    setInterval(check, 1000);
  }

  // ── フローティングUI ──
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function injectUI() {
    // 既に揃っていれば再注入スキップ（イベントリスナーは document 委譲なので1回で十分）
    if (
      document.getElementById("nm-fab") &&
      document.getElementById("nm-panel") &&
      document.getElementById("nm-toast") &&
      document.getElementById("nm-style")
    ) {
      return;
    }

    // 欠けている要素だけ取り除いて作り直す（中途半端な状態対策）
    document.getElementById("nm-fab")?.remove();
    document.getElementById("nm-panel")?.remove();
    document.getElementById("nm-toast")?.remove();

    if (!document.getElementById("nm-style")) {
      const style = document.createElement("style");
      style.id = "nm-style";
      style.textContent = `
      #nm-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #64748b;
        color: #fff;
        border: none;
        font-size: 22px;
        line-height: 48px;
        text-align: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        z-index: 999999;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.2s;
      }
      #nm-fab:active { transform: scale(0.92); }
      #nm-panel {
        display: none;
        position: fixed;
        bottom: 78px;
        right: 16px;
        width: 300px;
        max-height: 420px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Hiragino Sans", sans-serif;
        overflow: hidden;
        flex-direction: column;
      }
      #nm-panel.open { display: flex; }
      #nm-panel-header {
        background: #64748b;
        color: #fff;
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 600;
      }
      #nm-panel-add {
        display: flex;
        gap: 6px;
        padding: 10px 12px;
        border-bottom: 1px solid #e8e8e8;
      }
      #nm-panel-add input {
        flex: 1;
        padding: 7px 8px;
        border: 1px solid #ccc;
        border-radius: 6px;
        font-size: 16px;
        outline: none;
      }
      #nm-panel-add input:focus { border-color: #64748b; }
      #nm-panel-add button {
        padding: 7px 12px;
        background: #64748b;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }
      #nm-panel-add button:disabled { background: #95a0ad; }
      #nm-list {
        overflow-y: auto;
        flex: 1;
        max-height: 260px;
      }
      #nm-panel-footer {
        border-top: 1px solid #e8e8e8;
        padding: 8px 12px;
      }
      #nm-copy-rules {
        width: 100%;
        padding: 7px 8px;
        background: #f2f4f7;
        color: #475569;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      #nm-copy-rules:active { background: #e2e6ed; }
      .nm-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid #f0f0f0;
      }
      .nm-item-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }
      .nm-item-name {
        font-size: 13px;
        font-weight: 600;
        color: #222;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nm-item-id {
        font-size: 12px;
        color: #888;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nm-item-id::before { content: "@"; color: #aaa; }
      .nm-remove {
        background: none;
        border: none;
        color: #ccc;
        font-size: 16px;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .nm-remove:active { color: #e55; }
      .nm-empty {
        padding: 24px 12px;
        text-align: center;
        color: #aaa;
        font-size: 12px;
        line-height: 1.6;
      }
      .nm-toast {
        position: fixed;
        bottom: 78px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #333;
        color: #fff;
        padding: 7px 14px;
        border-radius: 6px;
        font-size: 12px;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
        white-space: nowrap;
        z-index: 1000000;
      }
      .nm-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
      document.head.appendChild(style);
    }

    // FAB
    const fab = document.createElement("button");
    fab.id = "nm-fab";
    fab.textContent = "🔇";
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement("div");
    panel.id = "nm-panel";
    panel.innerHTML = `
      <div id="nm-panel-header">🔇 ミュート管理</div>
      <div id="nm-panel-add">
        <input type="text" id="nm-input" placeholder="クリエイターID">
        <button id="nm-add-btn">追加</button>
      </div>
      <div id="nm-list"></div>
      <div id="nm-panel-footer">
        <button id="nm-copy-rules">ブロックルールをコピー</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Toast
    const toast = document.createElement("div");
    toast.className = "nm-toast";
    toast.id = "nm-toast";
    document.body.appendChild(toast);

    function showToast(msg) {
      const toastEl = document.getElementById("nm-toast");
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      setTimeout(() => toastEl.classList.remove("show"), 2000);
    }

    function renderList() {
      // SPA遷移で listEl が差し替わる可能性があるので都度取得
      const listEl = document.getElementById("nm-list");
      if (!listEl) return;
      const creators = loadCreators();
      if (creators.length === 0) {
        listEl.innerHTML =
          '<div class="nm-empty">ミュート中のクリエイターはいません。<br>IDを入力して追加してください。</div>';
        return;
      }
      listEl.innerHTML = creators
        .map(
          (c, i) => `
        <div class="nm-item">
          <div class="nm-item-info">
            ${c.nickname ? `<span class="nm-item-name">${escapeHtml(c.nickname)}</span>` : ""}
            <span class="nm-item-id">${escapeHtml(c.id)}</span>
          </div>
          <button class="nm-remove" data-index="${i}">✕</button>
        </div>`
        )
        .join("");
    }

    async function addCreator() {
      const inputEl = document.getElementById("nm-input");
      const addBtnEl = document.getElementById("nm-add-btn");
      if (!inputEl || !addBtnEl) return;

      let id = inputEl.value.trim();
      const urlMatch = id.match(/note\.com\/([^/?#]+)/);
      if (urlMatch) id = urlMatch[1];
      id = id.replace(/^[@/]+/, "").replace(/\/+$/, "");

      if (!id) {
        showToast("クリエイターIDを入力してください");
        return;
      }

      const creators = loadCreators();
      if (creators.some((c) => c.id.toLowerCase() === id.toLowerCase())) {
        showToast(`@${id} は既にミュート中です`);
        inputEl.value = "";
        return;
      }

      addBtnEl.disabled = true;
      addBtnEl.textContent = "取得中…";
      inputEl.disabled = true;

      const nickname = await fetchNickname(id);

      addBtnEl.disabled = false;
      addBtnEl.textContent = "追加";
      inputEl.disabled = false;

      const now = new Date();
      const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
      const entry = { id, addedAt: dateStr };
      if (nickname) entry.nickname = nickname;

      creators.push(entry);
      saveCreators(creators);
      updateMutedIds();
      applyHideCss();
      scanAll();
      renderList();
      inputEl.value = "";
      showToast(
        nickname
          ? `${nickname}(@${id})をミュートしました`
          : `@${id} をミュートしました`
      );
    }

    // ── イベント委譲：document に1回だけ登録。DOMが差し替わっても生き残る ──
    if (window.__nmListenersAttached) {
      renderList();
      return;
    }
    window.__nmListenersAttached = true;

    document.addEventListener("click", (e) => {
      const panelEl = document.getElementById("nm-panel");

      // FABタップ：パネル開閉＋開く時は必ず再描画
      if (e.target.closest("#nm-fab")) {
        if (!panelEl) return;
        const willOpen = !panelEl.classList.contains("open");
        if (willOpen) renderList();
        panelEl.classList.toggle("open");
        return;
      }

      // 追加ボタン
      if (e.target.closest("#nm-add-btn")) {
        addCreator();
        return;
      }

      // ブロックルールをコピー
      if (e.target.closest("#nm-copy-rules")) {
        const rules = buildBlockRules();
        if (!rules) {
          showToast("ミュート中のクリエイターがいません");
          return;
        }
        copyText(rules).then((ok) => {
          showToast(ok ? "ルールをコピーしました" : "手動でコピーしてください");
        });
        return;
      }

      // ミュート解除ボタン
      const removeBtn = e.target.closest(".nm-remove");
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        const creators = loadCreators();
        const removed = creators.splice(idx, 1)[0];
        if (!removed) return;
        saveCreators(creators);
        updateMutedIds();
        applyHideCss();
        unhideAll();
        scanAll();
        renderList();
        showToast(`@${removed.id} のミュートを解除しました`);
        return;
      }

      // パネル外タップで閉じる
      if (
        panelEl &&
        panelEl.classList.contains("open") &&
        !panelEl.contains(e.target)
      ) {
        panelEl.classList.remove("open");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.target && e.target.id === "nm-input" && e.key === "Enter") {
        addCreator();
      }
    });

    renderList();
  }

  // ── 初期化 ──
  function init() {
    updateMutedIds();
    applyHideCss();
    injectUI();
    scanAll();
    startObserver();
    watchNavigation();
    setTimeout(scanAll, 1000);
    setTimeout(scanAll, 3000);
    // UI・CSSが note.com の SPA 再描画で消えた場合に備えて定期的に貼り直す
    setInterval(() => {
      injectUI();
      applyHideCss();
    }, 2000);
  }

  // DOM構築を待たずに、まずCSSだけ先に当てる（document-start で実行）
  updateMutedIds();
  applyHideCss();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
