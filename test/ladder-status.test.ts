import assert from 'node:assert/strict';
import {challengeLabel,challengeStatus} from '../src/ladder-status';

assert.equal(challengeStatus('online','unreachable'),'offline');
assert.equal(challengeLabel(challengeStatus('online','unreachable')),'MCP 离线');
assert.equal(challengeStatus('offline','connected'),'online');
assert.equal(challengeStatus('online','not_checked'),'online');
