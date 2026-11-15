(function(){
'use strict';
const app=document.getElementById('app');

/* ---------- helpers ---------- */
function h(tag,props,...kids){
  const e=document.createElement(tag);
  for(const k in props||{}){
    const v=props[k];
    if(k==='class')e.className=v;
    else if(k==='style')e.style.cssText=v;
    else if(k==='html')e.innerHTML=v;
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
    else if(v===true)e.setAttribute(k,'');
    else if(v!==false&&v!=null)e.setAttribute(k,v);
  }
  for(const c of kids.flat()){
    if(c==null||c===false)continue;
    e.append(c.nodeType?c:document.createTextNode(String(c)));
  }
  return e;
}
const rand=n=>Math.floor(Math.random()*n);
const R=(a,b)=>a+Math.random()*(b-a);
const RI=(a,b)=>a+rand(b-a+1);
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
const pc=m=>{let c=0;while(m){m&=m-1;c++}return c};
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const NS='http://www.w3.org/2000/svg';

let mem={};
let deferredPrompt=null;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;if(location.hash==='#options')route()});
const store={
  get(){try{return JSON.parse(localStorage.getItem('cortex-arcade'))||mem}catch(e){return mem}},
  set(o){mem=o;try{localStorage.setItem('cortex-arcade',JSON.stringify(o))}catch(e){}}
};
function settings(){return Object.assign({sound:true,haptics:true,theme:'system'},store.get().settings||{})}
function saveSettings(p){const s=store.get();s.settings=Object.assign(settings(),p);store.set(s);applyTheme()}
function applyTheme(){
  const t=settings().theme,r=document.documentElement;
  if(t==='system')r.removeAttribute('data-theme');else r.setAttribute('data-theme',t);
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute('content',getComputedStyle(document.body).backgroundColor||'#F7F3FB');
}
let actx=null;
function sfx(kind){
  const st=settings();
  if(st.haptics&&kind!=='tick'&&navigator.vibrate){try{navigator.vibrate(kind==='no'?[30,40,30]:kind==='win'?[20,30,60]:10)}catch(e){}}
  if(!st.sound)return;
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended')actx.resume();
    const seq={tick:[[660,.04]],ok:[[660,.07],[880,.09]],no:[[220,.13]],win:[[523,.1],[659,.1],[784,.1],[1047,.22]]}[kind]||[];
    let t=actx.currentTime;
    seq.forEach(([f,d])=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.type=kind==='no'?'triangle':'sine';o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+d+.02);t+=d*.9;
    });
  }catch(e){}
}
function getBest(k){return (store.get().best||{})[k]}
function record(k,v,lower){
  const s=store.get();s.best=s.best||{};
  const old=s.best[k];
  const isNew=old==null||(lower?v<old:v>old);
  if(isNew)s.best[k]=v;
  s.plays=(s.plays||0)+1;
  const d=new Date(),ds=x=>x.getFullYear()+'-'+(x.getMonth()+1)+'-'+x.getDate(),today=ds(d);
  if(s.lastDay!==today){
    s.streak=s.lastDay===ds(new Date(d.getTime()-864e5))?(s.streak||0)+1:1;
    s.lastDay=today;s.days=(s.days||0)+1;
  }
  store.set(s);sfx('win');
  if(session)sessionDone();
  return {isNew,best:s.best[k]};
}

let cleanups=[];
let session=null,sessionBtn=null;
const ORDER=['math','word','slide','pipe','dots','diff','sudoku'];
const later=f=>cleanups.push(f);
const every=(f,ms)=>{const t=setInterval(f,ms);later(()=>clearInterval(t));return t};
const after=(f,ms)=>{const t=setTimeout(f,ms);later(()=>clearTimeout(t));return t};
const listen=(t,ev,f)=>{t.addEventListener(ev,f);later(()=>t.removeEventListener(ev,f))};

const stat=(label,node)=>h('div',{class:'stat'},h('span',{},label),node);
function introCard(title,text,meta,btn,fn){
  return h('div',{class:'panel intro'},h('h2',{},title),h('p',{},text),meta?h('div',{class:'meta'},meta):null,h('button',{class:'btn',type:'button',onclick:fn},btn));
}
function resultCard(title,big,isNew,lines,btn,fn,extra){
  return h('div',{class:'panel result'},
    h('h2',{},title,isNew?h('span',{class:'newbest'},'New best'):null),
    h('div',{class:'big'},big),
    h('ul',{},lines.map(l=>h('li',{},l))),
    h('div',{class:'row',style:'justify-content:flex-start;margin:0'},h('button',{class:'btn',type:'button',onclick:fn},btn),extra||null));
}
function pressFlash(el,cls){el.classList.remove('ok','no');void el.offsetWidth;el.classList.add(cls);sfx(cls)}

/* ---------- icons ---------- */
const ICON={
  math:'<svg viewBox="0 0 24 24"><path d="M4 7h6M7 4v6M14 7h6M5 17l5-5M10 17l-5-5M14 15h6M14 19h6"/></svg>',
  sudoku:'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/></svg>',
  word:'<svg viewBox="0 0 24 24"><path d="M3 18l4.5-12L12 18M4.8 14h5.4M15 18v-6a2.5 2.5 0 0 1 5 0v6M15 15h5"/></svg>',
  slide:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/></svg>',
  pipe:'<svg viewBox="0 0 24 24"><path d="M3 8h9v8h9"/><circle cx="3" cy="8" r="1.6"/><circle cx="21" cy="16" r="1.6"/></svg>',
  dots:'<svg viewBox="0 0 24 24"><path d="M6 18L12 5l6 11" stroke-dasharray="2 2.4"/><circle cx="6" cy="18" r="1.8"/><circle cx="12" cy="5" r="1.8"/><circle cx="18" cy="16" r="1.8"/></svg>',
  diff:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/></svg>'
};

/* ======================================================
   1. QUICK MATH
   ====================================================== */
