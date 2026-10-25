export function choiceKey(value){return String(value).replace(/\s*\([^)]*\)/g,'').normalize('NFKD').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();}
export function makeChoices(question,random=Math.random,count=4){
 const seen=new Set([choiceKey(question.answer)]),wrong=[];
 for(const text of question.distractors||[]){const k=choiceKey(text);if(!seen.has(k)){seen.add(k);wrong.push(text);}}
 if(![4,6].includes(count)||wrong.length<count-1)throw Error(`This question needs ${count-1} validated alternatives.`);
 function shuffle(list){for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
 const display=s=>{s=s.replace(/\s*\([^)]*\)/g,'');return s.charAt(0).toUpperCase()+s.slice(1);};
 return shuffle([{text:display(question.answer),correct:true},...shuffle(wrong).slice(0,count-1).map(text=>({text:display(text),correct:false}))]);
}
