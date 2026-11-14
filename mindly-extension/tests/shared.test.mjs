import {test} from 'node:test';
import assert from 'node:assert/strict';
import {APP_URLS,sourceURL,isMindlyURL,clipFrom,emptyWorkspace,addClip} from '../shared.mjs';
test('only the exact Mindly app can receive imported text',()=>{
  assert.equal(isMindlyURL(APP_URLS.production+'#mindly-extension',APP_URLS.production),true);
  for(const url of ['https://26st072-lang.github.io/another-project/','https://26st072-lang.github.io/mindly/other.html','https://evil.test/mindly/','https://26st072-lang.github.io.evil.test/mindly/'])assert.equal(isMindlyURL(url,APP_URLS.production),false);
});
test('source links discard credentials, fragments, tracking and unrelated query content',()=>{
  assert.equal(sourceURL('https://name:password@www.youtube.com/watch?v=abc123&token=secret&utm_source=x#private'),'https://www.youtube.com/watch?v=abc123');
  assert.equal(sourceURL('javascript:alert(1)'),'');
});
test('explicit selection is required, duplicates are ignored, and the collection is bounded',()=>{
  assert.throws(()=>clipFrom({text:''}),error=>error.code==='NO_SELECTION');
  assert.throws(()=>clipFrom({text:'가'.repeat(8001)}),error=>error.code==='TOO_LONG');
  const clip=clipFrom({text:'선택한 댓글입니다.',url:'https://example.test/'}),state=addClip(emptyWorkspace(),clip);
  assert.equal(addClip(state,clip).clips.length,1);
  assert.throws(()=>addClip({...state,clips:Array(10).fill(clip)},clipFrom({text:'다른 댓글'})),error=>error.code==='TOO_MANY');
});