function mathGame(stage){
  const view=h('div');stage.append(view);
  let run=null,active=false;
  const best=()=>getBest('math');

  function intro(){
    active=false;view.innerHTML='';
    const b=best();
    view.append(introCard('Beat the clock','Solve as many as you can in 60 seconds. Problems get harder as you go, and each answer submits the moment it is right.',b!=null?'Best score: '+b:'No score yet','Start',start));
  }
  function gen(level){
    const ops=['+','-'];
    if(level>=1)ops.push('×');
    if(level>=3)ops.push('÷');
    if(level>=5)ops.push('mix');
    const op=ops[rand(ops.length)];
    const mx=10+level*12;
    let a,b,c,text,ans;
    if(op==='+'){a=RI(2,mx);b=RI(2,mx);text=a+' + '+b;ans=a+b}
    else if(op==='-'){a=RI(5,mx+10);b=RI(1,a);text=a+' − '+b;ans=a-b}
    else if(op==='×'){const m=Math.min(12,4+level);a=RI(2,m);b=RI(2,m+(level>5?5:0));text=a+' × '+b;ans=a*b}
    else if(op==='÷'){const m=Math.min(12,3+level);b=RI(2,m);const q=RI(2,m);a=b*q;text=a+' ÷ '+b;ans=q}
    else{a=RI(2,20);b=RI(2,9);c=RI(2,9);text=a+' + '+b+' × '+c;ans=a+b*c}
    return {text,ans:String(ans)};
  }
  function start(){
    run={score:0,streak:0,ok:0,bad:0,end:Date.now()+60000,ans:'',cur:null,over:false};
    active=true;view.innerHTML='';
    const sT=h('b',{},'1:00'),sS=h('b',{},'0'),sK=h('b',{},'0');
    const prob=h('div',{class:'prob'}),inp=h('div',{class:'ans'});
    const wrap=h('div',{class:'panel prob-wrap'},prob,inp);
    const pad=h('div',{class:'pad'});
    ['1','2','3','4','5','6','7','8','9','⌫','0','Skip'].forEach(k=>pad.append(h('button',{class:'key'+(k.length>1||k==='⌫'?' small':''),type:'button',onclick:()=>key(k)},k)));
    view.append(h('div',{class:'stats'},stat('Time',sT),stat('Score',sS),stat('Streak',sK)),wrap,pad);
    function next(){run.cur=gen(Math.floor(run.ok/4));run.ans='';paint()}
    function paint(){prob.textContent=run.cur.text+' = ?';inp.textContent=run.ans||' ';sS.textContent=run.score;sK.textContent=run.streak}
    function key(k){
      if(!active||run.over)return;
      if(k==='⌫'){run.ans=run.ans.slice(0,-1);paint();return}
      if(k==='Skip'){run.streak=0;next();return}
      run.ans+=k;
      if(run.ans===run.cur.ans){
        run.ok++;run.streak++;run.score+=10+Math.min(run.streak,10);
        pressFlash(wrap,'ok');next();
      }else if(run.ans.length>=run.cur.ans.length){
        run.bad++;run.streak=0;pressFlash(wrap,'no');run.ans='';paint();
      }else paint();
    }
    listen(document,'keydown',e=>{
      if(!active)return;
      if(/^[0-9]$/.test(e.key))key(e.key);
      else if(e.key==='Backspace')key('⌫');
    });
    every(200,()=>{
      const left=Math.max(0,Math.ceil((run.end-Date.now())/1000));
      sT.textContent=fmt(left);
      if(left<=0&&!run.over)finish();
    });
    next();
  }
  function finish(){
    run.over=true;active=false;
    const r=record('math',run.score);
    const tot=run.ok+run.bad;
    view.innerHTML='';
    view.append(resultCard('Time is up',run.score,r.isNew,[
      run.ok+' solved, '+run.bad+' wrong',
      'Accuracy '+(tot?Math.round(run.ok/tot*100):0)+'%',
      'Best score '+r.best],'Play again',start));
  }
  intro();
}

/* ======================================================
   2. SUDOKU
   ====================================================== */
const bx=(r,c)=>((r/3)|0)*3+((c/3)|0);
function sudokuSearch(grid,limit,random,keep){
  const g=grid.slice(),row=new Array(9).fill(0),col=new Array(9).fill(0),box=new Array(9).fill(0);
  for(let i=0;i<81;i++)if(g[i]){const r=(i/9)|0,c=i%9,b=1<<g[i];row[r]|=b;col[c]|=b;box[bx(r,c)]|=b}
  let n=0;
  function go(){
    let bi=-1,bm=0,bc=10;
    for(let i=0;i<81;i++){
      if(g[i])continue;
      const r=(i/9)|0,c=i%9;
      const m=~(row[r]|col[c]|box[bx(r,c)])&0x3FE;
      const k=pc(m);
      if(k<bc){bc=k;bi=i;bm=m;if(k<2)break}
    }
    if(bi<0){n++;if(keep&&n===1)for(let i=0;i<81;i++)keep[i]=g[i];return n>=limit}
    if(bc===0)return false;
    const r=(bi/9)|0,c=bi%9,b=bx(r,c);
    const ds=[];for(let d=1;d<=9;d++)if(bm&(1<<d))ds.push(d);
    if(random)shuffle(ds);
    for(const d of ds){
      const bit=1<<d;g[bi]=d;row[r]|=bit;col[c]|=bit;box[b]|=bit;
      const stop=go();
      g[bi]=0;row[r]&=~bit;col[c]&=~bit;box[b]&=~bit;
      if(stop)return true;
    }
    return false;
  }
  go();return n;
}
function sudokuMake(holes){
  const sol=new Array(81).fill(0);
  sudokuSearch(new Array(81).fill(0),1,true,sol);
  const p=sol.slice();let removed=0;
  for(const i of shuffle([...Array(81).keys()])){
    if(removed>=holes)break;
    const v=p[i];p[i]=0;
    if(sudokuSearch(p,2,false)!==1)p[i]=v;else removed++;
  }
  return {puzzle:p,sol};
}
function sudokuGame(stage){
  const LV={Easy:36,Medium:46,Hard:54};
  let lvl='Easy',puz,sol,vals,given,notes,sel=-1,noteMode=false,mist=0,over=false,t0=0,hints=0;
  const cells=[];
  const sT=h('b',{},'0:00'),sM=h('b',{},'0 / 3');
  const grid=h('div',{class:'sgrid',role:'grid','aria-label':'Sudoku board'});
  const npad=h('div',{class:'npad'});
  const msg=h('div',{class:'banner'});
  const noteBtn=h('button',{class:'btn ghost',type:'button',onclick:()=>{noteMode=!noteMode;paint()}},'Notes: off');
  const segs=h('div',{class:'seg',role:'group','aria-label':'Difficulty'});
  const out=h('div');
  for(let i=0;i<81;i++){
    const r=(i/9)|0,c=i%9;
    const b=h('button',{type:'button',class:'cell'+(c%3===2&&c<8?' br':'')+(r%3===2&&r<8?' bb':''),'data-i':i,onclick:()=>{sel=i;paint()}});
    cells.push(b);grid.append(b);
  }
  const nk=[];
  for(let d=1;d<=9;d++){
    const k=h('button',{type:'button',class:'nkey',onclick:()=>place(d)},String(d),h('small',{},'9'));
    nk.push(k);npad.append(k);
  }
  Object.keys(LV).forEach(k=>segs.append(h('button',{type:'button','aria-pressed':k===lvl?'true':'false',onclick:()=>{lvl=k;newGame()}},k)));
  stage.append(
    h('div',{class:'row',style:'margin:0 0 12px'},segs,h('button',{class:'btn ghost',type:'button',onclick:()=>newGame()},'New game')),
    h('div',{class:'stats'},stat('Time',sT),stat('Mistakes',sM)),
    grid,npad,
    h('div',{class:'row'},
      h('button',{class:'btn ghost',type:'button',onclick:erase},'Erase'),
      noteBtn,
      h('button',{class:'btn ghost',type:'button',onclick:hint},'Hint')),
    msg,out);

  function newGame(){
    [...segs.children].forEach(b=>b.setAttribute('aria-pressed',b.textContent===lvl?'true':'false'));
    msg.textContent='Building a puzzle…';out.innerHTML='';
    setTimeout(()=>{
      const m=sudokuMake(LV[lvl]);
      puz=m.puzzle;sol=m.sol;vals=puz.slice();given=puz.map(v=>v>0);
      notes=puz.map(()=>new Set());sel=-1;mist=0;hints=0;over=false;t0=Date.now();noteMode=false;
      msg.textContent='';paint();
    },20);
  }
  function peerOf(a,b){
    if(a<0||b<0)return false;
    const ra=(a/9)|0,ca=a%9,rb=(b/9)|0,cb=b%9;
    return ra===rb||ca===cb||bx(ra,ca)===bx(rb,cb);
  }
  function paint(){
    if(!vals)return;
    const sv=sel>=0?vals[sel]:0;
    for(let i=0;i<81;i++){
      const el=cells[i],v=vals[i];
      let cls='cell'+(i%9===2||i%9===5?' br':'')+(((i/9)|0)===2||((i/9)|0)===5?' bb':'');
      if(given[i])cls+=' given';
      if(i===sel)cls+=' sel';
      else if(sv&&v===sv&&v!==0)cls+=' same';
      else if(peerOf(sel,i))cls+=' peer';
      if(v&&v!==sol[i])cls+=' err';
      el.className=cls;
      if(v)el.textContent=v;
      else if(notes[i].size){
        let s='<div class="notes">';
        for(let d=1;d<=9;d++)s+='<i>'+(notes[i].has(d)?d:'')+'</i>';
        el.innerHTML=s+'</div>';
      }else el.textContent='';
    }
    for(let d=1;d<=9;d++){
      let n=0;for(let i=0;i<81;i++)if(vals[i]===d&&sol[i]===d)n++;
      nk[d-1].lastChild.textContent=9-n;
      nk[d-1].disabled=n>=9||over;
    }
    sM.textContent=mist+' / 3';
    noteBtn.textContent='Notes: '+(noteMode?'on':'off');
  }
  function place(d){
    if(over||sel<0||given[sel]||vals[sel]===sol[sel])return;
    if(noteMode){
      if(vals[sel]===0){notes[sel].has(d)?notes[sel].delete(d):notes[sel].add(d)}
      paint();return;
    }
    vals[sel]=d;notes[sel].clear();
    if(d!==sol[sel]){
      mist++;sfx('no');
      if(mist>=3){over=true;msg.textContent='Three mistakes. Start a new game to try again.';msg.style.color='var(--bad-ink)'}
    }else{
      sfx('tick');
      for(let i=0;i<81;i++)if(peerOf(sel,i))notes[i].delete(d);
      if(vals.every((v,i)=>v===sol[i]))win();
    }
    paint();
  }
  function erase(){
    if(over||sel<0||given[sel])return;
    if(vals[sel]!==sol[sel])vals[sel]=0;
    notes[sel].clear();paint();
  }
  function hint(){
    if(over||sel<0||given[sel]||vals[sel]===sol[sel])return;
    hints++;vals[sel]=sol[sel];notes[sel].clear();
    for(let i=0;i<81;i++)if(peerOf(sel,i))notes[i].delete(sol[sel]);
    if(vals.every((v,i)=>v===sol[i]))win();
    paint();
  }
  function win(){
    over=true;
    const secs=Math.round((Date.now()-t0)/1000);
    const r=record('sudoku-'+lvl,secs,true);
    msg.style.color='var(--good-ink)';msg.textContent='Solved in '+fmt(secs)+(r.isNew?'. New best for '+lvl+'.':'.');
    out.innerHTML='';
    out.append(h('div',{class:'row'},h('button',{class:'btn',type:'button',onclick:()=>{msg.style.color='';newGame()}},'Next puzzle')));
  }
  listen(document,'keydown',e=>{
    if(/^[1-9]$/.test(e.key))place(+e.key);
    else if(e.key==='Backspace'||e.key==='Delete')erase();
    else if(sel>=0&&e.key.startsWith('Arrow')){
      e.preventDefault();
      const r=(sel/9)|0,c=sel%9;
      if(e.key==='ArrowUp'&&r>0)sel-=9;
      if(e.key==='ArrowDown'&&r<8)sel+=9;
      if(e.key==='ArrowLeft'&&c>0)sel-=1;
      if(e.key==='ArrowRight'&&c<8)sel+=1;
      paint();
    }
  });
  every(1000,()=>{if(!over&&t0)sT.textContent=fmt((Date.now()-t0)/1000)});
  newGame();
}

