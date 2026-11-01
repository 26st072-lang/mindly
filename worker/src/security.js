import { createRemoteJWKSet, jwtVerify } from 'jose';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message); Object.assign(this, { status, code, extra });
  }
}
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyFirebaseUser(request, env, keys = googleKeys) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/);
  if (!bearer) throw new ApiError(401, 'LOGIN_REQUIRED', '로그인 후 이용해주세요.');
  try {
    const { payload } = await jwtVerify(bearer[1], keys, {
      algorithms: ['RS256'], audience: env.FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`, clockTolerance: 5,
      requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
    });
    const clock=Date.now()/1000;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 || payload.iat > clock + 5 || typeof payload.auth_time !== 'number' || payload.auth_time < 0 || payload.auth_time > clock + 5 || payload.firebase?.sign_in_provider === 'anonymous') throw new Error('Invalid user');
    return { uid: payload.sub, email: payload.email || '' };
  } catch { throw new ApiError(401, 'INVALID_SESSION', '로그인이 만료되었어요. 다시 로그인해주세요.'); }
}
export function assertAdmin(user, env) {
  const ids = String(env.ADMIN_UIDS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!ids.includes(user.uid)) throw new ApiError(403, 'ADMIN_REQUIRED', '관리자만 변경할 수 있어요.');
}
export async function readJSON(request, maxBytes = 32_768) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', '요청 형식을 확인해주세요.');
  if (Number(request.headers.get('Content-Length')) > maxBytes) throw new ApiError(413, 'TOO_LARGE', '첨부한 사진이나 내용의 크기를 줄여주세요.');
  const reader = request.body?.getReader(); let size = 0; const chunks = [];
  if (!reader) throw new ApiError(400, 'INVALID_JSON', '입력 내용을 확인해주세요.');
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'TOO_LARGE', '첨부한 사진이나 내용의 크기를 줄여주세요.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const result = JSON.parse(new TextDecoder().decode(bytes)); if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error(); return result; }
  catch { throw new ApiError(400, 'INVALID_JSON', '입력 내용을 확인해주세요.'); }
}
export function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${label}은(는) ${min}~${max}자로 입력해주세요.`);
  return value.trim();
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new ApiError(400, 'INVALID_ID', '요청을 다시 시도해주세요.');
  return value;
}
export function localFeedback(content) {
  const normalized = content.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  if (/(시[발빨]|씨[발빨]|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새끼|미친놈|미친년|죽어버려|닥쳐|좆|존나|fuck|bitch|멍청한새끼|지랄)/iu.test(normalized)) {
    return { allowed: false, reason: '상대에게 상처를 줄 수 있는 비속어가 포함되어 있어요.', suggestion: '그 의견에는 동의하기 어려워요. 제가 그렇게 생각하는 이유는 … 입니다.', flags: ['비속어'] };
  }
  return null;
}
export async function anonymousAlias(userId, debateId, secret) {
  if (!secret || secret.length < 24) throw new ApiError(503, 'SETUP_REQUIRED', '토론 서버 설정을 마무리하고 있어요. 잠시 후 다시 이용해주세요.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${debateId}:${userId}`));
  return '익명 ' + [...new Uint8Array(signature).slice(0, 4)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
