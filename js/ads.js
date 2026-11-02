// Рекламные экраны города: билборды и экран на небоскрёбе.
// Ролики крутятся по кругу. Для настоящего рекламодателя добавь объект {n, img:'ads/brand.png', frames:8, fps:6} —
// img это спрайт-лист: кадры лежат в ряд слева направо, любого размера (масштабируется под экран).
export const AD_SEC=7;
export const ADS=[
  {n:'Ваша реклама',kind:'yours'},
  {n:'Шаурма 24/7',kind:'shawarma'},
  {n:'Квас «Холодок»',kind:'kvas'},
  {n:'Пиксельбанк',kind:'bank'},
  {n:'Такси «Шашка»',kind:'taxi'},
];

const imgs={};
function img(src){if(!imgs[src]){const i=new Image();i.src=src;imgs[src]=i;}return imgs[src];}
const hsh=n=>{const s=Math.sin(n*127.1)*43758.5453;return s-Math.floor(s);};

function text(c,s,x,y,col,size=8,align='center'){c.font=`bold ${size}px monospace`;c.textAlign=align;c.textBaseline='middle';c.fillStyle='#000';c.fillText(s,x+1,y+1);c.fillStyle=col;c.fillText(s,x,y);}

export function drawAd(c,w,h,ad,t){
  c.imageSmoothingEnabled=false;
  if(ad.img){const im=img(ad.img);c.fillStyle='#000';c.fillRect(0,0,w,h);
    if(im.complete&&im.naturalWidth){const n=ad.frames||1,f=Math.floor(t*(ad.fps||6))%n,fw=im.naturalWidth/n;c.drawImage(im,f*fw,0,fw,im.naturalHeight,0,0,w,h);}return;}
  const tall=h>w,cx=w/2;
  switch(ad.kind){
    case 'yours':{c.fillStyle='#14101c';c.fillRect(0,0,w,h);
      // бегущие огоньки по рамке
      const per=2*(w+h);for(let k=0;k<per;k+=4){const on=Math.floor(k/4+t*8)%3===0;c.fillStyle=on?'#ffd166':'#5a4a2a';
        const p=k<w?[k,0]:k<w+h?[w-2,k-w]:k<2*w+h?[w-(k-w-h)-2,h-2]:[0,h-(k-2*w-h)-2];c.fillRect(p[0],p[1],2,2);}
      const words=['ВАША','РЕКЛАМА','ЗДЕСЬ'];
      if(tall){words.forEach((s,i)=>text(c,s,cx,h*.3+i*10,i===1?'#ffd166':'#fff',7));}
      else{const i=Math.floor(t*1.2)%3;text(c,words[i],cx,h*.42,i===1?'#ffd166':'#fff',10);text(c,'Пиксельград',cx,h*.78,'#9fd3ff',6);}
      break;}
    case 'shawarma':{c.fillStyle='#e67e22';c.fillRect(0,0,w,h);c.fillStyle='#d35400';for(let y=0;y<h;y+=4)if((y/4+Math.floor(t*4))%2)c.fillRect(0,y,w,2);
      // вертел
      const sx=tall?cx:w*.25,sy=tall?h*.55:h*.5,sh=tall?h*.5:h*.75,sw=tall?w*.45:w*.22;c.fillStyle='#555';c.fillRect(sx-1,sy-sh/2-3,2,sh+6);
      for(let y=0;y<sh;y+=2){const k=1-Math.abs(y/sh-.45)*1.1,ww=sw*k;c.fillStyle=(Math.floor(y/2+t*10)%3)?'#8b4513':'#c0712b';c.fillRect(sx-ww/2,sy-sh/2+y,ww,2);}
      if(tall){text(c,'ШАУРМА',cx,7,'#fff',7);text(c,'24/7',cx,h-7,'#ffd166',8);}
      else{text(c,'ШАУРМА',w*.66,h*.35,'#fff',9);text(c,'24/7',w*.66,h*.72,Math.floor(t*3)%2?'#ffd166':'#fff',9);}
      break;}
    case 'kvas':{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#f6d365');g.addColorStop(1,'#c47a1c');c.fillStyle=g;c.fillRect(0,0,w,h);
      for(let k=0;k<14;k++){const x=hsh(k)*w,y=h-((t*12+hsh(k+9)*h)%h);c.fillStyle='rgba(255,255,255,.7)';c.fillRect(x,y,2,2);}
      const mx=tall?cx-6:w*.18,my=tall?h*.4:h*.3;c.fillStyle='#7a3e10';c.fillRect(mx,my,12,16);c.fillStyle='#fff';c.fillRect(mx,my-3+Math.sin(t*4),12,4);c.fillStyle='#7a3e10';c.fillRect(mx+12,my+4,3,7);
      if(tall){text(c,'КВАС',cx,h*.75,'#fff',8);text(c,'Холодок',cx,h*.88,'#4a1e00',6);}
      else{text(c,'КВАС',w*.62,h*.35,'#fff',10);text(c,'«Холодок»',w*.62,h*.72,'#4a1e00',7);}
      break;}
    case 'bank':{c.fillStyle='#145a32';c.fillRect(0,0,w,h);
      for(let k=0;k<10;k++){const x=4+hsh(k+3)*(w-8),y=((t*20+hsh(k)*h*2)%(h+20))-10;c.fillStyle='#f1c40f';c.fillRect(x,y,5,5);c.fillStyle='#b7950b';c.fillRect(x+1,y+1,3,3);}
      if(tall){text(c,'ПИКСЕЛЬ',cx,h*.35,'#fff',7);text(c,'БАНК',cx,h*.48,'#fff',8);text(c,'кешбэк 5%',cx,h*.8,'#f1c40f',6);}
      else{text(c,'ПИКСЕЛЬБАНК',cx,h*.38,'#fff',8);text(c,'кешбэк 5%',cx,h*.75,Math.floor(t*2)%2?'#f1c40f':'#fff',8);}
      break;}
    case 'taxi':{c.fillStyle='#0b1a33';c.fillRect(0,0,w,h);for(let k=0;k<8;k++){c.fillStyle='#ffd977';c.fillRect(hsh(k)*w,hsh(k+5)*h*.4,1,1);}
      const ry=h*.72;c.fillStyle='#333';c.fillRect(0,ry,w,h-ry);c.fillStyle='#fff';for(let x=-((t*30)%12);x<w;x+=12)c.fillRect(x,ry+(h-ry)/2,6,1);
      const carX=(t*18)%(w+24)-24;c.fillStyle='#f1c40f';c.fillRect(carX,ry-6,20,6);c.fillRect(carX+4,ry-10,11,4);c.fillStyle='#222';c.fillRect(carX+3,ry,4,2);c.fillRect(carX+13,ry,4,2);
      c.fillStyle='#222';for(let k=0;k<4;k++)c.fillRect(carX+2+k*4,ry-4,2,2);
      if(tall){text(c,'ТАКСИ',cx,h*.2,'#f1c40f',8);text(c,'«Шашка»',cx,h*.33,'#fff',6);}
      else{text(c,'ТАКСИ «ШАШКА»',cx,h*.3,'#f1c40f',8);}
      break;}
  }
}
