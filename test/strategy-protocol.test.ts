import assert from 'node:assert/strict';
import {SoloGame} from '../src/solo-game';
import {strategyChoice,strategyRequest} from '../src/strategy-protocol';

const game=new SoloGame();game.choose(0,4);game.choose(1,3);
const request=strategyRequest('action',game.snapshot(0),[4]);
assert.equal(request.state.opponentPosition,null);
assert.deepEqual(request.legalActions,[4]);
assert.equal(request.phase,'action');
assert.deepEqual(strategyChoice({action:4}),{action:4});
assert.throws(()=>strategyChoice(null));
assert.throws(()=>strategyChoice([]));
