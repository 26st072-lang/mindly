import {spawn} from 'node:child_process';
import {existsSync,copyFileSync} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const workerRoot=path.join(root,'worker');
const wrangler=path.join(workerRoot,'node_modules','wrangler','bin','wrangler.js');
const children=new Set();let stopping=false;
const env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(workerRoot,'.wrangler','logs','local-test.log')};

function checkPort(port){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',()=>reject(new Error(`${port}번 포트가 사용 중이에요. 다른 로컬 테스트 창을 닫고 다시 실행해주세요.`)));
    server.listen(port,'127.0.0.1',()=>server.close(resolve));
  });
}
function start(args,cwd=workerRoot){
  const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});
  children.add(child);child.once('exit',()=>children.delete(child));return child;
}
function finished(child){
  return new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`로컬 서버 준비가 중단됐어요. (종료 코드: ${code})`)));});
}
function stop(code=0){
  if(stopping)return;stopping=true;
  for(const child of children){
    // Stop only the processes launched by this runner, including Wrangler's children.
    if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    else child.kill('SIGTERM');
  }
  setTimeout(()=>process.exit(code),400);
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
async function waitForWorker(child){
  const deadline=Date.now()+30_000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error('로컬 AI 서버가 종료됐어요. 위의 오류 메시지를 확인해주세요.');
    try{const response=await fetch('http://127.0.0.1:8787/healthz',{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.json()).service==='mindly-debate')return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw new Error('로컬 AI 서버 준비가 지연되고 있어요. 위의 오류 메시지를 확인해주세요.');
}
try{
  if(!existsSync(wrangler))throw new Error('worker 폴더의 개발 도구가 없어요. 프로젝트와 worker 폴더에서 각각 npm install을 먼저 실행해주세요.');
  await Promise.all([checkPort(4173),checkPort(8787)]);
  const localKeys=path.join(workerRoot,'.dev.vars');
  if(!existsSync(localKeys))copyFileSync(path.join(workerRoot,'.dev.vars.example'),localKeys);
  console.log('\n마인들리 로컬 테스트를 준비합니다. 운영 배포 명령은 실행하지 않습니다.');
  // Both migration and runtime explicitly disable remote database access.
  await finished(start([wrangler,'d1','migrations','apply','mindly-debate','--local']));
  // The bundled local workerd supports this date; keep the production config unchanged.
  const api=start([wrangler,'dev','--local','--compatibility-date','2026-10-30','--ip','127.0.0.1','--port','8787','--show-interactive-dev-session=false','--log-level','warn']);
  await waitForWorker(api);
  const web=start(['scripts/serve.mjs','--local-worker'],root);
  for(const child of [api,web]){child.once('error',error=>{console.error(error.message);stop(1);});child.once('exit',()=>{if(!stopping)stop(1);});}
  console.log('\n웹사이트: http://127.0.0.1:4173');
  console.log('확장 프로그램 → 연결과 설정 → 로컬 테스트 · 127.0.0.1 을 선택하세요.');
  console.log('실제 AI 응답: worker/.dev.vars의 GEMINI_API_KEY를 설정한 뒤 다시 실행하세요.');
  console.log('키 없이도 댓글 수집과 마인들리로 가져오기는 확인할 수 있어요.');
  console.log('이 창을 열어 두세요. 종료하려면 Ctrl+C를 누르세요.\n');
}catch(error){console.error('\n'+error.message);stop(1);}
