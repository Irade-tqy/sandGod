import {Choice} from './ladder-match';
import {SoloGame} from './solo-game';

const RULES='启灵沙盘：双方先选择起始行位置与上右下左移动概率，各方向至少1%，总和100%。每回合放一堵三段墙或拆除自己的墙，然后按可走方向的权重随机移动；墙无需保持连通。己方墙不能完全重合，对手墙的任何墙边不能重合。拆墙产生无归属的残骸；新墙压在残骸上的各段不阻挡通行。移动时优先选择反方向紧邻己方残骸墙的可走方向，按权重抽取；没有此类方向时从其他可走方向抽取。每10完整回合缩去左右各一列并清除旧残骸，被缩圈移除的墙在棋盘内形成新残骸；40回合后只剩单列。先到对岸获胜。';

export function strategyRequest(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]){
  return {phase,rules:RULES,state,legalActions};
}

export function strategyChoice(data:unknown):Choice {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('选手返回了无效行动');
  return data as Choice;
}
