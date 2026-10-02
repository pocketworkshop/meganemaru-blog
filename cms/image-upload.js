const MAX_STORED = 2 * 1024 * 1024;
const MAX_SOURCE = 20 * 1024 * 1024;
export async function prepareImage(file) {
 if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw Error('JPEG・PNG・WebP・GIFを選んでください。SVG・HEIC・動画は保存できません。');
 if (file.size > MAX_SOURCE) throw Error('選択した画像は20MiBを超えています。端末で写真を縮小してから選び直してください。');
 // Keep transparency and animation: PNG/GIF/WebP are never flattened onto canvas.
 if (file.type !== 'image/jpeg') {
  if (file.size > MAX_STORED) throw Error('PNG・GIF・WebPは透明部分や動きを保つため自動変換しません。KVの容量を節約するため、端末で2MiB（約2.1MB）以下にしてから選び直してください。');
  return {file, note:'元の形式を保持'};
 }
 const url=URL.createObjectURL(file), image=new Image();
 try {
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('JPEG写真を読み取れません。壊れていない別の画像を選んでください。'));image.src=url;});
  const {naturalWidth:w,naturalHeight:h}=image;
  if (!w||!h||w*h>32000000) throw Error('写真の画素数が大きすぎます（上限3,200万画素）。端末で縮小してから選び直してください。');
  if (Math.max(w,h)<=1600 && file.size<=MAX_STORED) return {file,note:'元のJPEGを保持'};
  const scale=Math.min(1,1600/Math.max(w,h)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('このブラウザでは写真を縮小できません。端末で2MiB以下にしてから選び直してください。');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  let blob=await encode(0.85);
  if(blob?.size>MAX_STORED)blob=await encode(0.78);
  if(!blob||blob.type!=='image/jpeg')throw Error('写真の圧縮に失敗しました。別のJPEG画像を選び直してください。');
  if(blob.size>MAX_STORED)throw Error('写真を縮小・圧縮しても2MiBを超えました。端末でさらに小さくしてから選び直してください。');
  // Never enlarge a small image or increase its stored file size.
  if(Math.max(w,h)<=1600&&blob.size>=file.size)return {file,note:'元のJPEGを保持'};
  return {file:new File([blob],file.name,{type:'image/jpeg'}),note:`${canvas.width}×${canvas.height}pxに最適化`};
 } finally {URL.revokeObjectURL(url);}
}
