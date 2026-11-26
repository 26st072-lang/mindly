import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {concernCases} from '../../tests/concern-cases.mjs';
import {buildConcernFilter} from '../../scripts/build-concern-filter.mjs';
const filter=createRequire(import.meta.url)('../../concern-filter.js');
test('client and server concern policies are generated from the same source',()=>buildConcernFilter(true));
for(const [kind,values] of Object.entries(concernCases)){
  for(const content of values)test(`concern ${kind}: ${content}`,()=>assert.equal(filter.hasAbuse(content),kind==='blocked'));
}
test('decomposed Hangul and initial consonants receive the same decision',()=>{
  for(const content of ['병신','븅신','빙신','너 못생김','미친년','ㅂㅅ']){
    assert.equal(filter.hasAbuse(content.normalize('NFD')),true,content+' NFD');
    assert.equal(filter.hasAbuse(content.normalize('NFKC')),true,content+' NFKC');
  }
  for(const content of ['병신','병신','너ㅂᄉ','ﾲﾵ'])assert.equal(filter.hasAbuse(content),true,content);
});
