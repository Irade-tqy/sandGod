import {Choice,LadderPlayer} from './ladder-match';
import {SoloGame} from './solo-game';
import {strategyChoice,strategyRequest} from './strategy-protocol';
import {runWasm} from './wasm-runner';

export class WasmOpponent implements LadderPlayer {
  constructor(private readonly wasm:Uint8Array){}
  async choose(phase:'weights'|'start'|'action',state:ReturnType<SoloGame['snapshot']>,legalActions:number[]):Promise<Choice>{
    return strategyChoice(await runWasm(this.wasm,strategyRequest(phase,state,legalActions)));
  }
}
