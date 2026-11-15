const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

const state = {
  items: [],
  index: 0,
  toDelete: [],
  toKeep: [],
  dirHandle: null,
  mode: null, // 'files' | 'folder'
};

const els = {
  pickFiles: document.getElementById('pick-files'),
  pickFolder: document.getElementById('pick-folder'),
  fileInput: document.getElementById('file-input'),
  stage: document.getElementById('stage'),
  cardStack: document.getElementById('card-stack'),
  statRemain: document.getElementById('stat-remain'),
  statDelete: document.getElementById('stat-delete'),
  statKeep: document.getElementById('stat-keep'),
  btnReview: document.getElementById('btn-review'),
  organizePanel: document.getElementById('organize-panel'),
  reviewPanel: document.getElementById('review-panel'),
  reviewGrid: document.getElementById('review-grid'),
  reviewSummary: document.getElementById('review-summary'),
  modeBanner: document.getElementById('mode-banner'),
  btnBack: document.getElementById('btn-back'),
  btnConfirmDelete: document.getElementById('btn-confirm-delete'),
  dialog: document.getElementById('confirm-dialog'),
  dialogText: document.getElementById('dialog-text'),
  dialogCancel: document.getElementById('dialog-cancel'),
  dialogOk: document.getElementById('dialog-ok'),
  btnDelete: document.getElementById('btn-swipe-delete'),
  btnKeep: document.getElementById('btn-swipe-keep'),
};

const SWIPE_THRESHOLD = 90;
const MAX_ROTATION = 12;

function isImageName(name) {
  return IMAGE_RE.test(name);
}

function objectUrl(item) {
  if (!item._url) item._url = URL.createObjectURL(item.file);
  return item._url;
}

function revokeItem(item) {
  if (item._url) {
    URL.revokeObjectURL(item._url);
    item._url = null;
  }
}

function updateStats() {
  const remain = Math.max(0, state.items.length - state.index);
  els.statRemain.textContent = remain;
  els.statDelete.textContent = state.toDelete.length;
  els.statKeep.textContent = state.toKeep.length;
  els.btnReview.disabled = state.toDelete.length === 0;
}

function setModeBanner() {
  if (state.mode === 'folder') {
    els.modeBanner.textContent =
      '已从文件夹加载。确认删除后将从磁盘永久删除这些文件，请谨慎操作。';
    els.modeBanner.classList.remove('hidden');
  } else if (state.mode === 'files') {
    els.modeBanner.textContent =
      '当前为「选择照片」模式：只能标记删/留，无法从手机或电脑磁盘直接删文件。如需真实删除，请返回并用「选择文件夹」。';
    els.modeBanner.classList.remove('hidden');
  } else {
    els.modeBanner.classList.add('hidden');
  }
}

function resetSession() {
  state.items.forEach(revokeItem);
  state.items = [];
  state.index = 0;
  state.toDelete = [];
  state.toKeep = [];
  state.dirHandle = null;
  state.mode = null;
  setModeBanner();
  updateStats();
  renderCard();
}

async function loadFromFileList(fileList) {
  resetSession();
  state.mode = 'files';
  const files = [...fileList].filter(
    (f) => f.type.startsWith('image/') || isImageName(f.name),
  );
  files.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  state.items = files.map((file) => ({ file, name: file.name, handle: null }));
  setModeBanner();
  updateStats();
  renderCard();
}

async function loadFromDirectory(dirHandle) {
  resetSession();
  state.dirHandle = dirHandle;
  state.mode = 'folder';
  const entries = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isImageName(entry.name)) {
      const file = await entry.getFile();
      entries.push({ file, name: entry.name, handle: entry });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  state.items = entries;
  setModeBanner();
  updateStats();
  renderCard();
}

function currentItem() {
  return state.items[state.index] ?? null;
}

function showEmpty() {
  els.cardStack.innerHTML = '';
  const done = state.index >= state.items.length && state.items.length > 0;
  const div = document.createElement('div');
  div.className = 'hint-empty';
  if (state.items.length === 0) {
    div.textContent = '请选择照片或文件夹开始整理';
  } else if (done) {
    div.innerHTML = '本批照片已整理完毕。<br>可点击下方「复核删除」处理标记为删除的照片。';
  }
  els.cardStack.appendChild(div);
}