/* ======================================================
   3. WORD UNSCRAMBLE
   ====================================================== */
const WORDS=('planet bridge garden rocket silver jungle candle pencil market island dragon puzzle castle forest mirror button orange guitar winter summer basket cotton engine flower hammer insect jacket kitten ladder monkey needle pepper rabbit sponge tunnel violin window yellow anchor breeze cheese donkey falcon goblin helmet jigsaw lizard magnet parrot quartz ribbon saddle tomato velvet walnut zipper museum coffee harbor meadow pirate school thunder diamond balance captain journey lantern mystery network pumpkin rainbow scholar texture venture whisper kingdom library monster orchard pioneer').split(' ');
function wordGame(stage){
  const TOTAL=6,SEC=35;
  const view=h('div');stage.append(view);
  let run=null,active=false,ctl=null;

  function intro(){
    active=false;view.innerHTML='';
    const b=getBest('word');
    view.append(introCard('Unscramble six words','Tap the letters in order to spell each word. You get 35 seconds per word. Hints reveal a letter but cost points.',b!=null?'Best score: '+b:'No score yet','Start',start));
  }
  function start(){
    run={words:shuffle(WORDS.slice()).slice(0,TOTAL),i:0,score:0,solved:0};
    active=true;round();
  }
  function round(){
    const word=run.words[run.i],n=word.length;
    let letters=word.split(''),order;
    do{letters=shuffle(word.split(''))}while(letters.join('')===word);
    order=letters.map((_,i)=>i);
    const used=new Array(n).fill(false),slots=new Array(n).fill(-1);
    let locked=0,hintsUsed=0,state='play';
    const end=Date.now()+SEC*1000;
    const sR=h('b',{},(run.i+1)+' / '+TOTAL),sT=h('b',{},SEC),sS=h('b',{},run.score);
    const slotsEl=h('div',{class:'slots'}),tilesEl=h('div',{class:'tiles'});
    const msg=h('div',{class:'banner'});
    view.innerHTML='';
    view.append(h('div',{class:'stats'},stat('Word',sR),stat('Time',sT),stat('Score',sS)),
      h('div',{class:'panel'},h('div',{class:'banner',style:'color:var(--muted);font-weight:500'},n+' letters'),slotsEl,tilesEl,msg),
      h('div',{class:'row'},
        h('button',{class:'btn ghost',type:'button',onclick:()=>{order=shuffle(order);paint()}},'Shuffle'),
        h('button',{class:'btn ghost',type:'button',onclick:hint},'Hint (−15)'),
        h('button',{class:'btn ghost',type:'button',onclick:()=>finishRound(false)},'Skip')));
    ctl={tap,back};
    function paint(){
      slotsEl.innerHTML='';tilesEl.innerHTML='';
      for(let s=0;s<n;s++){
        const t=slots[s];
        slotsEl.append(h('button',{type:'button',class:'slot'+(t>=0?' fill':'')+(s<locked?' lock':''),onclick:()=>tapSlot(s),'aria-label':'Letter slot '+(s+1)},t>=0?letters[t]:''));
      }
      order.forEach(i=>tilesEl.append(h('button',{type:'button',class:'tile'+(used[i]?' used':''),onclick:()=>tap(i),'aria-label':'Letter '+letters[i]},letters[i])));
    }
    function tap(i){
      if(state!=='play'||used[i])return;
      const s=slots.indexOf(-1);if(s<0)return;
      slots[s]=i;used[i]=true;paint();
      if(slots.indexOf(-1)<0)check();
    }
    function tapSlot(s){
      if(state!=='play'||s<locked||slots[s]<0)return;
      used[slots[s]]=false;slots[s]=-1;paint();
    }
    function back(){
      if(state!=='play')return;
      for(let s=n-1;s>=locked;s--)if(slots[s]>=0){tapSlot(s);return}
    }
    function check(){
      const str=slots.map(t=>letters[t]).join('');
      if(str===word)finishRound(true);
      else{
        sfx('no');slotsEl.classList.remove('no');void slotsEl.offsetWidth;slotsEl.classList.add('no');
        after(()=>{if(state!=='play')return;for(let s=locked;s<n;s++)if(slots[s]>=0){used[slots[s]]=false;slots[s]=-1}paint()},450);
      }
    }
    function hint(){
      if(state!=='play'||locked>=n)return;
      for(let s=locked;s<n;s++)if(slots[s]>=0){used[slots[s]]=false;slots[s]=-1}
      const t=letters.findIndex((c,i)=>!used[i]&&c===word[locked]);
      slots[locked]=t;used[t]=true;locked++;hintsUsed++;paint();
      if(locked===n)check();
    }
    function finishRound(ok){
      if(state!=='play')return;
      state='done';
      const left=Math.max(0,Math.ceil((end-Date.now())/1000));
      if(ok){
        const pts=Math.max(10,40+left*2-hintsUsed*15);
        run.score+=pts;run.solved++;sfx('ok');sS.textContent=run.score;
        msg.style.color='var(--good-ink)';msg.textContent='+'+pts+' points';
      }else{
        msg.style.color='var(--bad-ink)';msg.textContent='The word was '+word.toUpperCase();
        slotsEl.innerHTML='';[...word].forEach(c=>slotsEl.append(h('div',{class:'slot lock'},c)));
      }
      after(()=>{run.i++;run.i>=TOTAL?finishAll():round()},ok?900:1500);
    }
    function loop(){
      if(state!=='play')return;
      const left=Math.max(0,Math.ceil((end-Date.now())/1000));
      sT.textContent=left;
      if(left<=0)finishRound(false);
    }
    every(250,loop);paint();
  }
  function finishAll(){
    active=false;
    const r=record('word',run.score);
    view.innerHTML='';
    view.append(resultCard('Round complete',run.score,r.isNew,[run.solved+' of '+TOTAL+' words solved','Best score '+r.best],'Play again',start));
  }
  listen(document,'keydown',e=>{
    if(!active||!ctl)return;
    if(e.key==='Backspace'){ctl.back();return}
    if(/^[a-zA-Z]$/.test(e.key)){
      const btns=[...view.querySelectorAll('.tile:not(.used)')];
      const b=btns.find(x=>x.textContent.toLowerCase()===e.key.toLowerCase());
      if(b)b.click();
    }
  });
  intro();
}

