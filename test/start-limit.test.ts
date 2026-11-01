import assert from 'node:assert/strict';
import {startLimiter} from '../src/start-limit';

const reserve=startLimiter(),first=reserve('a'),second=reserve('a');
assert.ok(first&&second);assert.equal(reserve('a'),null);
const others=['b','b','c','c','d','d'].map(key=>reserve(key));
assert.ok(others.every(Boolean));assert.equal(reserve('e'),null);
first();first();assert.ok(reserve('e'));second();
others.forEach(release=>release?.());
assert.ok(reserve('a'));
