import assert from 'node:assert/strict';
import {MAX_SUBMISSION_BYTES,validateSourceSubmission} from '../src/ladder-submission';

const source=new TextEncoder().encode('int main() { return 0; }');
assert.equal(validateSourceSubmission('player.c',source),'c');
assert.equal(validateSourceSubmission('player.cpp',source),'cpp');
assert.throws(()=>validateSourceSubmission('../player.c',source));
assert.throws(()=>validateSourceSubmission('player.py',source));
assert.throws(()=>validateSourceSubmission('player.c',new Uint8Array()));
assert.throws(()=>validateSourceSubmission('player.c',new Uint8Array(MAX_SUBMISSION_BYTES+1)));
assert.throws(()=>validateSourceSubmission('player.c',new Uint8Array([0])));
