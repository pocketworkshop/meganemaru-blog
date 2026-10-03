(() => {
  const allowedCategories = ['SKE48','競馬','ゲーム','便利ツール','雑記'];
  const $ = id => document.getElementById(id);

  function parseFrontMatter(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
    if (!m) throw new Error('先頭に --- で囲んだ記事情報がありません。');
    const meta = {};
    for (const line of m[1].split('\n')) {
      const hit = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!hit) continue;
      let value = hit[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
      meta[hit[1].toLowerCase()] = value;
    }
    return { meta, body: m[2].trim() };
  }

  function setField(id, value) {
    const el=$(id);
    if (!el || value == null) return;
    el.value=value;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function pasteMarkdown(markdown) {
    const target=$('editor')?.querySelector('.tiptap') || $('editor');
    if (!target) throw new Error('本文エディターを開けませんでした。');
    target.focus();

    // 新規記事なので本文全体を選択して置き換える。
    const sel=window.getSelection(), range=document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges(); sel.addRange(range);

    const dt=new DataTransfer();
    dt.setData('text/plain', markdown);
    let ev;
    try {
      ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});
    } catch {
      ev=new Event('paste',{bubbles:true,cancelable:true});
      Object.defineProperty(ev,'clipboardData',{value:dt});
    }
    target.dispatchEvent(ev);
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error('Markdownファイルが大きすぎます（上限2MiB）。');
    const text=await file.text();
    const {meta,body}=parseFrontMatter(text);

    if (!meta.title) throw new Error('title がありません。');
    if (meta.title.length > 200) throw new Error('title は200文字以内にしてください。');
    if (!meta.category) throw new Error('category がありません。');
    if (!allowedCategories.includes(meta.category))
      throw new Error(`category は ${allowedCategories.join(' / ')} のいずれかにしてください。`);
    if (meta.summary && meta.summary.length > 240) throw new Error('summary は240文字以内にしてください。');
    if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date))
      throw new Error('date は YYYY-MM-DD 形式にしてください。');

    // 一覧画面からなら新規記事画面を開く。
    if (!$('listView')?.hidden) {
      $('newPost')?.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    setField('title',meta.title);
    setField('category',meta.category);
    setField('date',meta.date || new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()));
    setField('summary',meta.summary || '');
    // slug はCMSの自動生成に任せる。
    setField('slug','');

    pasteMarkdown(body || '');
    const notice=$('notice');
    if (notice) {
      notice.textContent=`「${meta.title}」をMarkdownから読み込みました。内容を確認して保存・公開してください。`;
      notice.classList.remove('error');
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function install() {
    const newPost=$('newPost');
    if (!newPost || $('mdImportButton')) return;

    const input=document.createElement('input');
    input.type='file'; input.id='mdImportFile'; input.accept='.md,text/markdown,text/plain'; input.hidden=true;

    const button=document.createElement('button');
    button.type='button'; button.id='mdImportButton'; button.textContent='MDを読み込む';

    newPost.parentNode.insertBefore(button,newPost);
    newPost.parentNode.insertBefore(input,newPost);

    input.addEventListener('change', async () => {
      try { await importFile(input.files?.[0]); }
      catch(e) {
        const notice=$('notice');
        if (notice) { notice.textContent=e.message; notice.classList.add('error'); }
        else alert(e.message);
      } finally { input.value=''; }
    });
    button.addEventListener('click',()=>input.click());
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install);
  else install();
})();