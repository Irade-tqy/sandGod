import {LadderPlayer} from './ladder-match';

export const referencePlayer:LadderPlayer={async choose(phase,_state,legal){
  if(phase==='weights')return {weights:[25,25,25,25]};
  if(phase==='start')return {col:4};
  if(!legal.length)throw Error('没有合法行动');
  return {action:legal[0]};
}};
