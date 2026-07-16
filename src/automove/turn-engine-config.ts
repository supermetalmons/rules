import { Color } from "../engine/domain.js";
import type { MonsGame } from "../engine/game.js";
import { TurnEngineMode, type TurnEngineConfig } from "./turn-engine.js";

export function currentProIsEarlyWhiteTurnStart(game: MonsGame): boolean {
  return (
    game.activeColor === Color.White &&
    game.turnNumber <= 3 &&
    !game.playerCanUseAction() &&
    !game.playerCanMoveMana() &&
    (game.monsMovesCount === 0 || game.monsMovesCount === 3)
  );
}

export function applyEarlyWhiteTurnEngineLimits(
  config: TurnEngineConfig,
): TurnEngineConfig {
  return {
    ...config,
    ownSeedCap: Math.min(config.ownSeedCap, 14),
    ownBeam: Math.min(config.ownBeam, 5),
    perNodeFamilyCap: Math.min(config.perNodeFamilyCap, 4),
    stepCap: Math.min(config.stepCap, 6),
    opponentSeedCap: 1,
    opponentBeam: 1,
    replySeedCap: 1,
    replyBeam: 1,
    expansionCap: Math.min(config.expansionCap, 48),
  };
}

export function applyTurnEngineRerankLimits(
  config: TurnEngineConfig,
): TurnEngineConfig {
  const currentPro = config.mode === TurnEngineMode.CurrentPro;
  return {
    ...config,
    ownSeedCap: Math.min(config.ownSeedCap, currentPro ? 12 : 8),
    ownBeam: Math.min(config.ownBeam, currentPro ? 5 : 4),
    perNodeFamilyCap: Math.min(config.perNodeFamilyCap, currentPro ? 4 : 3),
    stepCap: Math.min(config.stepCap, 5),
    opponentSeedCap: Math.min(config.opponentSeedCap, currentPro ? 6 : 4),
    opponentBeam: Math.min(config.opponentBeam, currentPro ? 3 : 2),
    replySeedCap: Math.min(config.replySeedCap, currentPro ? 3 : 2),
    replyBeam: currentPro ? 2 : 1,
    expansionCap: Math.min(config.expansionCap, currentPro ? 144 : 96),
  };
}
