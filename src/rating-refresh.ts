import {fitArena} from './arena-fit';
import type {LadderStore} from './ladder-store';

export function makeRatingRefresh(store:Pick<LadderStore,'ratingSnapshot'|'publishRatings'>){
 let published='';
 return async()=>{
  const snapshot=await store.ratingSnapshot();
  const version=JSON.stringify([snapshot.count,snapshot.ids]);
  if(version===published)return;
  const results=fitArena(snapshot.ids,snapshot.games);
  if(await store.publishRatings(snapshot.count,results))published=version;
 };
}
