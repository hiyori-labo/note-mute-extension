// ==UserScript==
// @name         note ミュート
// @namespace    https://github.com/hiyori-labo/note-mute-extension
// @version      1.0.0
// @description  noteのホームフィードから特定クリエイターの記事を非表示にします
// @match        https://note.com/*
// @run-at       document-idle
// @noframes
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
    'section.m-largeNoteWrapper, [class*="NoteWrapper"], article, [class*="noteCard"], [class*="NoteCard"]';

  function hideIfMuted(el) {
    if (!mutedIds.length || el.dataset.noteMuted) return;
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
    let el = link.parentElement;
    while (el && el !== document.body) {
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
    const observer = new MutationObserver(() => {
      // デバウンスで過度なスキャンを防止
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(scanAll, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function watchNavigation() {
    let lastUrl = location.href;
    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
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

      // ミュート解除ボタン
      const removeBtn = e.target.closest(".nm-remove");
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        const creators = loadCreators();
        const removed = creators.splice(idx, 1)[0];
        if (!removed) return;
        saveCreators(creators);
        updateMutedIds();
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
    injectUI();
    scanAll();
    startObserver();
    watchNavigation();
    setTimeout(scanAll, 1000);
    setTimeout(scanAll, 3000);
    // UIが note.com の SPA 再描画で消えた場合に備えて定期的に再注入
    setInterval(injectUI, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
