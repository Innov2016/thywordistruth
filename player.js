const $=id=>document.getElementById(id),key='scripture-jeopardy-player-v1';
let view=null,received=Date.now();
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function render(data){view=data;received=Date.now();const live=!!data?.enabled,q=live?data.question:null;
 $('player-question').hidden=!q;$('player-board-area').hidden=!!q;$('player-status').textContent=!live?'WAITING FOR HOST MODE':data.phase==='finished'?'GAME COMPLETE'+(data.result?' · '+(data.result.leaders.length>1?'Tie: ':'Winner: ')+data.result.leaders.join(' & '):''):data.phase==='final'?'FINAL CHALLENGE':`${data.teams.find(t=>t.current)?.name||'Host'} · your turn`;
 $('player-instructions').hidden=live;$('player-message').textContent=!live?'Ready when you are.':data.message||(['final-ready','final'].includes(data.phase)?'One final question awaits.':data.phase==='between'?'Next board coming up.':data.phase==='finished'?'A chapter well played.':'Choose your next clue.');
 $('player-options').replaceChildren();if(q){$('player-category').textContent=q.category+(q.value!==undefined?' · '+q.value.toLocaleString()+' POINTS':'');$('player-prompt').textContent=q.prompt;(q.options||[]).forEach((o,i)=>$('player-options').append(el('div','player-option'+(o.removed?' removed':''),`${'ABCDEF'[i]}. ${o.text}`)));$('player-answer-area').hidden=!q.answer;$('player-answer').textContent=q.answer||'';$('player-reference').textContent=q.reference||'';}
 $('player-board').replaceChildren();if(live&&!q){const names=data.categories||[];$('player-board').style.gridTemplateColumns=`repeat(${Math.max(1,names.length)},minmax(${names.length>6?'135px':'0'},1fr))`;names.forEach(n=>$('player-board').append(el('div','category',n)));(data.board||[]).forEach(c=>$('player-board').append(el('div','tile player-tile'+(c.used?' played':''),c.used?'✓':c.value.toLocaleString())));}
 $('player-teams').replaceChildren();if(live)(data.teams||[]).forEach(t=>{const card=el('div','player-team'+(t.current?' current':''));card.append(el('h3','',t.name),el('strong','',t.score.toLocaleString()));$('player-teams').append(card);});tick();
}
function tick(){const q=view?.enabled?view.question:null;const ms=q?.remaining;$('player-timer').textContent=ms===null||ms===undefined?'':`${Math.ceil(Math.max(0,ms-(q.paused?0:Date.now()-received))/1000)}s${q.paused?' · paused':''}`;}
window.addEventListener('storage',e=>{if(e.key===key&&e.newValue)try{render(JSON.parse(e.newValue));}catch{}});
if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('scripture-jeopardy-player');channel.onmessage=e=>{if(e.data?.teams)render(e.data);};channel.postMessage({type:'request'});}
try{render(JSON.parse(localStorage.getItem(key))||{});}catch{render({});}
setInterval(tick,200);$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
