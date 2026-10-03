(() => {
  const input = document.getElementById('imageFile');
  const message = document.getElementById('imageMessage');
  if (!input) return;

  const MAX_STORED = 2 * 1024 * 1024;
  const MAX_SOURCE = 30 * 1024 * 1024;
  const MAX_EDGE = 1600;

  const setMessage = (text) => {
    if (message) message.textContent = text;
  };

  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み取れませんでした。'));
    };
    img.src = url;
  });

  const canvasBlob = (canvas, type, quality) =>
    new Promise(resolve => canvas.toBlob(resolve, type, quality));

  async function optimize(file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error('JPEG・PNG・WebP・GIFを選んでください。');
    }
    if (file.size > MAX_SOURCE) {
      throw new Error('画像が30MiBを超えています。端末で少し縮小してから選び直してください。');
    }

    // GIFはアニメーションを壊さないため変換しない。
    if (file.type === 'image/gif') {
      if (file.size > MAX_STORED) {
        throw new Error('GIFはアニメーション保持のため自動圧縮しません。2MiB以下のGIFを選んでください。');
      }
      return { file, note: 'GIFは元の形式を保持' };
    }

    const { img, url } = await loadImage(file);
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || w * h > 40000000) {
        throw new Error('画像の画素数が大きすぎます。端末で少し縮小してから選び直してください。');
      }

      // 小さく、すでに2MiB以下なら無駄な再圧縮をしない。
      if (Math.max(w, h) <= MAX_EDGE && file.size <= MAX_STORED) {
        return { file, note: '元画像をそのまま使用' };
      }

      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('このブラウザでは画像を圧縮できません。');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // PNG/JPEG/WebPをWebPへ。透過PNGも透過を維持できる。
      let blob = null;
      for (const q of [0.84, 0.76, 0.68, 0.60]) {
        blob = await canvasBlob(canvas, 'image/webp', q);
        if (blob && blob.size <= MAX_STORED) break;
      }
      if (!blob || blob.type !== 'image/webp') {
        throw new Error('画像の自動圧縮に失敗しました。');
      }
      if (blob.size > MAX_STORED) {
        throw new Error('自動圧縮しても2MiBを超えました。端末でさらに小さくしてから選び直してください。');
      }

      const base = (file.name || 'image').replace(/\.[^.]+$/, '');
      const optimized = new File([blob], `${base}.webp`, { type: 'image/webp' });
      return {
        file: optimized,
        note: `${canvas.width}×${canvas.height}px / ${(optimized.size / 1024).toFixed(0)}KB に自動圧縮`
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  input.addEventListener('change', async () => {
    const original = input.files && input.files[0];
    if (!original) return;

    // 既存CMSが処理する前に、必要な画像だけ圧縮してfile input自体を差し替える。
    try {
      setMessage(`画像を確認中… 元 ${(original.size / 1024 / 1024).toFixed(1)}MB`);
      const result = await optimize(original);

      if (result.file !== original) {
        const dt = new DataTransfer();
        dt.items.add(result.file);
        input.files = dt.files;
      }

      setMessage(`${result.note}。このまま「アップロードして挿入」を押してください。`);
    } catch (err) {
      setMessage(err?.message || '画像の自動圧縮に失敗しました。');
      input.value = '';
    }
  }, true);
})();