/* ======================================================
   4. SLIDE PUZZLE
   ====================================================== */
function slideGame(stage){
  let n=3,arr,els,moves,t0,over;
  const sM=h('b',{},'0'),sT=h('b',{},'0:00');
  const inner=h('div',{class:'sinner'}),board=h('div',{class:'sboard'},inner);
  const out=h('div');
  const segs=h('div',{class:'seg',role:'group','aria-label':'Board size'});
  [3,4].forEach(k=>segs.append(h('button',{type:'button','aria-pressed':k===n?'true':'false',onclick:()=>{n=k;fresh()}},k+' × '+k)));
  stage.append(
    h('div',{class:'row',style:'margin:0 0 12px'},segs,h('button',{class:'btn ghost',type:'button',onclick:()=>fresh()},'Shuffle')),
    h('div',{class:'stats'},stat('Moves',sM),stat('Time',sT)),board,out);

  function fresh(){
    [...segs.children].forEach(b=>b.setAttribute('aria-pressed',b.textContent.startsWith(n)?'true':'false'));
    out.innerHTML='';inner.innerHTML='';
    arr=[];for(let i=1;i<n*n;i++)arr.push(i);arr.push(0);
    let b=n*n-1,prev=-1;
    for(let k=0;k<n*n*14;k++){
      const r=(b/n)|0,c=b%n,nb=[];
      if(r>0)nb.push(b-n);if(r<n-1)nb.push(b+n);if(c>0)nb.push(b-1);if(c<n-1)nb.push(b+1);
      const opts=nb.filter(x=>x!==prev);
      const t=opts[rand(opts.length)];
      arr[b]=arr[t];arr[t]=0;prev=b;b=t;
    }
    if(solved())return fresh();
    els={};
    for(let v=1;v<n*n;v++){
      const el=h('div',{class:'st',style:'width:'+100/n+'%;height:'+100/n+'%'},h('button',{type:'button',onclick:()=>tap(v),'aria-label':'Tile '+v},String(v)));
      els[v]=el;inner.append(el);
    }
    moves=0;over=false;t0=0;sM.textContent='0';sT.textContent='0:00';
    layout();
  }
  const solved=()=>arr.every((v,i)=>v===(i+1)%(n*n));
  function layout(){
    for(let i=0;i<n*n;i++){
      const v=arr[i];if(!v)continue;
      const el=els[v];
      el.style.left=(i%n)*100/n+'%';el.style.top=((i/n)|0)*100/n+'%';
      el.classList.toggle('right',v===i+1);
    }
  }
  function tap(v){
    if(over)return;
    const i=arr.indexOf(v),b=arr.indexOf(0);
    const d=Math.abs(((i/n)|0)-((b/n)|0))+Math.abs(i%n-b%n);
    if(d!==1)return;
    if(!t0)t0=Date.now();
    arr[b]=v;arr[i]=0;moves++;sfx('tick');sM.textContent=moves;layout();
    if(solved())win();
  }
  function win(){
    over=true;
    const secs=Math.round((Date.now()-t0)/1000);
    const r=record('slide-'+n,moves,true);
    out.append(h('div',{style:'margin-top:14px'},resultCard('Solved',moves+' moves',r.isNew,['Time '+fmt(secs),'Best for '+n+' × '+n+': '+r.best+' moves'],'Play again',fresh)));
  }
  listen(document,'keydown',e=>{
    if(!e.key.startsWith('Arrow'))return;
    e.preventDefault();
    const b=arr.indexOf(0),r=(b/n)|0,c=b%n;
    let t=-1;
    if(e.key==='ArrowLeft'&&c<n-1)t=b+1;
    if(e.key==='ArrowRight'&&c>0)t=b-1;
    if(e.key==='ArrowUp'&&r<n-1)t=b+n;
    if(e.key==='ArrowDown'&&r>0)t=b-n;
    if(t>=0)tap(arr[t]);
  });
  every(1000,()=>{if(t0&&!over)sT.textContent=fmt((Date.now()-t0)/1000)});
  fresh();
}

/* ======================================================
   5. PIPE CONNECT
   ====================================================== */
