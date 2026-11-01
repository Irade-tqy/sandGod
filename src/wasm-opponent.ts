import {Choice,LadderPlayer} from './ladder-match';
import {SoloGame} from './solo-game';
import {strategyChoice,strategyRequest} from './strategy-protocol';
import {runWasm} from './wasm-runner';
import {EvaluationInfrastructureError,InvalidStrategyError} from './evaluation-errors';

export class WasmOpponent implements LadderPlayer {
  constructor(private readonly wasm:Uint8Array){}
  async choose(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]):Promise<Choice>{
    let result:unknown;
    try{result=await runWasm(this.wasm,strategyRequest(phase,state,legalActions));}
    catch(error){if(error instanceof InvalidStrategyError)throw error;throw new EvaluationInfrastructureError('策略运行环境不可用');}
    let choice:Choice;try{choice=strategyChoice(result);}catch{throw new InvalidStrategyError('策略返回了无效的 JSON 对象');}
    if(phase==='weights'&&(!Array.isArray(choice.weights)||choice.weights.length!==4||choice.weights.some(n=>!Number.isInteger(n)||n<1)||choice.weights.reduce((a,b)=>a+b,0)!==100))throw new InvalidStrategyError('移动概率无效');
    if(phase==='start'&&(!Number.isInteger(choice.col)||choice.col!<0||choice.col!>8))throw new InvalidStrategyError('起点无效');
    if(phase==='action'&&(!Number.isInteger(choice.action)||!legalActions.includes(choice.action!)))throw new InvalidStrategyError('行动不合法');
    return choice;
  }
}
