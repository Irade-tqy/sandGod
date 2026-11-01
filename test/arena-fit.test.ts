import assert from 'node:assert/strict';
import {fitArena,FitMatch} from '../src/arena-fit';

const games:FitMatch[]=Array.from({length:20},(_,i)=>({first:'a',second:'b',winner:i<15?'a':'b'}));
const first=fitArena(['a','b'],games),reversed=fitArena(['a','b'],[...games].reverse());
assert.ok(first[0].rating>first[1].rating);
assert.ok(Math.abs((first[0].rating-first[1].rating)-400*Math.log10(3))<0.01);
assert.ok(first.every((row,i)=>Math.abs(row.rating-reversed[i].rating)<1e-8));
const aggregated=fitArena(['a','b'],[{first:'a',second:'b',winner:'a',count:15},{first:'a',second:'b',winner:'b',count:5}]);
assert.ok(first.every((row,i)=>Math.abs(row.rating-aggregated[i].rating)<1e-6&&Math.abs(row.lower!-aggregated[i].lower!)<1e-6));
assert.ok(first[0].lower!==null&&first[0].upper!==null&&first[0].lower<first[0].rating&&first[0].upper>first[0].rating);
assert.equal(fitArena(['a','b','c'],games)[2].lower,null);
assert.equal(fitArena(['a','b'],games.map(g=>({...g,winner:'a'})))[0].lower,null);
assert.equal(fitArena(['a','b'],[{first:'a',second:'b',winner:null,count:20}])[0].lower,null);
assert.equal(fitArena(['a','b','c','d'],[...games,{first:'c',second:'d',winner:'c'}])[0].lower,null);
assert.throws(()=>fitArena(['a','b'],[{first:'a',second:'b',winner:'c'}]));
const sixty=fitArena(['a','b'],[{first:'a',second:'b',winner:'a',count:45},{first:'a',second:'b',winner:'b',count:15}]);
const doubled=fitArena(['a','b'],[{first:'a',second:'b',winner:'a',count:90},{first:'a',second:'b',winner:'b',count:30}]);
assert.ok(Math.abs(sixty[0].rating-doubled[0].rating)<1e-6);