function pipeGame(stage){
  const SIZES=[3,4,5,6,7,8];
  let level=1,n,base,rot,src,moves,over;
  const sL=h('b',{},'1'),sM=h('b',{},'0'),sG=h('b',{},'0');
  const gridEl=h('div',{class:'pgrid'});
  const out=h('div');
  stage.append(
    h('div',{class:'row',style:'margin:0 0 12px'},h('button',{class:'btn ghost',type:'button',onclick:()=>build()},'New layout')),
    h('div',{class:'stats'},stat('Level',sL),stat('Turns',sM),stat('Lit',sG)),
    gridEl,
    h('p',{class:'sub',style:'text-align:center;margin:12px auto 0'},'Tap a tile to turn it. Light every pipe by connecting it to the orange source.'),out);

  const rotm=(m,k)=>{for(let i=0;i<k%4;i++)m=((m<<1)|(m>>3))&15;return m};
  const cur=i=>rotm(base[i],rot[i]);
  function lit(){
    const on=new Array(n*n).fill(false);on[src]=true;
    const q=[src];
    while(q.length){
      const a=q.pop(),ma=cur(a),r=(a/n)|0,c=a%n;
      const tryN=(b,bit,opp)=>{if(!on[b]&&(ma&bit)&&(cur(b)&opp)){on[b]=true;q.push(b)}};
      if(r>0)tryN(a-n,1,4);if(c<n-1)tryN(a+1,2,8);if(r<n-1)tryN(a+n,4,1);if(c>0)tryN(a-1,8,2);
    }
    return on;
  }
  function tileSVG(m,isSrc){
    const L={1:'M50 50V0',2:'M50 50H100',4:'M50 50V100',8:'M50 50H0'};
    let s='<svg viewBox="0 0 100 100" aria-hidden="true">';
    for(const b of [1,2,4,8])if(m&b)s+='<path class="pipe" d="'+L[b]+'"/>';
    s+='<circle class="pc" cx="50" cy="50" r="'+(pc(m)===1?19:10)+'"/>';
    if(isSrc)s+='<rect class="src" x="30" y="30" width="40" height="40" rx="9"/>';
    return s+'</svg>';
  }
  function build(){
    n=SIZES[Math.min(level-1,SIZES.length-1)];
    base=new Array(n*n).fill(0);
    const vis=new Array(n*n).fill(false);
    src=rand(n*n);vis[src]=true;
    const fr=[];
    const addF=i=>{const r=(i/n)|0,c=i%n;
      if(r>0)fr.push([i,i-n,1,4]);if(c<n-1)fr.push([i,i+1,2,8]);
      if(r<n-1)fr.push([i,i+n,4,1]);if(c>0)fr.push([i,i-1,8,2])};
    addF(src);
    while(fr.length){
      const k=rand(fr.length),[a,b,ba,bb]=fr[k];
      fr[k]=fr[fr.length-1];fr.pop();
      if(vis[b])continue;
      vis[b]=true;base[a]|=ba;base[b]|=bb;addF(b);
    }
    do{rot=base.map(()=>rand(4))}while(lit().every(Boolean));
    moves=0;over=false;out.innerHTML='';
    gridEl.style.gridTemplateColumns='repeat('+n+',1fr)';
    gridEl.innerHTML='';
    for(let i=0;i<n*n;i++){
      const rotEl=h('div',{class:'prot',html:tileSVG(base[i],i===src),style:'transform:rotate('+rot[i]*90+'deg)'});
      gridEl.append(h('button',{type:'button',class:'ptile','aria-label':'Pipe tile',onclick:()=>turn(i)},rotEl));
    }
    paint();
  }
  function paint(){
    const on=lit();let c=0;
    [...gridEl.children].forEach((t,i)=>{t.classList.toggle('on',on[i]);t.firstChild.style.transform='rotate('+rot[i]*90+'deg)';if(on[i])c++});
    sL.textContent=level;sM.textContent=moves;sG.textContent=c+'/'+n*n;
    return c===n*n;
  }
  function turn(i){
    if(over)return;
    rot[i]++;moves++;sfx('tick');
    if(paint())win();
  }
  function win(){
    over=true;
    const r=record('pipe',level);
    out.append(h('div',{style:'margin-top:14px'},resultCard('Every pipe is lit',moves+' turns',false,['Level '+level+' complete'+(r.isNew?'. New highest level.':'.')],'Next level',()=>{level++;build()})));
  }
  build();
}

/* ======================================================
   6. CONNECT THE DOTS
   ====================================================== */
function starPts(k,Ro,ri,cx,cy){
  const p=[];
  for(let i=0;i<k*2;i++){
    const a=(-90+i*180/k)*Math.PI/180,r=i%2?ri:Ro;
    p.push([+(cx+r*Math.cos(a)).toFixed(1),+(cy+r*Math.sin(a)).toFixed(1)]);
  }
  return p;
}
function heartPts(){
  const p=[],N=24;
  for(let i=0;i<N;i++){
    const t=i/N*Math.PI*2;
    const x=16*Math.pow(Math.sin(t),3);
    const y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
    p.push([+(50+x*2.7).toFixed(1),+(50-(y+2.5)*2.7).toFixed(1)]);
  }
  return p;
}
const SHAPES=[
  {name:'star',pts:()=>starPts(5,45,18,50,54),color:'var(--warn)'},
  {name:'heart',pts:heartPts,color:'var(--h-dots)'},
  {name:'house',pts:()=>[[50,10],[90,46],[78,46],[78,88],[22,88],[22,46],[10,46]],color:'var(--h-pipe)'},
  {name:'lightning bolt',pts:()=>[[60,6],[24,54],[46,54],[38,94],[78,42],[54,42],[70,6]],color:'var(--h-diff)'},
  {name:'sailboat',pts:()=>[[50,8],[82,58],[54,58],[54,68],[88,68],[74,90],[26,90],[12,68],[46,68],[46,58],[18,58]],color:'var(--h-word)'},
  {name:'sun',pts:()=>starPts(9,44,28,50,50),color:'var(--h-math)'}
];
function dotsGame(stage){
  let last=-1,sh,pts,nextI,t0,over,wrong,trailPts;
  const sN=h('b',{},'0'),sT=h('b',{},'0:00'),sW=h('b',{},'0');
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('class','dsvg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Connect the numbered dots in order');
  const out=h('div');
  stage.append(
    h('div',{class:'row',style:'margin:0 0 12px'},
      h('button',{class:'btn ghost',type:'button',onclick:()=>fresh()},'New picture'),
      h('button',{class:'btn ghost',type:'button',onclick:hint},'Hint')),
    h('div',{class:'stats'},stat('Dot',sN),stat('Time',sT),stat('Misses',sW)),svg,out);

  function fresh(){
    let k;do{k=rand(SHAPES.length)}while(k===last);last=k;
    sh=SHAPES[k];pts=sh.pts();nextI=0;t0=0;over=false;wrong=0;trailPts=[];
    out.innerHTML='';sW.textContent='0';sT.textContent='0:00';
    let s='<polygon id="fillShape" points="" fill="none"/><polyline class="trail" points=""/>';
    pts.forEach((p,i)=>{
      s+='<g class="dot" data-i="'+i+'"><circle class="ring" cx="'+p[0]+'" cy="'+p[1]+'" r="4"/><circle class="vis" cx="'+p[0]+'" cy="'+p[1]+'" r="3.6"/><text x="'+p[0]+'" y="'+(p[1]+1.35)+'">'+(i+1)+'</text><circle cx="'+p[0]+'" cy="'+p[1]+'" r="6" fill="transparent"/></g>';
    });
    svg.innerHTML=s;
    svg.querySelectorAll('.dot').forEach(g=>g.addEventListener('click',()=>tap(+g.dataset.i)));
    paint();
  }
  function paint(){
    svg.querySelectorAll('.dot').forEach((g,i)=>{
      g.classList.toggle('done',i<nextI);
      g.classList.toggle('next',i===nextI&&!over);
      g.classList.remove('pulse');
    });
    sN.textContent=Math.min(nextI+1,pts.length)+' / '+pts.length;
    svg.querySelector('.trail').setAttribute('points',trailPts.join(' '));
  }
  function tap(i){
    if(over)return;
    if(!t0)t0=Date.now();
    if(i===nextI){
      trailPts.push(pts[i].join(','));nextI++;sfx('tick');
      if(nextI===pts.length){
        trailPts.push(pts[0].join(','));paint();win();return;
      }
      paint();
    }else if(i>nextI){
      wrong++;sfx('no');sW.textContent=wrong;
      const g=svg.querySelectorAll('.dot')[i];
      g.animate([{transform:'translateX(-1.2px)'},{transform:'translateX(1.2px)'},{transform:'translateX(0)'}],{duration:220});
    }
  }
  function hint(){
    if(over)return;
    const g=svg.querySelectorAll('.dot')[nextI];
    if(g)g.classList.add('pulse');
  }
  function win(){
    over=true;
    const f=svg.querySelector('#fillShape');
    f.setAttribute('points',pts.map(p=>p.join(',')).join(' '));f.setAttribute('fill',sh.color);f.setAttribute('fill-opacity','.35');
    svg.querySelector('.trail').setAttribute('stroke',sh.color.replace('var(--accent)','var(--accent)'));
    const secs=Math.round((Date.now()-t0)/1000);
    const r=record('dots',secs,true);
    out.append(h('div',{style:'margin-top:14px'},resultCard('It is a '+sh.name,fmt(secs),r.isNew,[wrong+' misses','Best time '+fmt(r.best)],'Next picture',fresh)));
  }
  every(500,()=>{if(t0&&!over)sT.textContent=fmt((Date.now()-t0)/1000)});
  fresh();
}

