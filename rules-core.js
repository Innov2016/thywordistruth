import {exclusionKeys,conflictsWith} from './dedup-core.js';
import {bookOf,nextTeam,makeBoard} from './game-core.js';
import {choiceKey} from './choice-core.js';
export const bibleBooks='Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split('|');
export const defaultRules={difficulty:'mixed',timerSeconds:0,penalty:'full',turnRule:'rotate',scope:'all',books:[],choiceCount:4,hint5050:false,length:'full',targetScore:3000,dailyDoubles:0,finale:false,hostMode:false};
const oneOf=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
export function normalizeRules(input={}){return {
 difficulty:oneOf(input.difficulty,['easy','mixed','hard','expert'],'mixed'),timerSeconds:oneOf(+input.timerSeconds,[0,15,30,60],0),
 penalty:oneOf(input.penalty,['full','half','none'],'full'),turnRule:oneOf(input.turnRule,['rotate','winner','steal'],'rotate'),
 scope:oneOf(input.scope,['all','old','new','selected'],'all'),books:[...new Set((Array.isArray(input.books)?input.books:[]).filter(b=>bibleBooks.includes(b)))],
 choiceCount:input.choiceCount===6?6:4,hint5050:!!input.hint5050,length:oneOf(input.length,['short','full','target'],'full'),
 targetScore:Math.max(200,Math.min(100000,Math.round(+input.targetScore||3000))),dailyDoubles:oneOf(+input.dailyDoubles,[0,1,2],0),finale:!!input.finale,hostMode:!!input.hostMode
};}
export function eligibleQuestions(questions,rules,mode='mixed',answerMode='open'){
 const r=normalizeRules(rules);
 return questions.filter(q=>{
  const book=bookOf(q),index=bibleBooks.indexOf(book);
  if(r.scope==='old'&&(index<0||index>=39)||r.scope==='new'&&index<39||r.scope==='selected'&&!r.books.includes(book))return false;
  if(r.difficulty==='easy'&&q.difficulty>2||r.difficulty==='hard'&&(q.difficulty<3||q.difficulty>4)||r.difficulty==='expert'&&q.difficulty!==5)return false;
  if(mode==='trivia'&&q.kind!=='trivia'||mode==='scripture'&&q.kind==='trivia'||['verse','people','number'].includes(mode)&&q.kind!==mode)return false;
  return answerMode!=='choice'||new Set((q.distractors||[]).map(choiceKey).filter(k=>k!==choiceKey(q.answer))).size>=r.choiceCount-1;
 });
}
export function configuredBoard(questions,categories,rules,mode,answerMode,seen=[],random=Math.random,excludedQuestions=[]){
 const r=normalizeRules(rules),pool=eligibleQuestions(questions,r,mode,answerMode),rows=r.length==='short'?3:5;
 if(r.scope==='selected'&&!r.books.length)throw Error('Select at least one Bible book.');
 const board=makeBoard(pool,categories,'mixed',seen,random,rows,excludedQuestions);
 const candidates=board.map((c,i)=>i).filter(i=>i>=categories.length);
 for(let n=0;n<r.dailyDoubles&&candidates.length;n++){const offset=Math.floor(random()*candidates.length),index=candidates.splice(offset,1)[0];board[index].daily=true;}
 return {board,pool};
}
export function scoreDelta(value,outcome,penalty='full',wager=false){
 if(outcome==='correct')return value;
 if(outcome==='pass'&&!wager)return 0;
 return wager?-value:penalty==='none'?0:penalty==='half'?-Math.ceil(value/2):-value;
}
export function dailyWagerMax(score,board){return Math.max(0,score,...board.map(c=>c.value));}
export function validWager(value,max){const n=Number(value);if(!Number.isInteger(n)||n<0||n>max)throw Error(`Enter a whole-number wager from 0 to ${max.toLocaleString()}.`);return n;}
function snapshot(state,index){return{type:'clue',index,cell:structuredClone(state.board[index]),teams:state.teams.map(t=>({id:t.id,score:t.score,hintUsed:!!t.hintUsed})),turnId:state.turnId,phase:state.phase||'playing',pendingCell:state.pendingCell??null,lastResolved:state.lastResolved??null,publicAnswer:!!state.publicAnswer,wasSeen:state.seen.includes(state.board[index].id)};}
export function resolveAttempt(state,index,teamId,outcome){
 const c=state.board[index],team=state.teams.find(t=>t.id===teamId),r=normalizeRules(state.rules);
 if(!c||c.used||!team||!['correct','incorrect','pass','timeout'].includes(outcome))throw Error('This clue cannot be scored.');
 if(c.daily&&!c.wagerLocked)throw Error('Lock the Bonus Wager wager before answering.');
 if(c.daily){if(c.ownerId!==undefined&&teamId!==c.ownerId)throw Error('Only the team that selected the Bonus Wager may answer.');validWager(c.wager,dailyWagerMax(team.score,state.board));}
 if((c.tried||[]).includes(teamId))throw Error('This team has already attempted this clue.');
 const before=snapshot(state,index);state.history.push(before);if(state.history.length>100)state.history.shift();
 const delta=scoreDelta(c.daily?c.wager:c.value,outcome,r.penalty,!!c.daily);team.score+=delta;c.tried=[...(c.tried||[]),teamId];
 const correct=outcome==='correct',contenders=state.teams.filter(t=>!c.tried.includes(t.id));
 const steal=r.turnRule==='steal'&&!c.daily&&!correct&&contenders.length>0;
 if(steal){let next=nextTeam(state.teams,teamId);while(c.tried.includes(next))next=nextTeam(state.teams,next);state.turnId=next;state.pendingCell=index;delete c.choiceAttempt;delete c.timer;c.attemptLocked=false;}
 else{c.used=true;state.pendingCell=null;state.seen=[...new Set([...state.seen,c.id])];state.lastResolved=index;state.publicAnswer=false;
  state.turnId=correct&&r.turnRule!=='rotate'?teamId:nextTeam(state.teams,r.turnRule==='steal'?(c.ownerId??teamId):teamId);
 }
 const target=r.length==='target'&&state.teams.some(t=>t.score>=r.targetScore);
 if(!steal&&(target||state.board.every(c=>c.used)))state.phase=r.length==='target'&&!target?'between':r.finale?'final-ready':'finished';
 return{delta,steal,correct,teamId,phase:state.phase||'playing'};
}
export function undoAttempt(state){
 const h=state.history.pop();if(!h)return false;
 if(h.type==='final'){state.teams.forEach(t=>{t.score=h.scores.find(s=>s.id===t.id)?.score??t.score;});state.final=structuredClone(h.final);state.phase='final';state.publicAnswer=false;return true;}
 if(h.type!=='clue')return false;
 state.board[h.index]=h.cell;delete state.board[h.index].timer;delete state.board[h.index].choiceAttempt;state.board[h.index].attemptLocked=false;
 state.teams.forEach(t=>{const s=h.teams.find(s=>s.id===t.id);if(s){t.score=s.score;t.hintUsed=s.hintUsed;}});
 state.turnId=h.turnId;state.phase=h.phase;state.pendingCell=null;state.lastResolved=h.lastResolved;state.publicAnswer=h.publicAnswer;
 if(!h.wasSeen)state.seen=state.seen.filter(id=>id!==h.cell.id);return true;
}
export function hintOptions(choices,random=Math.random){const correct=choices.findIndex(c=>c.correct),wrong=choices.map((_,i)=>i).filter(i=>i!==correct);if(correct<0||!wrong.length)throw Error('No valid hint available.');const keep=wrong[Math.floor(random()*wrong.length)];return choices.map((_,i)=>i).filter(i=>i!==correct&&i!==keep);}
export function remainingMs(timer,now=Date.now()){if(!timer)return null;return timer.paused?Math.max(0,timer.remaining):Math.max(0,timer.deadline-now);}
export function pickFinal(pool,board,seen=[],random=Math.random,excludedQuestions=[]){const blocked=exclusionKeys([...board,...excludedQuestions]);let candidates=pool.filter(q=>!conflictsWith(q,blocked));const history=exclusionKeys(pool.filter(q=>seen.includes(q.id)));const fresh=candidates.filter(q=>!conflictsWith(q,history));if(fresh.length)candidates=fresh;if(!candidates.length)throw Error('Final Challenge needs one extra unrelated question. Broaden the filters or turn Final Challenge off.');return structuredClone(candidates[Math.floor(random()*candidates.length)]);}
export function commitFinal(state){
 if(state.final?.stage!=='review')throw Error('Review the final answers before scoring.');
 for(const e of state.final.entries){if(typeof e.correct!=='boolean')throw Error('Mark every final answer correct or incorrect.');const team=state.teams.find(t=>t.id===e.teamId);validWager(e.wager,Math.max(0,team.score));}
 state.history.push({type:'final',scores:state.teams.map(t=>({id:t.id,score:t.score})),final:structuredClone(state.final)});
 for(const e of state.final.entries)state.teams.find(t=>t.id===e.teamId).score+=e.correct?e.wager:-e.wager;
 state.final.stage='done';state.phase='finished';state.publicAnswer=false;
}
// Project only audience-safe data. Never send the bank, evidence, wagers, responses,
// answer flags, or the answer itself before an explicit post-round reveal.
export function playerProjection(state,activeIndex=null,now=Date.now()){
 const r=normalizeRules(state.rules),view={enabled:r.hostMode,phase:state.phase||'playing',teams:state.teams.map(t=>({name:t.name,score:t.score,current:t.id===state.turnId})),categories:state.categories.map(c=>c.replace(/^(?:category|book|theme):/,'')),board:state.board.map(c=>({category:c.category,value:c.value,used:!!c.used})),question:null};
 if(state.phase==='finished'){const score=Math.max(...state.teams.map(t=>t.score));view.result={leaders:state.teams.filter(t=>t.score===score).map(t=>t.name),score};}
 const index=activeIndex??state.pendingCell;
 const c=index!==null&&index!==undefined?state.board[index]:state.publicAnswer&&state.lastResolved!==null&&state.lastResolved!==undefined?state.board[state.lastResolved]:null;
 const f=state.final;
 if(['final','final-ready'].includes(state.phase)||state.phase==='finished'&&f?.stage==='done'){
  view.final=true;if(f&&f.stage!=='wagers'){view.question={category:'Final Challenge · '+f.question.category,prompt:f.question.prompt,options:(f.choices||[]).map(o=>({text:o.text})),remaining:remainingMs(f.timer,now),paused:!!f.timer?.paused};if(state.publicAnswer&&f.stage==='done'){view.question.answer=f.question.answer;view.question.reference=f.question.reference;}}
  else view.message='Final Challenge'+(f?' · '+f.question.category:'')+' · place your wagers with the host.';
 }else if(c){view.question={category:c.daily?'Bonus Wager · '+c.category:c.category,prompt:c.daily&&!c.wagerLocked?'Place your wager with the host.':c.prompt,value:c.daily&&c.wagerLocked?c.wager:c.value,options:c.daily&&!c.wagerLocked?[]:(c.choices||[]).map((o,i)=>({text:o.text,removed:(c.removed||[]).includes(i)})),remaining:remainingMs(c.timer,now),paused:!!c.timer?.paused};if(state.publicAnswer&&c.used&&state.pendingCell==null){view.question.answer=c.answer;view.question.reference=c.reference;}}
 return view;
}
