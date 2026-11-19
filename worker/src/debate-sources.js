import {ApiError, text} from './security.js';
import {evidenceURL} from './evidence-metadata.js';

// Only published attribution is saved; original clips and images stay private.
export function debateSources(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new ApiError(400, 'INVALID_SOURCES', '출처는 최대 10개까지 표시할 수 있어요.');
  const sources = value.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ApiError(400, 'INVALID_SOURCES', '출처 이름이나 원문 주소를 입력해주세요.');
    const url = source.url === undefined || source.url === '' ? '' : evidenceURL(text(source.url, '출처 주소', 1, 2000)).href;
    const title = source.title === undefined ? '' : text(source.title, '출처 이름', 0, 300);
    if (!title && !url) throw new ApiError(400, 'INVALID_SOURCES', '출처 이름이나 원문 주소를 입력해주세요.');
    return {title: title || new URL(url).hostname, url};
  });
  return sources.filter((source, index) => sources.findIndex(other => source.url ? other.url === source.url : !other.url && other.title === source.title) === index);
}
