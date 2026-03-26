(() => {
  const input = document.getElementById("creatorInput");
  const addBtn = document.getElementById("addBtn");
  const listSection = document.getElementById("listSection");
  const emptyMsg = document.getElementById("emptyMsg");
  const toast = document.getElementById("toast");

  let mutedCreators = [];

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }

  // note APIからクリエイターの表示名を取得
  async function fetchCreatorInfo(id) {
    try {
      const res = await fetch(`https://note.com/api/v2/creators/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.nickname || null;
    } catch {
      return null;
    }
  }

  function setAddingState(loading) {
    addBtn.disabled = loading;
    addBtn.textContent = loading ? "取得中…" : "追加";
    input.disabled = loading;
  }

  function save() {
    chrome.storage.sync.set({ mutedCreators });
  }

  function render() {
    // 既存のアイテムを削除
    listSection.querySelectorAll(".muted-item").forEach((el) => el.remove());

    if (mutedCreators.length === 0) {
      emptyMsg.style.display = "";
      return;
    }
    emptyMsg.style.display = "none";

    mutedCreators.forEach((creator, index) => {
      const item = document.createElement("div");
      item.className = "muted-item";
      item.innerHTML = `
        <div class="creator-info">
          ${creator.nickname ? `<span class="creator-name">${escapeHtml(creator.nickname)}</span>` : ""}
          <span class="creator-id">${escapeHtml(creator.id)}</span>
          ${creator.addedAt ? `<span class="creator-memo">${escapeHtml(creator.addedAt)} に追加</span>` : ""}
        </div>
        <button class="remove-btn" data-index="${index}" title="ミュート解除">✕</button>
      `;
      listSection.appendChild(item);
    });

    // 削除ボタンのイベント
    listSection.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        const removed = mutedCreators.splice(idx, 1)[0];
        save();
        render();
        showToast(`@${removed.id} のミュートを解除しました`);
      });
    });
  }

  async function addCreator() {
    let id = input.value.trim();

    // URLが貼られた場合もIDを抽出
    const urlMatch = id.match(/note\.com\/([^/?#]+)/);
    if (urlMatch) {
      id = urlMatch[1];
    }

    // @やスラッシュの除去
    id = id.replace(/^[@/]+/, "").replace(/\/+$/, "");

    if (!id) {
      showToast("クリエイターIDを入力してください");
      return;
    }

    // 重複チェック
    if (mutedCreators.some((c) => c.id.toLowerCase() === id.toLowerCase())) {
      showToast(`@${id} は既にミュート中です`);
      input.value = "";
      return;
    }

    // APIから表示名を取得
    setAddingState(true);
    const nickname = await fetchCreatorInfo(id);
    setAddingState(false);

    const now = new Date();
    const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;

    const entry = { id, addedAt: dateStr };
    if (nickname) entry.nickname = nickname;

    mutedCreators.push(entry);
    save();
    render();
    input.value = "";
    showToast(nickname ? `${nickname}(@${id})をミュートしました` : `@${id} をミュートしました`);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // イベント
  addBtn.addEventListener("click", addCreator);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCreator();
  });

  // 初期読み込み
  chrome.storage.sync.get({ mutedCreators: [] }, (result) => {
    mutedCreators = result.mutedCreators;
    render();
  });
})();
