import assert from 'node:assert/strict';
import {makeRatingRefresh} from '../src/rating-refresh';

void (async()=>{
 let publishes=0,accept=false;
 const snapshot={count:2,ids:['a','b'],games:[{first:'a',second:'b',winner:'a',count:1},{first:'b',second:'a',winner:'b',count:1}]};
 const refresh=makeRatingRefresh({async ratingSnapshot(){return snapshot;},async publishRatings(count,results){assert.equal(count,2);assert.equal(results.length,2);publishes++;return accept;}});
 await refresh();accept=true;await refresh();await refresh();assert.equal(publishes,2);
})().catch(error=>{console.error(error);process.exitCode=1;});
