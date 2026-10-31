import {Choice} from './ladder-match';
import {SoloGame} from './solo-game';

const RULES='启灵沙盘：各方先选择起始行位置及上右下左的移动概率，各概率为至少1%的整数且总和100%。墙的数量不限，每回合放一堵墙或拆除一堵自己的墙，然后按可走方向概率归一化随机走一步；任何一方单独放的墙都必须保持棋盘连通，双方的墙合起来可以切断棋盘。后手可在一回合选择一次自主走一步。每20完整回合缩去左右各一列、将该列棋子移入内侧并删除不再容纳的墙；单列时不能放墙，继续随机移动。先到对岸获胜。';

export function strategyRequest(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]){
  return {phase,rules:RULES,state,legalActions};
}

export function strategyChoice(data:unknown):Choice {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('选手返回了无效行动');
  return data as Choice;
}
