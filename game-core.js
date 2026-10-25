import {questionKeys,exclusionKeys,uniqueClueCount} from './dedup-core.js';
import {animalQuestion,womanQuestion,placeQuestion,numberQuestion,feastQuestion,foodQuestion,faithQuestion,prayerQuestion,angelQuestion,miracleQuestion,reignQuestion} from './theme-core.js';
export const defaultCategories=['Beginnings','Kings & Kingdoms','Prophets & Wisdom','Life of Jesus','Early Church','Feasts & Numbers'];
export const defaultIds=defaultCategories.map(name=>'category:'+name);
export const maxCategories=12;
const inBooks=(...books)=>q=>books.includes(bookOf(q));
const chapters=(book,first,last)=>q=>bookOf(q)===book&&+q.reference.match(/ (\d+):/)[1]>=first&&+q.reference.match(/ (\d+):/)[1]<=last;
const words=pattern=>q=>pattern.test(q.evidence+' '+q.prompt);
const gospel=q=>['Matthew','Mark','Luke','John'].includes(bookOf(q));
export const themes=[
 ['Creation & Eden',chapters('Genesis',1,3)],['Noah & the Flood',chapters('Genesis',6,9)],
 ['Abraham, Isaac & Jacob',chapters('Genesis',12,36)],['Joseph & His Brothers',chapters('Genesis',37,50)],
 ['Moses & the Exodus',inBooks('Exodus')],['Law & the Tabernacle',q=>inBooks('Leviticus')(q)||chapters('Exodus',20,31)(q)||chapters('Exodus',35,40)(q)],
 ['The Wilderness Journey',inBooks('Numbers','Deuteronomy')],['Joshua & the Judges',inBooks('Joshua','Judges')],
 ['Women of the Bible',womanQuestion],
 ["Kings' Reigns",reignQuestion],['Prophets & Visions',inBooks('Isaiah','Jeremiah','Ezekiel','Daniel','Amos','Hosea','Zechariah')],
 ['Psalms & Praise',inBooks('Psalms')],['Proverbs & Wise Sayings',inBooks('Proverbs','Ecclesiastes')],['Job & His Trials',inBooks('Job')],
 ['Feasts & Holy Days',feastQuestion],
 ['Angels & Dreams',angelQuestion],
 ['Miracles & Healing',miracleQuestion],
 ['The Birth of Jesus',q=>chapters('Matthew',1,2)(q)||chapters('Luke',1,2)(q)],
 ['Parables & Teachings',q=>gospel(q)&&words(/\b(?:parable|parables|blessed|kingdom|teach|taught)\b/i)(q)],
 ['People Jesus Met',q=>gospel(q)&&words(/\b(?:Nicodemus|Zacchæus|Zacchaeus|Lazarus|Martha|Mary|Bartimæus|Bartimaeus|Pilate|Samaritan|centurion)\b/i)(q)],
 ['The Cross & Resurrection',q=>chapters('Matthew',26,28)(q)||chapters('Mark',14,16)(q)||chapters('Luke',22,24)(q)||chapters('John',18,21)(q)],
 ["Paul's Journeys",chapters('Acts',13,28)],['Apostles & the Church',inBooks('Acts')],
 ['Faith, Hope & Charity',faithQuestion],['Prayer & Worship',prayerQuestion],
 ['Animals in Scripture',animalQuestion],
 ['Cities & Places',placeQuestion],
 ['Bread, Wine & Harvest',foodQuestion],
 ['Numbers & Measurements',numberQuestion],
 ['People & Names',q=>q.kind==='people'],['Finish the Verse',q=>q.kind==='verse'],
 ['Letters of Paul',inBooks('Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon')],
 ['Revelation & the Last Things',inBooks('Revelation')]
].map(([name,test])=>({id:'theme:'+name,name,group:'More themes',test}));
export function bookOf(q){return q.reference.match(/^(.+?) \d+:\d+/)?.[1]||'';}
export function categoryOptions(questions){
 const books=[...new Set(questions.map(bookOf).filter(Boolean))];
 return [...defaultCategories.map(name=>({id:'category:'+name,name,group:'Classic themes'})),...themes,...books.sort((a,b)=>a.localeCompare(b)).map(name=>({id:'book:'+name,name,group:'Books of the Bible'}))];
}
export function matches(q,id,mode){return (mode==='mixed'||(mode==='trivia'?q.kind==='trivia':q.kind!=='trivia'))&&(id.startsWith('book:')?bookOf(q)===id.slice(5):id.startsWith('theme:')?Boolean(themes.find(t=>t.id===id)?.test(q)):q.category===id.slice(9));}
export function prepareTeams(teams){if(!Array.isArray(teams)||teams.length<1||teams.length>6)throw Error('Choose 1–6 teams.');return teams.map((t,i)=>({id:t.id,name:String(t.name||'').trim().slice(0,28)||`Team ${i+1}`,score:0}));}
export function nextTeam(teams,id){return teams[(Math.max(0,teams.findIndex(t=>t.id===id))+1)%teams.length].id;}
export function makeBoard(questions,ids,mode,seenIds=[],random=Math.random,rows=5,excludedQuestions=[]){
 if(ids.length<1||ids.length>maxCategories||new Set(ids).size!==ids.length)throw Error('Choose between 1 and '+maxCategories+' different categories.');
 const blocked=exclusionKeys(excludedQuestions),keys=new Map(questions.map(q=>[q.id,questionKeys(q)]));
 const pools=ids.map(id=>questions.filter(q=>matches(q,id,mode)&&!keys.get(q.id).some(k=>blocked.has(k))));
 if(pools.some(p=>uniqueClueCount(p)<rows))throw Error('Not enough unrelated questions remain for these settings. Choose another category, broaden the filters, or start a new quiz.');
 const seen=exclusionKeys(questions.filter(q=>seenIds.includes(q.id))),board=[],used=new Set(blocked);
 const sizes=pools.map(uniqueClueCount);
 const slots=Array.from({length:rows},(_,r)=>ids.map((id,c)=>({id,c,d:r+1}))).flat().sort((a,b)=>sizes[a.c]-sizes[b.c]||a.d-b.d);
 const ranked=slots.map(slot=>{const preferTrivia=mode==='mixed'&&random()<.65;return pools[slot.c].map(q=>({q,fresh:keys.get(q.id).some(k=>seen.has(k))?1:0,distance:Math.abs(q.difficulty-slot.d),classic:preferTrivia&&q.kind!=='trivia'?1:0,tie:random()})).sort((a,b)=>a.fresh-b.fresh||a.distance-b.distance||a.classic-b.classic||a.tie-b.tie).map(o=>o.q);});
 // Backtrack when overlapping themes would otherwise exhaust a scarce category.
 let attempts=0;
 function fill(index){
  if(index===slots.length)return true;
  if(++attempts>20000)return false;
  const slot=slots[index];
  for(const q of ranked[index]){const ks=keys.get(q.id);if(ks.some(k=>used.has(k)))continue;ks.forEach(k=>used.add(k));board[(slot.d-1)*ids.length+slot.c]={...q,category:slot.id.replace(/^(?:category|book|theme):/,''),value:slot.d*200,used:false};if(fill(index+1))return true;ks.forEach(k=>used.delete(k));if(attempts>20000)break;}
  return false;
 }
 if(!fill(0))throw Error('These categories share too many related questions. Choose another category or broaden the filters.');
 return board;
}
