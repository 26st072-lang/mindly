import { ApiError, verifyFirebaseUser, assertAdmin, readJSON, text, identifier, anonymousAlias } from './security.js';
import { callAI, moderate, providerInfo } from './ai.js';

const PAGE_SIZE = 20;
const selectors = `d.*, (SELECT COUNT(*) FROM hearts h WHERE h.debate_id=d.id) AS heart_count,
  (SELECT COUNT(*) FROM opinions o WHERE o.debate_id=d.id) AS comment_count,
  (SELECT COUNT(*) FROM votes v WHERE v.debate_id=d.id AND v.stance='agree') AS agree_count,
  (SELECT COUNT(*) FROM votes v WHERE v.debate_id=d.id AND v.stance='disagree') AS disagree_count,
  EXISTS(SELECT 1 FROM hearts h WHERE h.debate_id=d.id AND h.user_id=?) AS hearted,
  (SELECT stance FROM votes v WHERE v.debate_id=d.id AND v.user_id=?) AS my_stance`;
function dto(row, user) {
  return { id: row.id, title: row.title, summary: row.summary, issues: JSON.parse(row.issues), agreeLabel: row.agree_label, disagreeLabel: row.disagree_label,
    createdAt: row.created_at, heartCount: row.heart_count, commentCount: row.comment_count, agreeCount: row.agree_count, disagreeCount: row.disagree_count,
    hearted: Boolean(row.hearted), myStance: row.my_stance || null, isMine: Boolean(user && row.user_id === user.uid) };
}
function opinionDTO(row, user) {
  return { id: row.id, debateId: row.debate_id, alias: row.alias, stance: row.stance, content: row.content, createdAt: row.created_at, isMine: Boolean(user && row.user_id === user.uid), title: row.title };
}
async function getDebate(env, id, user) {
  const record = await env.DB.prepare(`SELECT ${selectors} FROM debates d WHERE d.id=?`).bind(user?.uid || '', user?.uid || '', id).first();
  if (!record) throw new ApiError(404, 'NOT_FOUND', '토론 글을 찾을 수 없어요.');
  return dto(record, user);
}
async function modeFor(env) { return (await env.DB.prepare('SELECT mode FROM settings WHERE id=1').first())?.mode || 'free'; }
async function consumeQuota(env, key, max, expiresAt, failure={code:'RATE_LIMIT',message:'요청이 많아요. 잠시 후 다시 시도해주세요.'}) {
  const result = await env.DB.prepare('INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(key, expiresAt, max).first();
  if (!result) throw new ApiError(429, failure.code, failure.message, {retryAt:new Date(expiresAt).toISOString()});
}
async function reserveAI(env, user, action, mode, now) {
  const info = providerInfo(env, mode);
  if (!info.ready) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 연결이 아직 준비되지 않았어요. 관리자에게 문의해주세요.');
  const day = Math.floor(now / 86_400_000), expires = (day + 1) * 86_400_000;
  const userKey=`day:${day}:${action}:${user.uid}`;
  await consumeQuota(env, userKey, action === 'image' ? 5 : 40, expires,{code:action==='image'?'IMAGE_DAILY_LIMIT':'TEXT_DAILY_LIMIT',message:action==='image'?'오늘의 사진 분석 한도인 5회를 사용했어요. 한국시간 오전 9시에 다시 이용할 수 있어요.':'오늘의 글·의견 검사 한도인 40회를 사용했어요. 한국시간 오전 9시에 다시 이용할 수 있어요.'});
  let released=false;
  const refund=async()=>{if(released)return;await env.DB.prepare('UPDATE quotas SET count=MAX(count-1,0) WHERE key=?').bind(userKey).run();released=true;};
  const globalLimit = Math.max(1, Math.min(2000, Number(env.AI_DAILY_LIMIT) || 200));
  try{await consumeQuota(env, `global:${day}:${mode}`, globalLimit, expires,{code:'SITE_AI_DAILY_LIMIT',message:'오늘의 사이트 전체 AI 이용 한도에 도달했어요. 한국시간 오전 9시에 다시 이용할 수 있어요.'});}
  catch(error){await refund();throw error;}
  return refund;
}
async function runMeteredAI(env,user,action,mode,now,operation){
  const refund=await reserveAI(env,user,action,mode,now);
  try{return await operation();}
  catch(error){
    // A completed moderation rejection is a real review. Provider/network/JSON
    // failures are retryable and must not exhaust a member's daily allowance.
    if(error.code!=='REVISE')await refund();
    throw error;
  }
}
function parseImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 3) throw new ApiError(400, 'INVALID_IMAGES', '댓글 사진을 1~3장 첨부해주세요.');
  let total = 0;
  const clean = images.map(image => {
    if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length % 4 !== 0) throw new ApiError(400, 'INVALID_IMAGES', 'JPG, PNG, WebP 사진만 첨부할 수 있어요.');
    const size = image.data.length * 3 / 4; total += size;
    if (size > 716_800) throw new ApiError(413, 'TOO_LARGE', '사진의 크기를 줄여 다시 첨부해주세요.');
    const head = atob(image.data.slice(0, 24));
    const valid = image.mimeType === 'image/jpeg' ? head.startsWith('\xff\xd8\xff') : image.mimeType === 'image/png' ? head.startsWith('\x89PNG\r\n\x1a\n') : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
    if (!valid) throw new ApiError(400, 'INVALID_IMAGES', '사진 파일을 확인해주세요.');
    return { mimeType: image.mimeType, data: image.data };
  });
  if (total > 1_600_000) throw new ApiError(413, 'TOO_LARGE', '사진의 전체 크기를 줄여주세요.');
  return clean;
}
function draftFrom(body) {
  if (!Array.isArray(body.issues) || body.issues.length < 2 || body.issues.length > 5) throw new ApiError(400, 'INVALID_INPUT', '쟁점을 2~5개 입력해주세요.');
  return { title: text(body.title, '제목', 5, 100), summary: text(body.summary, '배경 설명', 20, 1500), issues: body.issues.map(v => text(v, '쟁점', 5, 200)), agreeLabel: text(body.agreeLabel, '찬성 입장', 2, 80), disagreeLabel: text(body.disagreeLabel, '반대 입장', 2, 80) };
}
export function createApp({ verifyUser = verifyFirebaseUser, ai = callAI, now = () => Date.now() } = {}) {
  return {
    async fetch(request, env, context) {
      const origin = request.headers.get('Origin');
      const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
      const cors = origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
      const respond = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      try {
        if (origin && !allowed.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED', '허용되지 않은 사이트의 요청이에요.');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' } });
        const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
        if (path === '/healthz' && request.method === 'GET') return respond({ ok: true, service: 'mindly-debate', database: Boolean(env.DB), placement: request.headers.get('cf-placement') || request.cf?.colo || null });
        if (!env.DB) throw new ApiError(503, 'SETUP_REQUIRED', '토론 서버 설정을 마무리하고 있어요.');
        if (env.REQUEST_LIMITER) {
          const limit = await env.REQUEST_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
          if (!limit.success) throw new ApiError(429, 'RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해주세요.');
        }
        const write = !['GET', 'HEAD'].includes(request.method);
        if (write && !origin) throw new ApiError(403, 'ORIGIN_REQUIRED', '마인들리 웹사이트에서 이용해주세요.');
        let user = null;
        if (write || path.startsWith('/v1/me') || path.startsWith('/v1/admin') || request.headers.has('Authorization')) user = await verifyUser(request, env);
        const stamp = now();
        if (write) await consumeQuota(env, `minute:${Math.floor(stamp / 60000)}:${user.uid}`, 20, stamp + 120_000);
        const mode = await modeFor(env);
        if (path === '/v1/config' && request.method === 'GET') return respond(providerInfo(env, mode));
        if (path === '/v1/admin/settings') {
          assertAdmin(user, env);
          if (request.method === 'GET') return respond({ ...providerInfo(env, mode), available: { free: Boolean(env.GEMINI_API_KEY), paid: Boolean(env.OPENROUTER_API_KEY) }, models: { free: providerInfo(env,'free').model, paid: providerInfo(env,'paid').model } });
          if (request.method === 'PATCH') {
            const body = await readJSON(request);
            if (!['free', 'paid'].includes(body.mode)) throw new ApiError(400, 'INVALID_MODE', '무료 또는 유료 모드를 선택해주세요.');
            if (!providerInfo(env, body.mode).ready) throw new ApiError(409, 'AI_NOT_CONFIGURED', '선택한 AI의 API 키를 먼저 Worker에 등록해주세요.');
            await env.DB.prepare('UPDATE settings SET mode=?,updated_at=? WHERE id=1').bind(body.mode, stamp).run();
            return respond(providerInfo(env, body.mode));
          }
        }
        if(path==='/v1/admin/check-ai'&&request.method==='POST'){
          assertAdmin(user,env);
          await runMeteredAI(env,user,'text',mode,stamp,()=>ai(env,mode,'moderate',{content:'의견이 달라도 서로 존중하며 이유를 나누고 싶어요.',context:'AI 연결 점검'}));
          return respond({ok:true,...providerInfo(env,mode)});
        }
        if (path === '/v1/analyze' && request.method === 'POST') {
          const body = await readJSON(request, 2_300_000);
          if (body.consent !== true) throw new ApiError(400, 'CONSENT_REQUIRED', '개인정보를 가린 사진의 AI 전송에 동의해주세요.');
          const images = parseImages(body.images);
          const analysis=await runMeteredAI(env,user,'image',mode,stamp,async()=>{
            const result=await ai(env,mode,'analyze',{images});
            if(!result.readable)throw new ApiError(422,'UNREADABLE','댓글과 서로 다른 주장이 잘 보이는 사진으로 다시 첨부해주세요.');
            return result;
          });
          const id = crypto.randomUUID();
          // No screenshots, original OCR, names, or provider responses are persisted.
          await env.DB.prepare('INSERT INTO analyses(id,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(id, user.uid, stamp, stamp + 86_400_000).run();
          context?.waitUntil?.(env.DB.batch([env.DB.prepare('DELETE FROM quotas WHERE expires_at<?').bind(stamp), env.DB.prepare('DELETE FROM analyses WHERE expires_at<? AND id NOT IN (SELECT analysis_id FROM debates)').bind(stamp)]));
          return respond({ analysisId: id, ...analysis, ...providerInfo(env, mode) });
        }
        if (path === '/v1/debates' && request.method === 'POST') {
          const body = await readJSON(request); const id = identifier(body.id), analysisId = identifier(body.analysisId), draft = draftFrom(body);
          const previous = await env.DB.prepare('SELECT user_id FROM debates WHERE id=?').bind(id).first();
          if (previous) { if (previous.user_id !== user.uid) throw new ApiError(409, 'CONFLICT', '요청을 다시 시도해주세요.'); return respond({ debate: await getDebate(env, id, user) }); }
          const analysis = await env.DB.prepare('SELECT id FROM analyses WHERE id=? AND user_id=? AND expires_at>?').bind(analysisId, user.uid, stamp).first();
          if (!analysis) throw new ApiError(400, 'ANALYSIS_EXPIRED', '사진 분석을 다시 진행해주세요.');
          await runMeteredAI(env,user,'text',mode,stamp,()=>moderate(env, mode, [draft.title, draft.summary, ...draft.issues, draft.agreeLabel, draft.disagreeLabel].join('\n'), '새 토론 글', ai));
          try { await env.DB.prepare('INSERT INTO debates(id,analysis_id,user_id,title,summary,issues,agree_label,disagree_label,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, analysisId, user.uid, draft.title, draft.summary, JSON.stringify(draft.issues), draft.agreeLabel, draft.disagreeLabel, stamp).run(); }
          catch (error) { if (String(error.message).includes('UNIQUE')) throw new ApiError(409, 'ALREADY_PUBLISHED', '이미 게시한 분석 결과예요.'); throw error; }
          return respond({ debate: await getDebate(env, id, user) }, 201);
        }
        const offset = Math.min(100_000, Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0));
        if (path === '/v1/debates' && request.method === 'GET') {
          const rows = (await env.DB.prepare(`SELECT ${selectors} FROM debates d ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`).bind(user?.uid || '', user?.uid || '', PAGE_SIZE + 1, offset).all()).results;
          return respond({ items: rows.slice(0, PAGE_SIZE).map(r => dto(r, user)), hasMore: rows.length > PAGE_SIZE });
        }
        if (path === '/v1/me' && request.method === 'GET') {
          const tab = url.searchParams.get('tab') || 'posts';
          if (!['posts', 'hearts', 'comments'].includes(tab)) throw new ApiError(400, 'INVALID_TAB', '보관함 탭을 확인해주세요.');
          if (tab === 'comments') {
            const rows = (await env.DB.prepare('SELECT o.*,d.title FROM opinions o JOIN debates d ON d.id=o.debate_id WHERE o.user_id=? ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?').bind(user.uid, PAGE_SIZE + 1, offset).all()).results;
            return respond({ items: rows.slice(0, PAGE_SIZE).map(r => opinionDTO(r, user)), hasMore: rows.length > PAGE_SIZE });
          }
          const condition = tab === 'posts' ? 'd.user_id=?' : 'EXISTS(SELECT 1 FROM hearts h WHERE h.debate_id=d.id AND h.user_id=?)';
          const rows = (await env.DB.prepare(`SELECT ${selectors} FROM debates d WHERE ${condition} ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`).bind(user.uid, user.uid, user.uid, PAGE_SIZE + 1, offset).all()).results;
          return respond({ items: rows.slice(0, PAGE_SIZE).map(r => dto(r, user)), hasMore: rows.length > PAGE_SIZE });
        }
        const match = path.match(/^\/v1\/debates\/([a-f0-9-]+)(?:\/(heart|opinions))?$/i);
        if (match) {
          const id = identifier(match[1]), action = match[2];
          if (!action && request.method === 'GET') {
            const debate = await getDebate(env, id, user);
            const rows = (await env.DB.prepare('SELECT * FROM opinions WHERE debate_id=? ORDER BY created_at ASC,id ASC LIMIT ? OFFSET ?').bind(id, PAGE_SIZE + 1, offset).all()).results;
            return respond({ debate, opinions: rows.slice(0, PAGE_SIZE).map(r => opinionDTO(r, user)), hasMore: rows.length > PAGE_SIZE });
          }
          if (!action && request.method === 'DELETE') {
            const record = await env.DB.prepare('SELECT user_id FROM debates WHERE id=?').bind(id).first();
            if (!record) throw new ApiError(404, 'NOT_FOUND', '이미 삭제된 토론이에요.');
            if (record.user_id !== user.uid) assertAdmin(user, env);
            await env.DB.prepare('DELETE FROM debates WHERE id=?').bind(id).run(); return respond({ deleted: true });
          }
          if (action === 'heart' && request.method === 'PUT') {
            const body = await readJSON(request);
            if (typeof body.hearted !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', '공감 상태를 확인해주세요.');
            await getDebate(env, id, user);
            if (body.hearted) await env.DB.prepare('INSERT OR IGNORE INTO hearts(debate_id,user_id,created_at) VALUES(?,?,?)').bind(id, user.uid, stamp).run();
            else await env.DB.prepare('DELETE FROM hearts WHERE debate_id=? AND user_id=?').bind(id, user.uid).run();
            return respond({ debate: await getDebate(env, id, user) });
          }
          if (action === 'opinions' && request.method === 'POST') {
            const body = await readJSON(request), requestId = identifier(body.requestId), content = text(body.content, '의견', 5, 500);
            if (!['agree', 'disagree'].includes(body.stance)) throw new ApiError(400, 'STANCE_REQUIRED', '찬성 또는 반대를 선택해주세요.');
            const debate = await getDebate(env, id, user);
            const previous = await env.DB.prepare('SELECT * FROM opinions WHERE id=?').bind(requestId).first();
            if (previous) {
              if (previous.user_id !== user.uid || previous.debate_id !== id || previous.content !== content || previous.stance !== body.stance) throw new ApiError(409, 'CONFLICT', '요청을 다시 시도해주세요.');
              return respond({ debate, opinion: opinionDTO(previous, user) });
            }
            const alias = await anonymousAlias(user.uid, id, env.ANON_SECRET);
            await runMeteredAI(env,user,'text',mode,stamp,()=>moderate(env, mode, content, `${debate.title}\n선택한 입장: ${body.stance === 'agree' ? debate.agreeLabel : debate.disagreeLabel}`, ai));
            await env.DB.batch([
              env.DB.prepare('INSERT INTO opinions(id,debate_id,user_id,alias,stance,content,created_at) VALUES(?,?,?,?,?,?,?)').bind(requestId, id, user.uid, alias, body.stance, content, stamp),
              env.DB.prepare('INSERT INTO votes(debate_id,user_id,stance,updated_at) VALUES(?,?,?,?) ON CONFLICT(debate_id,user_id) DO UPDATE SET stance=excluded.stance,updated_at=excluded.updated_at').bind(id, user.uid, body.stance, stamp),
            ]);
            return respond({ debate: await getDebate(env, id, user), opinion: { id: requestId, debateId: id, alias, stance: body.stance, content, createdAt: stamp, isMine: true } }, 201);
          }
        }
        throw new ApiError(404, 'NOT_FOUND', '요청한 기능을 찾을 수 없어요.');
      } catch (error) {
        if (error instanceof ApiError) return respond({ code: error.code, message: error.message, ...error.extra }, error.status);
        console.error('Mindly worker request failed');
        return respond({ code: 'SERVER_ERROR', message: '요청을 완료하지 못했어요. 작성한 내용은 유지되니 다시 시도해주세요.' }, 500);
      }
    },
  };
}
export default createApp();
