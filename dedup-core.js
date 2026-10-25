// A question may share several facts/verses with other questions. None may
// coexist within a quiz, even across categories, boards, or the final round.
const related=[
 ['job-livestock',['Job 1:3','Job 42:12']],
 ['feeding-leftovers',['Matthew 14:20','Matthew 15:37','Mark 6:43','Mark 8:8','Luke 9:17','John 6:13']],
 ['jesus-birthplace',['Matthew 2:1','Luke 2:4','Luke 2:11']],
 ['david-reign',['1 Kings 2:11','1 Chronicles 29:27','2 Samuel 5:4','2 Samuel 5:5','1 Chronicles 3:4']],
 ['solomon-reign',['1 Kings 11:42','2 Chronicles 9:30']],
 ['hezekiah-reign',['2 Kings 18:2','2 Chronicles 29:1']],
 ['manasseh-reign',['2 Kings 21:1','2 Chronicles 33:1']],
 ['josiah-reign',['2 Kings 22:1','2 Chronicles 34:1']],
 ['ahab-reign',['1 Kings 16:29']],
 ['jeroboam-reign',['1 Kings 14:20']],
 ['asa-reign',['1 Kings 15:10','2 Chronicles 16:13']],
 ['rehoboam-reign',['1 Kings 14:21','2 Chronicles 12:13']],
 ['jehoiachin-reign',['2 Kings 24:8','2 Chronicles 36:9']],
 ['jehoiakim-reign',['2 Kings 23:36','2 Chronicles 36:5']],
 ['jehoahaz-reign',['2 Kings 23:31','2 Chronicles 36:2']],
 ['zedekiah-reign',['2 Kings 24:18','2 Chronicles 36:11','Jeremiah 52:1']],
 ['uzziah-reign',['2 Kings 15:2','2 Chronicles 26:3']],
 ['jotham-reign',['2 Kings 15:33','2 Chronicles 27:1','2 Chronicles 27:8']],
 ['ahaz-reign',['2 Kings 16:2','2 Chronicles 28:1']],
 ['jehoshaphat-reign',['1 Kings 22:42','2 Chronicles 20:31']],
 ['amaziahs-reign',['2 Kings 14:2','2 Chronicles 25:1']],
 ['ahaziah-reign',['2 Kings 8:26','2 Chronicles 22:2']],
 ['jehoram-reign',['2 Kings 8:17','2 Chronicles 21:5','2 Chronicles 21:20']],
 ['amon-reign',['2 Kings 21:19','2 Chronicles 33:21']],
 ['joash-reign',['2 Kings 12:1','2 Chronicles 24:1']],
 ['athaliah-reign',['2 Kings 11:3','2 Chronicles 22:12']]
];
const verseFamilies=new Map();
for(const [family,refs] of related)for(const ref of refs)verseFamilies.set(ref,family);
export function questionKeys(q){
 const refs=String(q.reference||'').split(/;\s*/).filter(Boolean);
 return [...new Set(['id:'+q.id,...refs.map(ref=>'verse:'+ref),...refs.filter(ref=>verseFamilies.has(ref)).map(ref=>'fact:'+verseFamilies.get(ref))])];
}
export function exclusionKeys(questions){return new Set(questions.flatMap(questionKeys));}
export function conflictsWith(q,keys){return questionKeys(q).some(key=>keys.has(key));}
// A conservative count of mutually compatible clues for setup availability.
export function uniqueClueCount(questions){const used=new Set();let count=0;for(const q of [...questions].sort((a,b)=>questionKeys(a).length-questionKeys(b).length)){if(conflictsWith(q,used))continue;questionKeys(q).forEach(key=>used.add(key));count++;}return count;}
