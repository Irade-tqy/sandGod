import {Player} from './game';
import {SoloGame} from './solo-game';

export type Choice = {weights?:number[]; col?:number; action?:number};
export type LadderPlayer = {
  choose(phase:'weights'|'start'|'action', state:ReturnType<SoloGame['snapshot']>, legalActions:number[]):Promise<Choice>;
  chooseWithGame?(phase:'weights'|'start'|'action', game:SoloGame, player:Player, legalActions:number[]):Promise<Choice>;
};

export function chooseLadderPlayer(player:LadderPlayer,phase:'weights'|'start'|'action',game:SoloGame,seat:Player,legalActions:number[]):Promise<Choice>{
  return player.chooseWithGame?player.chooseWithGame(phase,game,seat,legalActions):player.choose(phase,game.snapshot(seat),legalActions);
}

// Failed or unfinished matches return no result and must never change Elo.
export async function playLadderMatch(players:[LadderPlayer,LadderPlayer], random:()=>number = Math.random):Promise<{winner:Player; actions:number}> {
  const game = new SoloGame(0, random);
  const deadline=Date.now()+15*60*1000;
  const checkTime=()=>{if(Date.now()>=deadline)throw Error('对局超时，未计入 Elo');};
  for (const player of [0,1] as Player[]) {
    checkTime();
    const choice = await chooseLadderPlayer(players[player],'weights',game,player,[]);
    checkTime();
    game.setMovementWeights(player, choice?.weights ?? []);
  }
  for (const player of [0,1] as Player[]) {
    checkTime();
    const choice = await chooseLadderPlayer(players[player],'start',game,player,[]);
    checkTime();
    game.choose(player, choice?.col as number);
  }
  for (let actions=1; actions<=2000; actions++) {
    checkTime();
    const player=game.turn;
    const legal=game.legal(player).map(action=>game.policyAction(action,player));
    const choice=await chooseLadderPlayer(players[player],'action',game,player,legal);
    checkTime();
    if (!Number.isInteger(choice?.action) || !legal.includes(choice.action as number)) throw Error('天梯选手返回了无效行动');
    game.act(player,game.policyAction(choice.action as number,player),true);
    if (game.winner!==null) return {winner:game.winner,actions};
  }
  throw Error('对局超过行动上限，未计入 Elo');
}