/* ======================================================
   7. SPOT THE DIFFERENCE
   ====================================================== */
const hsl=f=>'hsl('+Math.round(((f.h%360)+360)%360)+' '+f.s+'% '+f.l+'%)';
function shapeSVG(o){
  const f=hsl(o.fill);
  if(o.k==='rect')return '<rect x="'+o.x+'" y="'+o.y+'" width="'+o.w+'" height="'+o.h+'" fill="'+f+'"/>';
  if(o.k==='circle')return '<circle cx="'+o.cx+'" cy="'+o.cy+'" r="'+o.r+'" fill="'+f+'"/>';
  if(o.k==='ellipse')return '<ellipse cx="'+o.cx+'" cy="'+o.cy+'" rx="'+o.rx+'" ry="'+o.ry+'" fill="'+f+'"/>';
  return '<polygon points="'+o.pts.map(p=>p.join(',')).join(' ')+'" fill="'+f+'"/>';
}
function bbox(o){
  if(o.k==='rect')return [o.x,o.y,o.x+o.w,o.y+o.h];
  if(o.k==='circle')return [o.cx-o.r,o.cy-o.r,o.cx+o.r,o.cy+o.r];
  if(o.k==='ellipse')return [o.cx-o.rx,o.cy-o.ry,o.cx+o.rx,o.cy+o.ry];
  const xs=o.pts.map(p=>p[0]),ys=o.pts.map(p=>p[1]);
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}
function shiftShape(o,dx,dy){
  if(o.k==='rect'){o.x+=dx;o.y+=dy}
  else if(o.k==='poly')o.pts=o.pts.map(p=>[p[0]+dx,p[1]+dy]);
  else{o.cx+=dx;o.cy+=dy}
}
function growShape(o,f){
  if(o.k==='circle')o.r*=f;
  else if(o.k==='ellipse'){o.rx*=f;o.ry*=f}
  else if(o.k==='rect'){const w=o.w*f,hh=o.h*f;o.x-=(w-o.w)/2;o.y-=(hh-o.h)/2;o.w=w;o.h=hh}
}
function makeScene(){
  const els=[];
  const add=o=>{o.id=els.length;els.push(o);return o};
  add({k:'rect',x:0,y:0,w:200,h:140,fill:{h:R(195,215),s:75,l:84},fixed:1});
  add({k:'circle',cx:R(22,46),cy:R(20,30),r:R(9,12),fill:{h:45,s:95,l:58}});
  [[R(60,80),R(16,26)],[R(112,132),R(26,34)],[R(150,176),R(12,20)]].forEach(([x,y])=>add({k:'ellipse',cx:x,cy:y,rx:R(14,20),ry:R(5,7),fill:{h:210,s:30,l:98}}));
  add({k:'ellipse',cx:R(30,70),cy:132,rx:R(90,110),ry:R(42,56),fill:{h:150,s:38,l:60},fixed:1});
  add({k:'ellipse',cx:R(140,175),cy:138,rx:R(80,100),ry:R(30,42),fill:{h:135,s:42,l:50},fixed:1});
  add({k:'rect',x:0,y:112,w:200,h:28,fill:{h:125,s:45,l:42},fixed:1});
  const hx=R(80,100),wallH=R(0,360),roofH=R(0,40);
  add({k:'rect',x:hx+34,y:56,w:7,h:14,fill:{h:15,s:30,l:40}});
  add({k:'rect',x:hx,y:76,w:46,h:36,fill:{h:wallH,s:45,l:78}});
  add({k:'poly',pts:[[hx-5,76],[hx+23,54],[hx+51,76]],fill:{h:roofH,s:65,l:42}});
  add({k:'rect',x:hx+19,y:94,w:9,h:18,fill:{h:25,s:60,l:30}});
  add({k:'rect',x:hx+6,y:84,w:10,h:10,fill:{h:200,s:70,l:70}});
  add({k:'rect',x:hx+32,y:84,w:10,h:10,fill:{h:200,s:70,l:70}});
  [22+R(-4,4),58+R(-3,3),176+R(-4,4)].forEach(x=>{
    add({k:'rect',x:x-2.5,y:96,w:5,h:17,fill:{h:25,s:45,l:28}});
    add({k:'circle',cx:x,cy:91,r:R(10,13),fill:{h:R(100,150),s:55,l:34}});
  });
  for(let i=0;i<4;i++)add({k:'circle',cx:R(8,192),cy:R(121,134),r:3.6,fill:{h:[0,50,320,280][i],s:85,l:60}});
  [[R(100,130),R(40,48)],[R(140,170),R(34,40)]].forEach(([x,y])=>add({k:'poly',pts:[[x,y],[x+5,y+3],[x+10,y],[x+5,y+1.5]],fill:{h:230,s:20,l:25}}));
  return els;
}
function makeDiffs(els){
  const B=JSON.parse(JSON.stringify(els));
  const cands=shuffle(els.filter(o=>!o.fixed).map(o=>o.id));
  const diffs=[];
  for(const id of cands){
    if(diffs.length>=5)break;
    const o=B[id],ops=['recolor','remove','move'];
    if(o.k!=='poly')ops.push('grow');
    const op=ops[rand(ops.length)];
    const bb=bbox(els[id]);
    let cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2;
    let rr=Math.max(9,Math.max(bb[2]-bb[0],bb[3]-bb[1])/2);
    if(op==='recolor'){o.fill={h:o.fill.h+R(110,200),s:Math.max(o.fill.s,60),l:o.fill.l>88?60:o.fill.l}}
    else if(op==='remove'){o.gone=1}
    else if(op==='move'){const dx=(Math.random()<.5?-1:1)*R(7,10),dy=R(-4,4);shiftShape(o,dx,dy);cx+=dx/2;cy+=dy/2;rr+=6}
    else growShape(o,1.5);
    diffs.push({id,op,cx,cy,r:rr,found:false});
  }
  return {B,diffs};
}
function sceneHTML(els){return els.filter(o=>!o.gone).map(shapeSVG).join('')}

