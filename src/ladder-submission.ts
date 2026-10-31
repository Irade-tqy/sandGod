export const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;
export type SubmissionLanguage = 'c'|'cpp';

export function validateSourceSubmission(filename:string, contents:Uint8Array):SubmissionLanguage {
  if (typeof filename !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}\.(c|cc|cpp|cxx)$/.test(filename) || filename.startsWith('.')) {
    throw Error('请选择 C 或 C++ 源文件');
  }
  if (!(contents instanceof Uint8Array) || contents.byteLength === 0 || contents.byteLength > MAX_SUBMISSION_BYTES) {
    throw Error('源文件不能为空且不能超过 10 MiB');
  }
  if (contents.includes(0)) throw Error('源文件不能包含二进制数据');
  try { new TextDecoder('utf-8',{fatal:true}).decode(contents); }
  catch { throw Error('源文件必须使用 UTF-8 编码'); }
  return filename.endsWith('.c') ? 'c' : 'cpp';
}