function renderCard() {
  els.cardStack.innerHTML = '';
  const item = currentItem();
  if (!item) {
    showEmpty();
    return;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.index = String(state.index);

  const img = document.createElement('img');
  img.src = objectUrl(item);
  img.alt = item.name;
  img.draggable = false;

  const labelKeep = document.createElement('div');
  labelKeep.className = 'card-label keep';
  labelKeep.textContent = '保留';

  const labelDelete = document.createElement('div');
  labelDelete.className = 'card-label delete';
  labelDelete.textContent = '删除';

  card.append(img, labelKeep, labelDelete);
  els.cardStack.appendChild(card);
  attachDrag(card, labelKeep, labelDelete);
}

function attachDrag(card, labelKeep, labelDelete) {
  let startX = 0;
  let dragging = false;
  let pointerId = null;

  const onStart = (x, id) => {
    dragging = true;
    startX = x;
    pointerId = id;
    card.setPointerCapture?.(id);
  };

  const onMove = (x) => {
    if (!dragging) return;
    const dx = x - startX;
    const rot = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, dx * 0.08));
    card.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;

    const intensity = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
    if (dx > 20) {
      labelKeep.style.opacity = String(intensity);
      labelDelete.style.opacity = '0';
    } else if (dx < -20) {
      labelDelete.style.opacity = String(intensity);
      labelKeep.style.opacity = '0';
    } else {
      labelKeep.style.opacity = '0';
      labelDelete.style.opacity = '0';
    }
  };

  const finish = (x) => {
    if (!dragging) return;
    dragging = false;
    const dx = x - startX;
    card.releasePointerCapture?.(pointerId);
    pointerId = null;

    if (dx > SWIPE_THRESHOLD) {
      animateOff(card, 1, () => decide('keep'));
    } else if (dx < -SWIPE_THRESHOLD) {
      animateOff(card, -1, () => decide('delete'));
    } else {
      card.style.transition = 'transform 0.2s ease';
      card.style.transform = '';
      labelKeep.style.opacity = '0';
      labelDelete.style.opacity = '0';
      setTimeout(() => {
        card.style.transition = '';
      }, 200);
    }
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    onStart(e.clientX, e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    onMove(e.clientX);
  });
  card.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    finish(e.clientX);
  });
  card.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    finish(startX);
  });
}

function animateOff(card, direction, cb) {
  card.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
  card.style.transform = `translateX(${direction * 420}px) rotate(${direction * 18}deg)`;
  card.style.opacity = '0.4';
  setTimeout(cb, 220);
}

function decide(kind) {
  const item = currentItem();
  if (!item) return;
  if (kind === 'delete') state.toDelete.push(item);
  else state.toKeep.push(item);
  state.index += 1;
  updateStats();
  renderCard();
}

function showOrganize() {
  els.organizePanel.classList.add('active');
  els.reviewPanel.classList.remove('active');
}

function showReview() {
  els.organizePanel.classList.remove('active');
  els.reviewPanel.classList.add('active');
  els.reviewGrid.innerHTML = '';
  state.toDelete.forEach((item) => {
    const img = document.createElement('img');
    img.src = objectUrl(item);
    img.alt = item.name;
    img.title = item.name;
    els.reviewGrid.appendChild(img);
  });
  const disk = state.mode === 'folder';
  els.reviewSummary.textContent = `共 ${state.toDelete.length} 张待删除${
    disk ? '（将从文件夹中永久删除）' : '（仅标记；磁盘文件不会被自动删除）'
  }`;
  els.btnConfirmDelete.textContent = disk ? '确认并从磁盘删除' : '确认标记删除';
}

async function executeDelete() {
  const names = [...state.toDelete];
  let removed = 0;
  const errors = [];

  if (state.mode === 'folder' && state.dirHandle) {
    for (const item of names) {
      try {
        await state.dirHandle.removeEntry(item.name);
        removed += 1;
        revokeItem(item);
      } catch (err) {
        errors.push(`${item.name}: ${err.message}`);
      }
    }
  } else {
    removed = names.length;
    names.forEach(revokeItem);
  }

  state.toDelete = [];
  state.items = state.items.filter(
    (it) => !names.some((d) => d.name === it.name && d.file === it.file),
  );
  state.index = Math.min(state.index, state.items.length);
  updateStats();
  showOrganize();
  renderCard();

  let msg = state.mode === 'folder'
    ? `已从磁盘删除 ${removed} 个文件。`
    : `已从待整理列表移除 ${removed} 张标记删除的照片（磁盘文件未改动）。`;
  if (errors.length) msg += `\n部分失败：\n${errors.join('\n')}`;
  alert(msg);
}

function openDialog() {
  const n = state.toDelete.length;
  const disk = state.mode === 'folder';
  els.dialogText.textContent = disk
    ? `确定要从文件夹中永久删除这 ${n} 张照片吗？此操作无法撤销。`
  : `确定将这 ${n} 张照片标记为删除并从当前整理队列移除吗？（不会自动删除磁盘上的原文件）`;
  els.dialog.classList.add('open');
}

function closeDialog() {
  els.dialog.classList.remove('open');
}

els.pickFiles.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files?.length) loadFromFileList(els.fileInput.files);
  els.fileInput.value = '';
});

els.pickFolder.addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    alert('当前浏览器不支持文件夹选择，请使用 Chrome/Edge 桌面版，或通过「选择照片」导入。');
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await loadFromDirectory(dir);
  } catch (e) {
    if (e.name !== 'AbortError') alert(`无法打开文件夹：${e.message}`);
  }
});

els.btnDelete.addEventListener('click', () => {
  const card = els.cardStack.querySelector('.card');
  if (card) animateOff(card, -1, () => decide('delete'));
  else decide('delete');
});

els.btnKeep.addEventListener('click', () => {
  const card = els.cardStack.querySelector('.card');
  if (card) animateOff(card, 1, () => decide('keep'));
  else decide('keep');
});

els.btnReview.addEventListener('click', showReview);
els.btnBack.addEventListener('click', showOrganize);
els.btnConfirmDelete.addEventListener('click', openDialog);
els.dialogCancel.addEventListener('click', closeDialog);
els.dialogOk.addEventListener('click', async () => {
  closeDialog();
  await executeDelete();
});

setModeBanner();
updateStats();
renderCard();