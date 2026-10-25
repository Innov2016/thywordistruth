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
 ['Moses & the Exodus',inBooks('Exodus')],['Law & the Tabernacle',inBooks('Leviticus','Exodus')],
 ['The Wilderness Journey',inBooks('Numbers','Deuteronomy')],['Joshua & the Judges',inBooks('Joshua','Judges')],
 ['Women of the Bible',words(/\b(?:Eve|Sarah|Rebekah|Rachel|Leah|Miriam|Rahab|Deborah|Ruth|Naomi|Hannah|Esther|Mary|Martha|Elisabeth|Lydia|Priscilla|Dorcas|Tabitha)\b/i)],
 ["Kings' Reigns",words(/\b(?:reigned|reign)\b/i)],['Prophets & Visions',inBooks('Isaiah','Jeremiah','Ezekiel','Daniel','Amos','Hosea','Zechariah')],
 ['Psalms & Praise',inBooks('Psalms')],['Proverbs & Wise Sayings',inBooks('Proverbs','Ecclesiastes')],['Job & His Trials',inBooks('Job')],
 ['Feasts & Holy Days',words(/\b(?:passover|pentecost|purim|tabernacles|unleavened|sabbath|atonement|feast)\b/i)],
 ['Angels & Dreams',words(/\b(?:angel|angels|dream|dreams|vision)\b/i)],
 ['Miracles & Healing',words(/\b(?:miracle|miracles|healed|healing|leprosy|leper|blind|lame)\b/i)],
 ['The Birth of Jesus',q=>chapters('Matthew',1,2)(q)||chapters('Luke',1,2)(q)],
 ['Parables & Teachings',q=>gospel(q)&&words(/\b(?:parable|parables|blessed|kingdom|teach|taught)\b/i)(q)],
 ['People Jesus Met',q=>gospel(q)&&words(/\b(?:Nicodemus|Zacchæus|Zacchaeus|Lazarus|Martha|Mary|Bartimæus|Bartimaeus|Pilate|Samaritan|centurion)\b/i)(q)],
 ['The Cross & Resurrection',q=>chapters('Matthew',26,28)(q)||chapters('Mark',14,16)(q)||chapters('Luke',22,24)(q)||chapters('John',18,21)(q)],
 ["Paul's Journeys",chapters('Acts',13,28)],['Apostles & the Church',inBooks('Acts')],
 ['Faith, Hope & Charity',words(/\b(?:faith|hope|charity)\b/i)],['Prayer & Worship',words(/\b(?:pray|prayer|prayed|worship|worshipped|praise|sing)\b/i)],
 ['Animals in Scripture',words(/\b(?:camels?|sheep|oxen|asses|ass|lion|lions|lamb|serpent|fish|raven|dove|horse|horses)\b/i)],
 ['Cities & Places',words(/\b(?:Jerusalem|Bethlehem|Nazareth|Jericho|Beth-el|Bethel|Nineveh|Damascus|Antioch|Ephesus|Corinth|Babylon|Egypt|Galilee|Jordan)\b/i)],
 ['Bread, Wine & Harvest',words(/\b(?:bread|wine|wheat|barley|harvest|figs|grapes|manna|honey)\b/i)],
 ['Numbers & Measurements',q=>q.kind==='number'||(q.category==='Feasts & Numbers'&&q.kind==='trivia')],
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
export function makeBoard(questions,ids,mode,seenIds=[],random=Math.random,rows=5){
 if(ids.length<1||ids.length>maxCategories||new Set(ids).size!==ids.length)throw Error(`Choose between 1 and ${maxCategories} different categories.`);
 const pools=ids.map(id=>questions.filter(q=>matches(q,id,mode)));
 if(pools.some(p=>p.length<rows))throw Error(`Each category needs at least ${rows} questions with these settings. Broaden the filters or choose another category.`);
 const chosen=new Set(),seen=new Set(seenIds),board=[];
 const slots=Array.from({length:rows},(_,r)=>ids.map((id,c)=>({id,c,d:r+1}))).flat();
 // Allocate scarce categories first when a theme and a book overlap.
 for(const slot of [...slots].sort((a,b)=>pools[a.c].length-pools[b.c].length||a.d-b.d)){
  let pool=pools[slot.c].filter(q=>!chosen.has(q.id));
  if(!pool.length)throw Error('These categories overlap too much for this question bank. Choose another category.');
  const unseen=pool.filter(q=>!seen.has(q.id));if(unseen.length)pool=unseen;
  const distance=Math.min(...pool.map(q=>Math.abs(q.difficulty-slot.d)));pool=pool.filter(q=>Math.abs(q.difficulty-slot.d)===distance);
  const classic=pool.filter(q=>q.kind==='trivia');if(mode==='mixed'&&classic.length&&random()<.65)pool=classic;
  const q=pool[Math.floor(random()*pool.length)];chosen.add(q.id);
  board[(slot.d-1)*ids.length+slot.c]={...q,category:slot.id.replace(/^(?:category|book|theme):/,''),value:slot.d*200,used:false};
 }
 return board;
}
