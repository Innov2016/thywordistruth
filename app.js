import {uniqueClueCount} from './dedup-core.js';
import {defaultIds,maxCategories,categoryOptions,matches,nextTeam,prepareTeams} from './game-core.js';
import {makeChoices} from './choice-core.js';
import {bibleBooks,defaultRules,normalizeRules,eligibleQuestions,configuredBoard,scoreDelta,dailyWagerMax,validWager,resolveAttempt,undoAttempt,hintOptions,remainingMs,pickFinal,commitFinal,playerProjection} from './rules-core.js';
const $=id=>document.getElementById(id),key='scripture-jeopardy-v1',playerKey='scripture-jeopardy-player-v1';
const colors=['#a38c5c','#7e9488','#9b879f','#879abc','#b58473','#8f9764'];
const kindNames={trivia:'Classic trivia',people:'People & places · scripture clue',number:'Numbers & details · scripture clue',verse:'Finish the verse · scripture clue'};
let db,questions=[],options=[],active=null,lastFocus=null,toastTimer,clock=null,draft=[],draftTeams=[],previewPool=[],previewCounts={},previewSignature='';
let choiceOptions=[],chosenIndex=null,choiceLocked=false;
let state={teams:[{id:1,name:'Team Grace',score:0},{id:2,name:'Team Hope',score:0},{id:3,name:'Team Faith',score:0}],board:[],seen:[],mode:'mixed',answerMode:'open',history:[],games:0,categories:defaultIds,turnId:1,rules:defaultRules,rulesVersion:2,phase:'playing',pendingCell:null,lastResolved:null,publicAnswer:false,final:null,finalQuestion:null,quizQuestionIds:[]};
try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&Array.isArray(saved.teams)&&saved.teams.length&&Array.isArray(saved.board)&&Array.isArray(saved.seen)){if(saved.rulesVersion!==2){const last=saved.history?.at(-1)?.index;saved.lastResolved=Number.isInteger(last)?last:null;saved.history=[];saved.rulesVersion=2;saved.phase=saved.board.length&&saved.board.every(c=>c.used)?'finished':'playing';const pending=saved.board.findIndex(c=>c.choiceAttempt?.locked&&!c.used);saved.pendingCell=pending<0?null:pending;saved.publicAnswer=false;}state={...state,...saved};}}catch{}
state.rules=normalizeRules(state.rules);
if(!Array.isArray(state.quizQuestionIds)||!state.quizQuestionIds.length)state.quizQuestionIds=[...new Set([...state.board.map(q=>q.id),...(state.finalQuestion?[state.finalQuestion.id]:[])])];
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('scripture-jeopardy-player'):null;
if(channel)channel.onmessage=e=>{if(e.data?.type==='request')publish();};
function publish(){try{const view=playerProjection(state,active);localStorage.setItem(playerKey,JSON.stringify(view));channel?.postMessage(view);}catch{}}
function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{toast('Device storage is unavailable or full. Keep this page open to finish the game.');}publish();}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500);}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function currentTeam(){return state.teams.find(t=>t.id===state.turnId)||state.teams[0];}
function editingTeamsLocked(){return state.pendingCell!==null||state.board.some(c=>c.used)||['final','final-ready','finished'].includes(state.phase);}
function renderTurn(){
 state.turnId=currentTeam().id;$('turn-name').textContent=currentTeam().name;$('turn-select').replaceChildren();
 state.teams.forEach(t=>{const o=el('option','',t.name);o.value=t.id;$('turn-select').append(o);});$('turn-select').value=state.turnId;
 $('turn-select').disabled=state.pendingCell!==null||state.phase!=='playing';$('next-turn').disabled=$('turn-select').disabled;
 $('clue-turn').textContent=`Turn: ${currentTeam().name}`;
 $('turn-rule-note').textContent=state.rules.turnRule==='rotate'?'Turns rotate after each clue.':state.rules.turnRule==='winner'?'A correct answer keeps control.':'Each team gets one attempt; a correct answer keeps control.';
}
function renderTeams(){
 renderTurn();$('teams').replaceChildren();state.teams.forEach((t,i)=>{
  const card=el('div','team'+(t.id===state.turnId?' current-team':''));card.style.setProperty('--team-color',colors[i]);const top=el('div','team-top');top.append(el('span','team-marker'));
  const input=el('input');input.value=t.name;input.maxLength=28;input.setAttribute('aria-label',`Team ${i+1} name`);input.onchange=()=>{t.name=input.value.trim()||`Team ${i+1}`;save();renderTeams();};top.append(input);card.append(top,el('span','team-score',t.score.toLocaleString()));
  const turn=el('button','team-turn',t.id===state.turnId?'Your turn':'Make current');turn.disabled=state.pendingCell!==null||state.phase!=='playing';turn.onclick=()=>{state.turnId=t.id;save();renderTeams();};card.append(turn);
  if(state.rules.hint5050&&state.answerMode==='choice')card.append(el('span','team-hint',t.hintUsed?'50/50 used':'50/50 available'));
  if(state.teams.length>1){const remove=el('button','remove-team','Remove');remove.disabled=editingTeamsLocked();remove.setAttribute('aria-label',`Remove ${t.name}`);remove.onclick=()=>{state.teams=state.teams.filter(x=>x.id!==t.id);state.turnId=currentTeam().id;state.history=[];save();renderTeams();renderBoard();};card.append(remove);}
  $('teams').append(card);
 });$('add-team').disabled=state.teams.length>=6||editingTeamsLocked();
}
function rulesSummary(){const r=state.rules;return [r.difficulty+' difficulty',r.scope==='all'?'Whole Bible':r.scope==='selected'?r.books.length+' selected books':r.scope==='old'?'Old Testament':'New Testament',r.timerSeconds?r.timerSeconds+'s timer':'No timer',r.penalty==='full'?'Full penalties':r.penalty==='half'?'Half penalties':'No wrong-answer deductions',r.turnRule==='steal'?'Steals enabled':r.turnRule==='winner'?'Winner keeps control':'Rotating turns',r.length==='target'?'Target '+r.targetScore.toLocaleString():r.length==='short'?'Short board':'Full board',r.dailyDoubles?r.dailyDoubles+' Bonus Wager(s)':'',r.finale?'Final Challenge':'',r.hostMode?'Host + player display':''].filter(Boolean).join(' · ');}
function renderBoard(){
 $('board-format').textContent=state.answerMode==='choice'?`MULTIPLE CHOICE · ${state.rules.choiceCount} OPTIONS`:'OPEN ANSWER';$('rules-summary').textContent=rulesSummary();
 const board=$('board');board.replaceChildren();board.setAttribute('aria-busy','false');
 if(!state.board.length){board.append(el('p','loading','Set up your teams and categories to begin.'));$('progress').textContent='Ready when you are';}
 else{const names=state.categories.map(id=>id.replace(/^(?:category|book|theme):/,''));board.style.gridTemplateColumns=`repeat(${names.length},minmax(${names.length>6?'130px':'0'},1fr))`;names.forEach(c=>board.append(el('div','category',c)));
  state.board.forEach((c,i)=>{const button=el('button','tile'+(c.used?' played':''),c.used?'✓':c.value.toLocaleString());button.disabled=c.used||state.phase!=='playing'||state.pendingCell!==null&&state.pendingCell!==i;button.setAttribute('aria-label',`${c.category}, ${c.value} points${c.used?', played':''}`);button.onclick=()=>openClue(i,button);board.append(button);});$('progress').textContent=`${state.board.filter(c=>c.used).length} / ${state.board.length} played`;}
 $('undo').disabled=!state.history.length;$('round-title').textContent=state.phase==='finished'?'A chapter well played.':state.games>1?'A fresh board. A new challenge.':'A good place to begin.';
 $('resume-clue').hidden=state.pendingCell===null;$('review-answer').disabled=state.lastResolved===null&&state.final?.stage!=='done';$('open-player').hidden=!state.rules.hostMode;$('public-reveal').hidden=!state.rules.hostMode;
 $('public-reveal').disabled=state.pendingCell!==null||state.lastResolved===null&&state.final?.stage!=='done'||state.phase==='final'||state.phase==='final-ready';
 $('public-reveal').textContent=state.publicAnswer?'Answer revealed to players':'Reveal last answer to players';
 const status=$('game-status'),action=$('game-action');status.hidden=!['between','final-ready','final','finished'].includes(state.phase);action.hidden=false;
 if(state.phase==='between'){$('game-status-text').textContent=`Board complete. Keep going toward ${state.rules.targetScore.toLocaleString()} points.`;action.textContent='Next board →';}
 if(state.phase==='final-ready'||state.phase==='final'){$('game-status-text').textContent='The main round is complete. One final question awaits.';action.textContent=state.phase==='final-ready'?'Start Final Challenge →':'Resume Final Challenge →';}
 if(state.phase==='finished'){const high=Math.max(...state.teams.map(t=>t.score)),leaders=state.teams.filter(t=>t.score===high);$('game-status-text').textContent=(leaders.length>1?'Tie: ':'Winner: ')+leaders.map(t=>t.name).join(' & ')+` · ${high.toLocaleString()} points`;action.hidden=state.final?.stage!=='done';action.textContent='Review Final Challenge';}
}
const ruleFields=['difficulty','timerSeconds','penalty','turnRule','scope','choiceCount','length','targetScore','dailyDoubles'];
const ruleChecks=['hint5050','finale','hostMode'];
function readRules(){const r={};ruleFields.forEach(k=>r[k]=$('rule-'+k).value);ruleChecks.forEach(k=>r[k]=$('rule-'+k).checked);r.choiceCount=Number(r.choiceCount);r.books=Array.from($('scope-books').querySelectorAll('input:checked')).map(i=>i.value);return normalizeRules(r);}
function renderBooks(selected){$('scope-books').replaceChildren();bibleBooks.forEach(book=>{const label=el('label','',book),input=el('input');input.type='checkbox';input.value=book;input.checked=selected.includes(book);input.onchange=refreshFilters;label.prepend(input);$('scope-books').append(label);});}
function openSetup(){
 if(state.pendingCell!==null)pauseActive(true);
 draft=[...state.categories];draftTeams=state.teams.map(t=>({...t}));$('bank-mode').value=state.mode;$('answer-mode').value=state.answerMode;$('category-error').textContent='';$('category-search').value='';$('setup-team-count').value=draftTeams.length;
 ruleFields.forEach(k=>$('rule-'+k).value=state.rules[k]);ruleChecks.forEach(k=>$('rule-'+k).checked=state.rules[k]);renderBooks(state.rules.books);previewSignature='';renderDraftTeams();$('starting-team').value=currentTeam().id;renderPicker();$('setup-dialog').showModal();
}
function renderStartingTeam(){const chosen=$('starting-team').value;$('starting-team').replaceChildren();draftTeams.forEach((t,i)=>{const o=el('option','',t.name.trim()||`Team ${i+1}`);o.value=t.id;$('starting-team').append(o);});if(draftTeams.some(t=>String(t.id)===String(chosen)))$('starting-team').value=chosen;}
function renderDraftTeams(){$('setup-team-names').replaceChildren();draftTeams.forEach((t,i)=>{const label=el('label','setup-team-label',`Team ${i+1} name`),input=el('input');input.value=t.name;input.maxLength=28;input.placeholder=`Team ${i+1}`;input.oninput=()=>{t.name=input.value;renderStartingTeam();};label.append(input);$('setup-team-names').append(label);});renderStartingTeam();}
function setDraftTeamCount(){const count=Number($('setup-team-count').value);draftTeams=draftTeams.slice(0,count);while(draftTeams.length<count)draftTeams.push({id:Date.now()+draftTeams.length,name:`Team ${draftTeams.length+1}`,score:0});renderDraftTeams();}
function ensurePreview(){const r=readRules(),signature=JSON.stringify([r.difficulty,r.scope,r.books,r.choiceCount,$('bank-mode').value,$('answer-mode').value]);if(signature!==previewSignature){previewSignature=signature;previewPool=eligibleQuestions(questions,r,$('bank-mode').value,$('answer-mode').value);previewCounts=Object.fromEntries(options.map(o=>[o.id,uniqueClueCount(previewPool.filter(q=>matches(q,o.id,'mixed')))]));}return r;}
function renderPicker(){
 const r=ensurePreview(),rows=r.length==='short'?3:5,search=$('category-search').value.toLowerCase();$('category-options').replaceChildren();
 for(const group of ['Classic themes','More themes','Books of the Bible']){const section=el('section','category-group');section.append(el('h3','eyebrow',group));const list=el('div','category-list');options.filter(o=>o.group===group&&o.name.toLowerCase().includes(search)).forEach(o=>{const count=previewCounts[o.id]||0,label=el('label','category-option'+(count<rows?' unavailable':'')),input=el('input');input.type='checkbox';input.checked=draft.includes(o.id);input.disabled=!input.checked&&(count<rows||draft.length>=maxCategories);input.onchange=()=>{draft=input.checked?[...draft,o.id]:draft.filter(id=>id!==o.id);$('category-error').textContent='';renderPicker();};label.append(input,el('span','',o.name),el('small','',`${count.toLocaleString()} distinct clues`));list.append(label);});section.append(list);$('category-options').append(section);}
 $('category-count').textContent=`${draft.length} / ${maxCategories} categories · ${draft.length*rows} clues`;$('category-library-size').textContent=`${options.length} categories to explore; ${Object.values(previewCounts).filter(n=>n>=rows).length} fit these settings.`;
 $('start-game').disabled=!draft.length||draft.some(id=>(previewCounts[id]||0)<rows);$('choice-bank-note').hidden=$('answer-mode').value!=='choice';$('book-scope-panel').hidden=r.scope!=='selected';$('target-score-label').hidden=r.length!=='target';$('rule-choiceCount').disabled=$('answer-mode').value!=='choice';$('rule-hint5050').disabled=$('answer-mode').value!=='choice';
}
function refreshFilters(){previewSignature='';const r=ensurePreview(),rows=r.length==='short'?3:5;draft=draft.filter(id=>(previewCounts[id]||0)>=rows);renderPicker();}
function startGame(ids,mode,startingId,teamDraft=state.teams,answerMode=state.answerMode,rules=state.rules){
 let built,teams,finalQuestion=null;const r=normalizeRules(rules);
 try{teams=prepareTeams(teamDraft).map(t=>({...t,hintUsed:false}));built=configuredBoard(questions,ids,r,mode,answerMode,state.seen);if(r.finale)finalQuestion=pickFinal(built.pool.filter(q=>ids.some(id=>matches(q,id,'mixed'))),built.board,state.seen);}catch(e){$('category-error').textContent=e.message;return;}
 clearClock();state={...state,mode,answerMode,rules:r,categories:[...ids],board:built.board,history:[],teams,turnId:teams.some(t=>t.id===startingId)?startingId:teams[0].id,games:state.games+1,phase:'playing',pendingCell:null,lastResolved:null,publicAnswer:false,final:null,finalQuestion,quizQuestionIds:[...built.board.map(q=>q.id),...(finalQuestion?[finalQuestion.id]:[])]};active=null;save();renderBoard();renderTeams();$('setup-dialog').close();
}
function nextBoard(){try{const previousIds=new Set([...(state.quizQuestionIds||[]),...state.board.map(q=>q.id),...(state.finalQuestion?[state.finalQuestion.id]:[])]);const excluded=questions.filter(q=>previousIds.has(q.id));const built=configuredBoard(questions,state.categories,state.rules,state.mode,state.answerMode,state.seen,Math.random,excluded);state.board=built.board;state.quizQuestionIds=[...previousIds,...built.board.map(q=>q.id)];state.history=[];state.pendingCell=null;state.lastResolved=null;state.publicAnswer=false;state.phase='playing';save();renderBoard();renderTeams();}catch(e){toast(e.message);}}
function clearClock(){if(clock!==null)clearInterval(clock);clock=null;}
function freezeTimer(c){if(c.timer){c.timer.remaining=remainingMs(c.timer);c.timer.paused=true;}}
function pauseActive(force=false){const c=state.pendingCell!==null?state.board[state.pendingCell]:null;if(!c?.timer||c.attemptLocked)return;if(force||!c.timer.paused)freezeTimer(c);else{c.timer.deadline=Date.now()+c.timer.remaining;c.timer.paused=false;}save();tickClock();}
function armTimer(c){clearClock();if(!state.rules.timerSeconds||c.attemptLocked||c.daily&&!c.wagerLocked){$('clue-timer').textContent=c.attemptLocked?'Answer locked':'';$('pause-clock').hidden=true;return;}if(!c.timer)c.timer={deadline:Date.now()+state.rules.timerSeconds*1000,remaining:state.rules.timerSeconds*1000,paused:false};$('pause-clock').hidden=false;clock=setInterval(tickClock,200);tickClock();}
function tickClock(){
 if(state.phase==='final'&&state.final?.stage==='answers'){const f=state.final,ms=remainingMs(f.timer);$('final-timer').textContent=ms===null?'':`${Math.ceil(ms/1000)}s${f.timer.paused?' · paused':''}`;$('pause-final').textContent=f.timer?.paused?'Resume timer':'Pause timer';if(ms===0){clearClock();lockFinalAnswers();}return;}
 const c=state.pendingCell!==null?state.board[state.pendingCell]:null;if(!c?.timer||c.used||c.attemptLocked)return;const ms=remainingMs(c.timer);$('clue-timer').textContent=`${Math.ceil(ms/1000)}s${c.timer.paused?' · paused':''}`;$('pause-clock').textContent=c.timer.paused?'Resume timer':'Pause timer';
 if(ms===0){clearClock();completeAttempt('timeout',state.pendingCell,currentTeam().id);}
}
function hasStealers(c,teamId=currentTeam().id){return state.rules.turnRule==='steal'&&!c.daily&&state.teams.some(t=>t.id!==teamId&&!(c.tried||[]).includes(t.id));}
function answerMayShow(c,correct=false){return state.rules.hostMode||correct||!hasStealers(c);}
function openClue(index,focus){
 const c=state.board[index];if(!c||c.used||state.phase!=='playing')return;if(state.pendingCell!==null&&state.pendingCell!==index){toast('Finish or pass the current clue first.');return;}
 active=index;lastFocus=focus;state.pendingCell=index;state.publicAnswer=false;if(c.ownerId===undefined)c.ownerId=currentTeam().id;renderActive();if(active!==index||c.used)return;if(!$('clue-dialog').open)$('clue-dialog').showModal();save();renderBoard();
}
function renderActive(){
 if(active===null)return;const c=state.board[active],waiting=c.daily&&!c.wagerLocked,multiple=state.answerMode==='choice';
 $('clue-meta').textContent=`${c.daily?'BONUS WAGER · ':''}${c.category} · ${(c.daily&&c.wagerLocked?c.wager:c.value).toLocaleString()} POINTS`;$('clue-turn').textContent=`Turn: ${currentTeam().name}`;$('clue-kind').textContent=kindNames[c.kind];$('clue-title').textContent=waiting?'Bonus Wager':c.prompt;$('clue-title').hidden=!!waiting;
 $('answer-area').hidden=true;$('answer').textContent=c.answer;$('reference').textContent=`Read the scripture · ${c.reference}`;$('evidence').textContent=c.evidence;const details=$('answer-area').querySelector('details');details.open=false;details.hidden=false;
 $('answer-team').replaceChildren();state.teams.forEach(t=>{const o=el('option','',t.name);o.value=t.id;o.disabled=(c.tried||[]).includes(t.id);$('answer-team').append(o);});$('answer-team').value=currentTeam().id;$('answer-team').disabled=!!c.daily;
 const value=c.daily?c.wager:c.value,wrong=scoreDelta(value||0,'incorrect',state.rules.penalty,!!c.daily);$('wrong').textContent=`Incorrect ${wrong===0?'· 0':wrong.toLocaleString()}`;$('right').textContent=`Correct +${(value||0).toLocaleString()}`;$('mc-pass').textContent=c.daily?'Pass · lose wager →':'Pass · no score →';
 $('daily-wager').hidden=!waiting;$('choice-area').hidden=!multiple||waiting;$('manual-scoring').hidden=multiple;$('skip').hidden=multiple||waiting;$('skip').textContent=c.daily?'Pass · lose wager →':'Pass · no score →';$('reveal').hidden=multiple||waiting;$('reveal').textContent=state.rules.turnRule==='steal'&&!state.rules.hostMode?'Judge spoken answer':'Reveal answer';
 $('hint-5050').hidden=true;
 if(waiting){const max=dailyWagerMax(currentTeam().score,state.board);$('wager-limit').textContent=`Only ${currentTeam().name} answers. Wager 0–${max.toLocaleString()} points. A wrong answer or pass loses the full wager.`;$('wager-input').max=max;$('wager-input').value=Math.min(c.value,max);$('wager-error').textContent='';clearClock();$('clue-timer').textContent='Wager before the clue';$('pause-clock').hidden=true;return;}
 if(multiple){choiceOptions=c.choices||(c.choices=makeChoices(c,Math.random,state.rules.choiceCount));chosenIndex=c.choiceAttempt?.index??null;choiceLocked=!!c.choiceAttempt?.locked;$('mc-feedback').textContent='';$('mc-submit').hidden=choiceLocked;$('mc-next').hidden=!choiceLocked;$('mc-pass').hidden=choiceLocked;renderChoices();if(choiceLocked)renderLocked();}
 else if(c.attemptLocked)showSpokenAnswer();
 armTimer(c);
}
function renderChoices(){
 const c=state.board[active];$('mc-options').replaceChildren();const showCorrect=choiceLocked&&answerMayShow(c,choiceOptions[chosenIndex]?.correct);
 choiceOptions.forEach((o,i)=>{const removed=(c.removed||[]).includes(i),button=el('button','mc-option'+(chosenIndex===i?' selected':'')+(showCorrect&&o.correct?' is-correct':'')+(choiceLocked&&chosenIndex===i&&!o.correct?' is-wrong':'')+(removed?' removed':''));button.append(el('span','mc-letter','ABCDEF'[i]),el('span','',o.text));button.setAttribute('aria-pressed',String(chosenIndex===i));button.disabled=choiceLocked||removed;button.onclick=()=>{if(choiceLocked||removed)return;chosenIndex=i;renderChoices();$('mc-options').children[i].focus();};$('mc-options').append(button);});
 $('mc-submit').disabled=chosenIndex===null;$('hint-5050').hidden=!state.rules.hint5050;$('hint-5050').disabled=choiceLocked||currentTeam().hintUsed||choiceOptions.length-(c.removed||[]).length<=2;
}
function renderLocked(){
 const c=state.board[active],correct=choiceOptions[chosenIndex].correct,delta=scoreDelta(c.daily?c.wager:c.value,correct?'correct':'incorrect',state.rules.penalty,!!c.daily);$('answer-area').hidden=!answerMayShow(c,correct);$('mc-feedback').textContent=correct?'Correct. Apply the points to continue.':hasStealers(c)?'Incorrect. Apply the score so the next team can try.':'Incorrect. The correct answer is shown below.';
 $('mc-submit').hidden=true;$('mc-pass').hidden=true;$('mc-next').hidden=false;$('mc-next').textContent=`Score ${delta>0?'+':''}${delta} & ${!correct&&hasStealers(c)?'next attempt':'next turn'} →`;
}
function lockChoice(){if(active===null||choiceLocked||chosenIndex===null)return;const c=state.board[active];if(c.timer&&remainingMs(c.timer)===0){tickClock();return;}choiceLocked=true;c.choiceAttempt={index:chosenIndex,locked:true};c.attemptLocked=true;freezeTimer(c);clearClock();$('clue-timer').textContent=state.rules.timerSeconds?'Answer locked':'';$('pause-clock').hidden=true;renderChoices();renderLocked();save();$('mc-next').focus();}
function showSpokenAnswer(){const c=state.board[active];$('answer-area').hidden=false;$('reveal').hidden=true;const show=answerMayShow(c);$('answer').textContent=show?c.answer:'Answer hidden while steals remain';$('answer-area').querySelector('details').hidden=!show;$('answer-team').focus();}
function revealAnswer(){if(active===null)return;const c=state.board[active];if(c.timer&&remainingMs(c.timer)===0){tickClock();return;}c.attemptLocked=true;freezeTimer(c);clearClock();$('clue-timer').textContent=state.rules.timerSeconds?'Answer locked':'';$('pause-clock').hidden=true;showSpokenAnswer();save();}
function closeClue(){$('clue-dialog').close();active=null;publish();lastFocus?.focus();}
function completeAttempt(outcome,index=active??state.pendingCell,teamId){
 if(index===null||index===undefined||state.board[index]?.used)return;const c=state.board[index];teamId??=active===index?Number($('answer-team').value):currentTeam().id;const wasOpen=$('clue-dialog').open,wrongIndex=chosenIndex;
 let result;try{result=resolveAttempt(state,index,teamId,outcome);}catch(e){toast(e.message);return;}clearClock();
 if(result.steal){if(outcome==='incorrect'&&state.answerMode==='choice'&&wrongIndex!==null)c.removed=[...new Set([...(c.removed||[]),wrongIndex])];if(wasOpen){active=index;renderActive();}else active=null;}
 else{active=null;$('clue-dialog').close();}
 save();renderTeams();renderBoard();toast(`${state.teams.find(t=>t.id===teamId).name}: ${result.delta>0?'+':''}${result.delta.toLocaleString()} points${outcome==='timeout'?' · time expired':''} · ${result.steal?'next team may steal':state.phase==='playing'?currentTeam().name+' is next':'round complete'}`);
}
function score(correct){completeAttempt(correct?'correct':'incorrect');}
function useHint(){if(active===null||choiceLocked||currentTeam().hintUsed)return;const c=state.board[active],available=choiceOptions.map((o,i)=>({o,i})).filter(x=>!(c.removed||[]).includes(x.i));if(available.length<=2)return;const hidden=hintOptions(available.map(x=>x.o));c.removed=[...new Set([...(c.removed||[]),...hidden.map(i=>available[i].i)])];if(c.removed.includes(chosenIndex))chosenIndex=null;currentTeam().hintUsed=true;save();renderChoices();renderTeams();}
function lockDaily(){if(active===null)return;const c=state.board[active];try{c.wager=validWager($('wager-input').value,dailyWagerMax(currentTeam().score,state.board));c.wagerLocked=true;save();renderActive();}catch(e){$('wager-error').textContent=e.message;}}
function undo(){clearClock();if(!undoAttempt(state))return;active=null;$('clue-dialog').close();save();renderTeams();renderBoard();toast('Last score, turn, and clue restored.');if(state.phase==='final')renderFinal();}
function openReview(){const q=state.final?.stage==='done'?state.final.question:state.board[state.lastResolved];if(!q)return;$('review-title').textContent=q.prompt;$('review-correct').textContent=q.answer;$('review-reference').textContent=q.reference;$('review-evidence').textContent=q.evidence;$('review-dialog').showModal();}
function openFinal(){
 if(!state.final){const q=state.finalQuestion;if(!q){toast('No final question is available.');return;}state.final={question:q,choices:state.answerMode==='choice'?makeChoices(q,Math.random,state.rules.choiceCount):[],entries:state.teams.map(t=>({teamId:t.id,wager:0,answer:'',selected:null,correct:null})),stage:'wagers'};state.phase='final';save();}
 renderFinal();if(!$('final-dialog').open)$('final-dialog').showModal();renderBoard();
}
function renderFinal(){
 const f=state.final;if(!f)return;const wagers=f.stage==='wagers',answers=f.stage==='answers',review=f.stage==='review',done=f.stage==='done';
 $('final-title').textContent=wagers?'Place your final wagers.':done?'The final results.':'One final question.';$('final-stage-note').textContent=wagers?`Category: ${f.question.category}. Each team may wager 0 up to its current positive score. Teams with zero or negative scores may play for 0.`:answers?'Teams answer privately on paper. The host records each response below, then locks all answers.':review?'Review every answer. Wagers always gain or lose the full amount.':'Final scores are shown on the board. Undo can restore the review.';
 $('final-question').hidden=wagers;$('final-question').textContent=f.question.prompt;$('final-choices').replaceChildren();if(!wagers)f.choices.forEach((o,i)=>$('final-choices').append(el('div','',`${'ABCDEF'[i]}. ${o.text}`)));
 $('final-entries').replaceChildren();
 f.entries.forEach(e=>{const team=state.teams.find(t=>t.id===e.teamId),card=el('div','final-entry');card.append(el('h4','',team.name),el('small','',`Score: ${team.score.toLocaleString()} · wager: ${Number(e.wager).toLocaleString()}`));
  if(wagers){const label=el('label','','Wager'),input=el('input');input.type='number';input.min=0;input.max=Math.max(0,team.score);input.step=1;input.value=e.wager;input.oninput=()=>{e.wager=input.value;save();};label.append(input);card.append(label);}
  if(answers){const label=el('label','',state.answerMode==='choice'?'Team answer':'Written answer');const input=el(state.answerMode==='choice'?'select':'input');if(state.answerMode==='choice'){const blank=el('option','','No answer');blank.value='';input.append(blank);f.choices.forEach((o,i)=>{const option=el('option','',`${'ABCDEF'[i]}. ${o.text}`);option.value=i;input.append(option);});input.value=e.selected??'';input.onchange=()=>{e.selected=input.value===''?null:Number(input.value);save();};}else{input.value=e.answer;input.maxLength=300;input.oninput=()=>{e.answer=input.value;save();};}label.append(input);card.append(label);}
  if(review||done){card.append(el('p','',state.answerMode==='choice'?(f.choices[e.selected]?.text||'No answer'):(e.answer||'No answer')));if(review){const label=el('label','','Judgment'),select=el('select');[['','Choose correct / incorrect'],['true','Correct'],['false','Incorrect']].forEach(([value,text])=>{const o=el('option','',text);o.value=value;select.append(o);});select.value=e.correct===null?'':String(e.correct);select.onchange=()=>{e.correct=select.value===''?null:select.value==='true';save();};label.append(select);card.append(label);}else card.append(el('strong','',`${e.correct?'Correct +':'Incorrect −'}${Number(e.wager).toLocaleString()}`));}
  $('final-entries').append(card);
 });
 $('final-answer').hidden=!review&&!done;$('final-correct').textContent=f.question.answer;$('final-reference').textContent=f.question.reference;$('final-evidence').textContent=f.question.evidence;$('final-error').textContent='';$('final-action').hidden=done;$('final-action').textContent=wagers?'Lock wagers & reveal final clue →':answers?'Lock all answers →':'Apply final scores →';$('pause-final').hidden=!answers||!state.rules.timerSeconds;
 if(answers&&state.rules.timerSeconds){if(!f.timer)f.timer={deadline:Date.now()+state.rules.timerSeconds*1000,remaining:state.rules.timerSeconds*1000,paused:false};clearClock();clock=setInterval(tickClock,200);tickClock();}else $('final-timer').textContent='';publish();
}
function lockFinalAnswers(){const f=state.final;if(f?.stage!=='answers')return;clearClock();freezeTimer(f);f.entries.forEach(e=>e.correct=state.answerMode==='choice'?!!f.choices[e.selected]?.correct:null);f.stage='review';save();renderFinal();}
function finalAction(){const f=state.final;try{if(f.stage==='wagers'){f.entries.forEach(e=>{e.wager=validWager(e.wager,Math.max(0,state.teams.find(t=>t.id===e.teamId).score));});f.stage='answers';save();renderFinal();}else if(f.stage==='answers')lockFinalAnswers();else if(f.stage==='review'){commitFinal(state);clearClock();save();renderFinal();renderTeams();renderBoard();}}catch(e){$('final-error').textContent=e.message;}}
function pauseFinal(){const f=state.final;if(!f?.timer||f.stage!=='answers')return;if(f.timer.paused){f.timer.deadline=Date.now()+f.timer.remaining;f.timer.paused=false;}else freezeTimer(f);save();tickClock();}
$('reveal').onclick=revealAnswer;$('mc-submit').onclick=lockChoice;$('mc-next').onclick=()=>{if(choiceLocked&&chosenIndex!==null)score(choiceOptions[chosenIndex].correct);};$('mc-pass').onclick=()=>$('skip').onclick();
$('close-clue').onclick=closeClue;$('right').onclick=()=>score(true);$('wrong').onclick=()=>score(false);$('skip').onclick=()=>completeAttempt('pass');$('undo').onclick=undo;
$('pause-clock').onclick=()=>pauseActive();$('hint-5050').onclick=useHint;$('lock-wager').onclick=lockDaily;
$('new-game').onclick=openSetup;$('choose-categories').onclick=openSetup;$('close-setup').onclick=()=>$('setup-dialog').close();$('start-game').onclick=()=>startGame(draft,$('bank-mode').value,Number($('starting-team').value),draftTeams,$('answer-mode').value,readRules());
$('setup-team-count').onchange=setDraftTeamCount;$('bank-mode').onchange=refreshFilters;$('answer-mode').onchange=refreshFilters;$('category-search').oninput=renderPicker;
ruleFields.forEach(k=>$('rule-'+k).onchange=refreshFilters);ruleChecks.forEach(k=>$('rule-'+k).onchange=renderPicker);
$('books-all').onclick=()=>{renderBooks(bibleBooks);refreshFilters();};$('books-none').onclick=()=>{renderBooks([]);refreshFilters();};
$('default-categories').onclick=()=>{const r=ensurePreview(),rows=r.length==='short'?3:5;draft=[...defaultIds,...options.map(o=>o.id)].filter((id,i,a)=>a.indexOf(id)===i&&(previewCounts[id]||0)>=rows).slice(0,6);$('category-search').value='';renderPicker();};$('clear-categories').onclick=()=>{draft=[];renderPicker();};
$('turn-select').onchange=()=>{if(state.pendingCell!==null)return;state.turnId=Number($('turn-select').value);save();renderTeams();};$('next-turn').onclick=()=>{if(state.pendingCell!==null)return;state.turnId=nextTeam(state.teams,state.turnId);save();renderTeams();};
$('add-team').onclick=()=>{if(state.teams.length>=6||editingTeamsLocked())return;state.teams.push({id:Date.now(),name:`Team ${state.teams.length+1}`,score:0,hintUsed:false});save();renderTeams();};
$('resume-clue').onclick=()=>{if(state.pendingCell!==null)openClue(state.pendingCell);};$('review-answer').onclick=openReview;$('close-review').onclick=()=>$('review-dialog').close();$('open-player').onclick=publish;
$('public-reveal').onclick=()=>{if(state.pendingCell!==null||state.phase==='final'||state.phase==='final-ready')return;state.publicAnswer=true;save();renderBoard();};
$('game-action').onclick=()=>state.phase==='between'?nextBoard():openFinal();$('final-action').onclick=finalAction;$('pause-final').onclick=pauseFinal;$('close-final').onclick=()=>$('final-dialog').close();
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();$('reset-history').onclick=()=>{state.seen=[];save();toast('Question history cleared.');};
$('clue-dialog').addEventListener('close',()=>{active=null;publish();});
async function init(){
 renderTeams();try{const [SQL,response,info]=await Promise.all([initSqlJs({locateFile:file=>`vendor/${file}`}),fetch('questions.sqlite'),fetch('bank-info.json').then(r=>r.json())]);if(!response.ok)throw Error('Question bank download failed.');db=new SQL.Database(new Uint8Array(await response.arrayBuffer()));
  const result=db.exec('SELECT q.*,m.distractors FROM questions q LEFT JOIN multiple_choice m ON m.question_id=q.id')[0];questions=result.values.map(row=>{const q=Object.fromEntries(result.columns.map((c,i)=>[c,row[i]]));q.distractors=q.distractors?JSON.parse(q.distractors):[];return q;});options=categoryOptions(questions);
  $('choice-bank-note').textContent=`${info.multiple_choice.toLocaleString()} questions have four-choice pools. Six-choice mode uses only the pools with five or more alternatives.`;$('bank-count').textContent=info.total.toLocaleString();$('bank-description').textContent=`${info.trivia} hand-written trivia questions + ${(info.total-info.trivia).toLocaleString()} generated scripture clues. Every answer includes a KJV reference.`;$('new-game').disabled=false;$('choose-categories').disabled=false;
  if(state.board.length&&state.board.every(c=>questions.some(q=>q.id===c.id))){renderBoard();if(state.pendingCell!==null&&state.board[state.pendingCell])armTimer(state.board[state.pendingCell]);if(state.phase==='final'&&state.final?.stage==='answers')renderFinal();}
  else{state.board=[];state.pendingCell=null;renderBoard();openSetup();}publish();
 }catch(error){console.error(error);$('board').replaceChildren(el('p','loading','The question bank could not load. Refresh to try again. If running locally, use the included server.'));$('bank-count').textContent='Offline';}
}
init();