function diffGame(stage){
  let A,B,diffs,t0,pen,over,found,mist;
  const sF=h('b',{},'0 / 5'),sT=h('b',{},'0:00'),sM=h('b',{},'0');
  const svgA=document.createElementNS(NS,'svg'),svgB=document.createElementNS(NS,'svg');
  [svgA,svgB].forEach(s=>{s.setAttribute('viewBox','0 0 200 140');s.setAttribute('class','scene');s.setAttribute('role','img')});
  svgA.setAttribute('aria-label','Original picture');svgB.setAttribute('aria-label','Altered picture; tap the differences');
  const out=h('div');
  stage.classList.add('wide');
  stage.append(
    h('div',{class:'row',style:'margin:0 0 12px'},
      h('button',{class:'btn ghost',type:'button',onclick:()=>fresh()},'New scene'),
      h('button',{class:'btn ghost',type:'button',onclick:hint},'Hint (+8s)')),
    h('div',{class:'stats',style:'max-width:560px;margin-left:auto;margin-right:auto'},stat('Found',sF),stat('Time',sT),stat('Misses',sM)),
    h('div',{class:'diffgrid'},svgA,svgB),out);

  function fresh(){
    A=makeScene();const d=makeDiffs(A);B=d.B;diffs=d.diffs;
    t0=Date.now();pen=0;over=false;found=0;mist=0;out.innerHTML='';
    svgA.innerHTML=sceneHTML(A);svgB.innerHTML=sceneHTML(B);
    sF.textContent='0 / 5';sM.textContent='0';
  }
  function pt(ev,svg){
    const r=svg.getBoundingClientRect();
    return [(ev.clientX-r.left)/r.width*200,(ev.clientY-r.top)/r.height*140];
  }
  function ring(d,color,temp){
    const html='<circle cx="'+d.cx+'" cy="'+d.cy+'" r="'+(d.r+2)+'" fill="none" stroke="'+color+'" stroke-width="1.8"/>';
    [svgA,svgB].forEach(s=>{
      const g=document.createElementNS(NS,'g');g.innerHTML=html;s.append(g);
      if(temp)setTimeout(()=>g.remove(),1600);
    });
  }
  function click(ev,svg){
    if(over)return;
    const [x,y]=pt(ev,svg);
    const d=diffs.find(d=>!d.found&&Math.hypot(d.cx-x,d.cy-y)<=d.r+3);
    if(d){
      d.found=true;found++;sfx('ok');sF.textContent=found+' / 5';
      ring(d,'var(--good)',false);
      if(found===diffs.length)win();
    }else{
      mist++;pen+=3;sfx('no');sM.textContent=mist;
      const g=document.createElementNS(NS,'g');
      g.innerHTML='<path d="M'+(x-4)+' '+(y-4)+'L'+(x+4)+' '+(y+4)+'M'+(x+4)+' '+(y-4)+'L'+(x-4)+' '+(y+4)+'" stroke="var(--bad)" stroke-width="2" stroke-linecap="round"/>';
      svg.append(g);setTimeout(()=>g.remove(),600);
    }
  }
  svgA.addEventListener('click',e=>click(e,svgA));
  svgB.addEventListener('click',e=>click(e,svgB));
  function hint(){
    if(over)return;
    const d=diffs.find(d=>!d.found);if(!d)return;
    pen+=8;ring(d,'var(--warn)',true);
  }
  const elapsed=()=>(Date.now()-t0)/1000+pen;
  function win(){
    over=true;
    const t=Math.round(elapsed());
    const r=record('diff',t,true);
    out.append(h('div',{style:'margin:14px auto 0;max-width:560px'},resultCard('All five found',fmt(t),r.isNew,[mist+' misses (+3s each)','Best time '+fmt(r.best)],'Next scene',fresh)));
  }
  every(500,()=>{if(!over)sT.textContent=fmt(elapsed())});
  fresh();
}

/* ======================================================
   Hub + router
   ====================================================== */
const games={
  math:{name:'Quick Math',desc:'Sixty seconds of mental arithmetic that gets harder as you score.',hue:'--h-math',mount:mathGame,
    best:()=>{const b=getBest('math');return b!=null?'Best '+b:null}},
  sudoku:{name:'Sudoku',desc:'Fresh 9×9 puzzles with a single solution, notes and hints.',hue:'--h-sudoku',mount:sudokuGame,
    best:()=>{for(const l of ['Hard','Medium','Easy']){const b=getBest('sudoku-'+l);if(b!=null)return l+' '+fmt(b)}return null}},
  word:{name:'Word Unscramble',desc:'Rebuild six scrambled words before the timer runs out.',hue:'--h-word',mount:wordGame,
    best:()=>{const b=getBest('word');return b!=null?'Best '+b:null}},
  slide:{name:'Slide Puzzle',desc:'Slide the tiles back into order in as few moves as you can.',hue:'--h-slide',mount:slideGame,
    best:()=>{const b=getBest('slide-3');return b!=null?'Best '+b+' moves':null}},
  pipe:{name:'Pipe Connect',desc:'Rotate the pipes until water reaches every tile.',hue:'--h-pipe',mount:pipeGame,
    best:()=>{const b=getBest('pipe');return b!=null?'Level '+b+' cleared':null}},
  dots:{name:'Connect Dots',desc:'Join the numbered dots in order to reveal the picture.',hue:'--h-dots',mount:dotsGame,
    best:()=>{const b=getBest('dots');return b!=null?'Best '+fmt(b):null}},
  diff:{name:'Spot the Difference',desc:'Find five changes between two near-identical scenes.',hue:'--h-diff',mount:diffGame,
    best:()=>{const b=getBest('diff');return b!=null?'Best '+fmt(b):null}}
};

