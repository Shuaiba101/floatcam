const HEIC_RE = /\.(heic|heif)$/i;

export function isHeicName(name) {
  return HEIC_RE.test(name);
}

function probeImageUrl(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

export function revokeDisplayUrl(item) {
  if (item._displayUrl && item._displayUrl !== item._url) {
    URL.revokeObjectURL(item._displayUrl);
  }
  item._displayUrl = null;
  item.displayError = null;
  item.displayReady = false;
}

/** @returns {Promise<{ url: string | null, error: string | null }>} */
export async function prepareDisplaySource(item, objectUrlFn) {
  if (item.displayError) {
    return { url: null, error: item.displayError };
  }
  if (item._displayUrl) {
    return { url: item._displayUrl, error: null };
  }

  const rawUrl = objectUrlFn(item);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(item.file, {
        imageOrientation: 'from-image',
      });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });
      if (blob) {
        item._displayUrl = URL.createObjectURL(blob);
        item.displayReady = true;
        return { url: item._displayUrl, error: null };
      }
    } catch {
      // fall through to <img> probe
    }
  }

  const ok = await probeImageUrl(rawUrl);
  if (ok) {
    item._displayUrl = rawUrl;
    item.displayReady = true;
    return { url: rawUrl, error: null };
  }

  const hint = isHeicName(item.name)
    ? '当前浏览器无法预览 HEIC/HEIF，可换用 Safari，或导出为 JPEG 后再导入。'
    : '当前浏览器无法解码此图片格式，仍可凭文件名删除或保留。';
  item.displayError = hint;
  return { url: null, error: hint };
}