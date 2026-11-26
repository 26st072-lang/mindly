// Shared deterministic policy. RE2 only, with at most 100 groups per pattern.
const word=value=>{
  const forms=[...new Set([value,value.normalize('NFD'),value.normalize('NFKC')])];
  return forms.length===1?value:'(?:'+forms.join('|')+')';
};
const abuseWord=value=>[...value].map(word).join('');
const any=values=>'(?:'+values.map(word).join('|')+')';
function clusters(values){
  const result=[];let chunk=[],groups=0;
  for(const value of values){
    const pattern=abuseWord(value),size=(pattern.match(/\(\?:/g)||[]).length;
    if(groups+size>24){result.push('(?:'+chunk.join('|')+')');chunk=[];groups=0;}
    chunk.push(pattern);groups+=size;
  }
  if(chunk.length)result.push('(?:'+chunk.join('|')+')');return result;
}
const emphasis='(?:'+any(['아','아니','야','진짜','정말','너무','참','완전','솔직히','그냥','좀','빨리','존나','개','또','자꾸','계속'])+'){0,5}';
const particles='(?:'+any(['은','는','이','가','도','들','들아','아','야','같은','같이'])+'){0,2}';
const person=any(['너','너희','넌','니','네','당신','작성자','글쓴이','글쓴분','댓글작성자','댓쓴이','저사람','그사람','이사람','쟤','걔','친구']);
const slurs=clusters(['병신','븅신','빙신','뵹신','비응신','벼엉신','병씬','븅씬','개새끼','개새꺄','개새꺅','개색끼','개색기','개세끼','개쉐끼','씨발새끼','시발새끼','씹새끼','미친새끼','미친새꺄','미친년','미친뇬','미친놈','새끼야','새꺄','찐따','찌질이','등신','저능아','또라이']);
const assessment=clusters(['바보','멍청','못생겼','못생긴','못생김','못생겨','한심','쓰레기같','쓰레기야','쓰레기네','쓰레기인간','쓸모없는인간','살가치없는','아무도널안좋아','아무도너를안좋아','친구도없지','왕따당할만','왕따당해도싸']);
const mental=clusters(['정신병있냐','정신병있니','정신병이있냐','정신병자냐','정신병자같','정병있냐','정병이냐','정병새끼','정병년','정병놈','자폐냐','자폐같','장애인이냐','장애인같','장애새끼','조현병이냐','우울증환자냐']);
const threats=clusters(['죽여버릴','죽여버린','죽여버리겠','죽여버려','때려죽','칼로찌르','칼로찔러','패버릴','패버리겠','맞아야정신','너두고봐','찾아가서죽']);
const actor=any(['친구','반친구','친구들','선배','동급생','누군가','어떤애','그애','걔','쟤']);
const victim=any(['나한테','나에게','나보고','나를','저한테','저에게','저를','내게','동생에게','동생을','친구에게','친구를']);
const linking='(?:'+any(['이라고','라고','이라며','라며','라면서','이라는','라는','이란','란'])+')?';
const past=any(['말했','욕했','놀렸','불렀','했','괴롭혔']);
const self=any(['나','내가','나는','난','나도','저는','제가','내자신']);
const situation=any(['상황','기분','하루','시험','과제','의견','행동','방법','정책','주장','선택','결정','결과','세상','날씨','인생','일','게임']);
const terms=[...slurs,...assessment,...mental],quoted='"[^"]{1,120}"';
const safe=[];
for(const term of [quoted,...terms]){
  safe.push(actor+particles+victim+emphasis+term+linking+past);
  safe.push(actor+particles+term+linking+victim+past);
  safe.push(self+particles+term+linking+any(['말','소리','욕'])+'(?:'+any(['을','를'])+')?'+any(['들었','들으','듣고','듣는','들어서','받았','당했']));
}
for(const term of [...slurs,...mental])safe.push(term+linking+any(['불렸','불려','욕먹','놀림받','들었','들어서','불리며']));
safe.push(any(['바보','멍청이','쓰레기','한심한사람'])+particles+any(['아니야','아니에요','아니다','아니라','아니고','아닙니다','같지않아']));
for(const term of [...terms,word('ㅂㅅ')])safe.push(self+particles+emphasis+term);
safe.push(situation+particles+emphasis+any(['개같','거지같','쓰레기같','한심','바보같','멍청']));
safe.push(any(['바보같은방법','바보같은행동','멍청한선택','한심한결정']));
safe.push(any(['바보같은','멍청한','한심한','쓰레기같은'])+situation);
safe.push(word('ㄱㄴㄷㄹㅁㅂㅅㅇ'));
safe.push('(?:'+word('2016')+word('년')+particles+word('병신년')+'|'+word('병신년')+particles+word('2016')+word('년')+')');
safe.push(word('병')+any(['신기하','신기해','신기한','신기했','신약']));
const initialWords=['ㅂㅅ','ㅄ','ㄱㅅㄲ','ㅅㄲ','ㅁㅊㄴ'];
const initialsUsed=[...new Set(initialWords.join(''))];
const normalizeInitials=[];
for(let point=0xFFA0;point<=0xFFDC;point++){
  const half=String.fromCodePoint(point),canonical=half.normalize('NFKC');
  const initial=initialsUsed.find(char=>char.normalize('NFKC')===canonical);
  if(initial)normalizeInitials.push([half,initial]);
}
export const concernPolicy={
  message:'다른 사람에게 상처를 주는 표현은 수정해 주세요.',
  prepare:[['[“”「」『』]','"'],['[‘’]','"'],["'",'"'],...normalizeInitials,['[^가-힣ㄱ-ㅎㅏ-ㅣᄀ-ᇿa-z0-9"!?]','']],
  safe,
  finish:[['[0-9"!?]','']],
  blocked:[...slurs,...assessment,...mental,...threats,
    '(?:'+initialWords.map(abuseWord).join('|')+')',
    person+particles+emphasis+any(['개같','거지같','쓰레기','미친','죽어','뒤져','닥쳐','꺼져','정신병자','정병','장애인','조현병']),
    '^'+emphasis+any(['바보같아','죽어','죽어라','죽어요','뒤져','뒤져라','닥쳐','꺼져'])+'[ㅋㅎㅠㅜ]*$',
    word('미친아')+'(?:$|[ㅋㅎㅠㅜ]|'+person+'|'+any(['꺼져','닥쳐','죽어','진짜','정말'])+')',
    any(['개같은','거지같은'])+any(['것','것들','인간','사람','놈','년']),
    person+particles+emphasis+any(['씨발','시발','씨빨','시빨','씨팔','시팔','지랄','좆','좃','ㅅㅂ','ㅆㅂ'])+'[ㅋㅎㅠㅜ]*$',
    any(['씨발','시발','씨빨','시빨','씨팔','시팔','지랄','좆','좃','ㅅㅂ','ㅆㅂ'])+person+particles+'[ㅋㅎㅠㅜ]*$',
    any(['바보아냐','바보아니야'])+'[?]',
  ],
};
for(const pattern of [...concernPolicy.safe,...concernPolicy.blocked]){
  if((pattern.match(/\(\?:/g)||[]).length>100)throw Error('Concern regex exceeds the Firestore grouping limit');
}