function waveField(canvas){
  const ctx=canvas.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w=0,ht=0,t=0,raf=0,tick=0,pal=[],g=null;
  const cv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function colors(){
    pal=['--h-slide','--h-pipe','--h-dots','--h-word','--h-diff','--h-math'].map(cv);
    g=ctx.createLinearGradient(0,0,0,ht);g.addColorStop(0,cv('--bg'));g.addColorStop(1,cv('--surface2'));
  }
  function size(){
    const dpr=Math.min(window.devicePixelRatio||1,2);
    w=canvas.clientWidth;ht=canvas.clientHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(ht*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);colors();
  }
  function draw(){
    ctx.globalAlpha=1;ctx.fillStyle=g;ctx.fillRect(0,0,w,ht);
    const N=30;
    for(let i=0;i<N;i++){
      const p=i/(N-1),y0=ht*(0.2+p*0.68),amp=14+p*46;
      const curve=new Path2D();
      for(let x=0;x<=w+8;x+=8){
        const nx=x/w;
        const y=y0+Math.sin(nx*4.2+t+i*.16)*amp*.55+Math.sin(nx*9-t*1.4+i*.09)*amp*.22+Math.sin(nx*1.7+t*.6-i*.05)*amp*.6;
        if(x===0)curve.moveTo(x,y);else curve.lineTo(x,y);
      }
      const area=new Path2D(curve);area.lineTo(w+8,ht);area.lineTo(0,ht);area.closePath();
      ctx.fillStyle=g;ctx.fill(area);
      ctx.strokeStyle=pal[i%pal.length];ctx.globalAlpha=.5+.5*p;ctx.lineWidth=1.4+p*2.6;ctx.lineJoin='round';ctx.stroke(curve);
    }
    ctx.globalAlpha=1;
  }
  function loop(){t+=.014;if(++tick%90===0)colors();draw();raf=requestAnimationFrame(loop)}
  size();draw();
  if(!reduce)raf=requestAnimationFrame(loop);
  listen(window,'resize',()=>{size();draw()});
  later(()=>cancelAnimationFrame(raf));
}
function splash(){
  const canvas=h('canvas',{class:'wavefield','aria-hidden':'true'});
  app.append(h('section',{class:'splash'},canvas,
    h('div',{class:'splash-in'},
      h('h1',{class:'splash-title'},'BrainWave'),
      h('p',{class:'splash-sub'},'Train your focus, memory and logic in short, playful mini games.'),
      h('a',{class:'btn splash-btn',href:'#home'},'Start playing'))));
  waveField(canvas);
}
function tabbar(active){
  const tabs=[['home','Games','<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>'],
    ['progress','Progress','<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>'],
    ['options','Options','<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>']];
  return h('nav',{class:'tabbar','aria-label':'Main'},tabs.map(([id,label,icon])=>
    h('a',{href:'#'+id,class:id===active?'on':'','aria-current':id===active?'page':null},h('span',{html:icon}),label)));
}
function progress(){
  const s=store.get(),b=s.best||{};
  const v=(k,f)=>b[k]!=null?f(b[k]):'Not played';
  const rows=[
    ['Quick Math',v('math',x=>x+' pts')],
    ['Sudoku, Easy',v('sudoku-Easy',fmt)],['Sudoku, Medium',v('sudoku-Medium',fmt)],['Sudoku, Hard',v('sudoku-Hard',fmt)],
    ['Word Unscramble',v('word',x=>x+' pts')],
    ['Slide Puzzle, 3 × 3',v('slide-3',x=>x+' moves')],['Slide Puzzle, 4 × 4',v('slide-4',x=>x+' moves')],
    ['Pipe Connect',v('pipe',x=>'Level '+x)],
    ['Connect Dots',v('dots',fmt)],
    ['Spot the Difference',v('diff',fmt)]];
  app.append(
    h('div',{class:'hero'},h('h1',{},'Progress'),h('p',{},'Your personal bests, kept on this device.')),
    h('div',{class:'stats'},stat('Rounds',h('b',{},s.plays||0)),stat('Day streak',h('b',{},s.streak||0)),stat('Days played',h('b',{},s.days||0))),
    h('div',{class:'panel'},h('ul',{class:'summary',style:'list-style:none;margin:0;padding:0'},rows.map(r=>h('li',{},h('span',{},r[0]),h('span',{},r[1]))))),
    tabbar('progress'));
}
function options(){
  const st=settings();
  const sw=(label,key)=>h('div',{class:'opt'},h('span',{},label),
    h('button',{type:'button',class:'switch',role:'switch','aria-checked':st[key]?'true':'false','aria-label':label,onclick:e=>{
      const on=!(settings()[key]);saveSettings({[key]:on});e.currentTarget.setAttribute('aria-checked',on?'true':'false');if(on)sfx('ok')}},h('i')));
  const themeSeg=h('div',{class:'seg',role:'group','aria-label':'Theme'});
  [['system','System'],['light','Light'],['dark','Dark']].forEach(([k,l])=>themeSeg.append(h('button',{type:'button','aria-pressed':st.theme===k?'true':'false',onclick:()=>{saveSettings({theme:k});[...themeSeg.children].forEach(b=>b.setAttribute('aria-pressed',b.textContent===l?'true':'false'))}},l)));
  let armed=false;
  const reset=h('button',{type:'button',class:'btn ghost',onclick:()=>{
    if(!armed){armed=true;reset.textContent='Tap again to erase everything';reset.style.color='var(--bad-ink)';setTimeout(()=>{armed=false;reset.textContent='Reset progress';reset.style.color=''},4000);return}
    store.set({settings:settings()});armed=false;reset.textContent='Progress erased';reset.style.color='';
  }},'Reset progress');
  const install=deferredPrompt
    ?h('button',{type:'button',class:'btn',onclick:async()=>{deferredPrompt.prompt();try{await deferredPrompt.userChoice}catch(e){}deferredPrompt=null;route()}},'Install BrainWave')
    :h('p',{class:'hint'},'To install, use your browser menu and choose Add to Home Screen or Install app.');
  app.append(
    h('div',{class:'hero'},h('h1',{},'Options'),h('p',{},'Sound, theme and your data.')),
    h('div',{class:'panel optlist'},sw('Sound effects','sound'),sw('Vibration','haptics'),h('div',{class:'opt'},h('span',{},'Theme'),themeSeg)),
    h('div',{class:'panel optlist',style:'margin-top:12px'},h('div',{class:'opt'},h('span',{},'Install on this device'),install),h('div',{class:'opt'},h('span',{},'Saved data'),reset)),
    h('p',{class:'hint',style:'text-align:center;margin-top:16px'},'BrainWave 1.0. Works offline once installed.'),
    tabbar('options'));
}
function startSession(){session={i:0,done:{}};location.hash='#'+ORDER[0]}
function sessionDone(){
  if(!session||!sessionBtn)return;
  session.done[ORDER[session.i]]=true;
  sessionBtn.textContent=session.i>=ORDER.length-1?'Finish run':'Next game →';
  sessionBtn.className='btn';
}
function sessionNext(){
  session.i++;
  location.hash=session.i>=ORDER.length?'#complete':'#'+ORDER[session.i];
}
function complete(){
  const done=session?Object.keys(session.done).length:0;
  session=null;
  app.append(
    h('div',{class:'hero'},h('h1',{},'Run complete'),h('p',{},'You finished '+done+' of '+ORDER.length+' games. Your bests are saved.')),
    h('div',{class:'panel result'},
      h('ul',{class:'summary'},ORDER.map(id=>h('li',{},h('span',{},games[id].name),h('span',{},games[id].best()||'Skipped')))),
      h('div',{class:'row',style:'justify-content:flex-start;margin:0'},
        h('button',{class:'btn',type:'button',onclick:startSession},'Run again'),
        h('a',{class:'btn ghost',href:'#home',style:'text-decoration:none'},'All games'))));
}
function home(){
  const plays=store.get().plays||0;
  app.append(
    h('a',{class:'back welcome-link',href:'#'},'← Welcome page'),
    h('div',{class:'hero herobox'},
      h('div',{class:'brand'},
        h('div',{html:'<svg viewBox="0 0 72 44" fill="none" stroke-width="6" stroke-linecap="round" aria-hidden="true"><path d="M4 26c8-18 14-18 20 0s12 18 20 0 10-12 24-6" stroke="var(--h-slide)"/><path d="M4 18c8-16 14-16 20 0s12 16 20 0 10-10 24-4" stroke="var(--h-pipe)" opacity=".9"/><path d="M4 34c8-16 14-16 20 0s12 16 20 0 10-10 24-4" stroke="var(--h-dots)" opacity=".9"/></svg>'}),
        h('a',{href:'#','aria-label':'BrainWave welcome page',style:'color:inherit;text-decoration:none'},h('h1',{},'BrainWave'))),
      h('p',{},'Seven short brain games in one place. Play them one at a time or all in a single run.'+(plays?' You have played '+plays+(plays===1?' round.':' rounds.'):'')),
      store.get().streak>1?h('div',{class:'chip'},store.get().streak+' day streak'):null),
    h('div',{class:'panel run'},
      h('div',{},h('h2',{},'BrainWave Run'),h('p',{},'All seven games back to back, one session.')),
      h('button',{class:'btn',type:'button',onclick:startSession},'Start run')),
    h('div',{class:'cards'},Object.keys(games).map(id=>{
      const g=games[id],b=g.best();
      return h('a',{class:'gcard',href:'#'+id,style:'--tint:var('+g.hue+')'},
        h('div',{class:'glyph',style:'background:var('+g.hue+')',html:ICON[id]}),
        h('h2',{},g.name),h('p',{},g.desc),
        h('div',{class:'best'+(b?' has':'')},b||'Not played yet'));
    })),
    tabbar('home'));
}
function frame(id){
  const g=games[id];
  sessionBtn=null;
  if(session){
    sessionBtn=h('button',{class:'btn ghost',type:'button',onclick:sessionNext},'Skip');
    app.append(h('div',{class:'runbar'},
      h('span',{},'BrainWave Run · game '+(session.i+1)+' of '+ORDER.length,
        h('span',{class:'pips'},ORDER.map((_,k)=>h('i',{class:k<=session.i?'on':''})))),
      sessionBtn));
  }
  app.append(
    h('div',{class:'top'},h('a',{class:'back',href:'#home'},'← All games'),h('div',{class:'glyph sm',style:'background:var('+g.hue+')',html:ICON[id]})),
    h('h1',{class:'title'},g.name),
    h('p',{class:'sub'},g.desc));
  const st=h('div',{class:'stage'});app.append(st);return st;
}
function route(){
  cleanups.forEach(f=>{try{f()}catch(e){}});cleanups=[];
  const id=location.hash.slice(1);
  app.innerHTML='';window.scrollTo(0,0);
  if(session&&id!==ORDER[session.i]&&id!=='complete')session=null;
  const tabs=id==='home'||id==='progress'||id==='options'||!(games[id]||id==='complete'||id==='');
  document.body.classList.toggle('has-tabs',tabs);
  if(id==='complete')complete();
  else if(id==='progress'){session=null;progress()}
  else if(id==='options'){session=null;options()}
  else if(games[id])games[id].mount(frame(id));
  else if(id===''){session=null;splash()}
  else{session=null;home()}
}
addEventListener('hashchange',route);
applyTheme();
route();
applyTheme();
})();
