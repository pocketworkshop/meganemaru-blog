(()=>{
  const PINK='#ef527b';
  function apply(){
    const b=document.getElementById('shareX');
    if(b)b.textContent='𝕏 Xに投稿';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();

  // Generated PNG uses canvas directly. Replace only the exact near-white name color
  // used immediately before drawing participant names.
  const original=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){
    if(this.fillStyle==='rgba(255, 255, 255, 0.96)' || this.fillStyle==='rgba(255,255,255,.96)'){
      const old=this.fillStyle, oldFont=this.font;
      this.fillStyle=PINK;
      this.font='bold 12px sans-serif';
      const r=maxWidth===undefined?original.call(this,text,x,y):original.call(this,text,x,y,maxWidth);
      this.fillStyle=old; this.font=oldFont;
      return r;
    }
    return maxWidth===undefined?original.call(this,text,x,y):original.call(this,text,x,y,maxWidth);
  };
})();
