import assert from 'node:assert/strict';
import {rateMatch} from '../src/ladder-rating';

const result = {first:'a', second:'b', winner:'a', completed:true};
assert.deepEqual(rateMatch(1500, 1500, result), [1516, 1484]);
assert.deepEqual(rateMatch(1500, 1500, {...result, winner:null}), [1500, 1500]);
assert.throws(() => rateMatch(1500, 1500, {...result, completed:false}));
assert.throws(() => rateMatch(1500, 1500, {...result, second:'a'}));
assert.throws(() => rateMatch(1500, 1500, {...result, winner:'other'}));
