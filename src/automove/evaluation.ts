import { BOARD_CELLS, BOARD_SIZE } from "../engine/board/geometry.js";
import { MONS_MOVES_PER_TURN, TARGET_SCORE } from "../engine/board/config.js";
import {
  CENTER_ROW_DISTANCE,
  CONS_BOMB,
  DEMON_TARGETS,
  KIND_ANGEL,
  KIND_DEMON,
  KIND_DRAINER,
  KIND_MYSTIC,
  KIND_SPIRIT,
  MANA_BLACK,
  MANA_SUPER,
  MANA_WHITE,
  COLOR_COUNT,
  MON_KIND_COUNT,
  MYSTIC_TARGETS,
  OCC_MANA,
  OCC_MON,
  OWN_POOL_DISTANCE,
  POOL_DISTANCE,
  SQ_MON_BASE,
  SQ_SUPERMANA_BASE,
  SUPERMANA_BASE_INDEX,
  cellConsumable,
  cellCooldown,
  cellMana,
  cellOccupancy,
  chebyshev,
  damagingAttackCanComplete,
  i32,
  manaScoreValue,
  midpoint,
  u8,
} from "./board.js";
import { rethrowFastWorkspaceAllocation } from "./allocation.js";
import {
  awakeAngelGuards,
  canUseAction,
  manaMoveAllowed,
  type FastPosition,
} from "./state.js";
import {
  DISTANCE_TABLE_SIZE,
  THREAT_BUCKETS,
  THREAT_BUCKET_EXPOSED,
  THREAT_BUCKET_FEW,
  THREAT_BUCKET_SPARE,
  THREAT_SPARE_MOVES,
  THREAT_WALK_STRIDE,
  RACE_LATE_NEED,
  RACE_MAX_TURNS,
  RACE_SPAN,
  SCORE_SHAPE_STRIDE,
  UNREACHABLE_DISTANCE,
  LEARNED_PRO_RESIDUAL_SCALE,
  type EvalTables,
} from "./evaluation-weights.js";

export const WIN_VALUE = 1_000_000;

const POOL_INDICES = Int32Array.of(
  0,
  BOARD_SIZE - 1,
  BOARD_CELLS - BOARD_SIZE,
  BOARD_CELLS - 1,
);

function hasAdjacentScoringPool(position: FastPosition, index: number): boolean {
  for (let slot = 0; slot < POOL_INDICES.length; slot += 1) {
    const pool = i32(POOL_INDICES, slot);
    if (chebyshev(index, pool) === 1 && manaMoveAllowed(position, pool)) {
      return true;
    }
  }
  return false;
}

function learnedProResidual(position: FastPosition, numerators: Int16Array): number {
  const leadingScore =
    position.whiteScore > position.blackScore
      ? position.whiteScore
      : position.blackScore;
  const phaseBase =
    (leadingScore < TARGET_SCORE ? leadingScore : TARGET_SCORE - 1) * 605;
  const locations = position.monLocations;
  let sum = 0;
  const white0 = locations[0] ?? 0;
  if (white0 >= 0) sum += numerators[phaseBase + white0] ?? 0;
  const black0 = locations[1] ?? 0;
  if (black0 >= 0) sum -= numerators[phaseBase + 120 - black0] ?? 0;
  const kind1 = phaseBase + BOARD_CELLS;
  const white1 = locations[2] ?? 0;
  if (white1 >= 0) sum += numerators[kind1 + white1] ?? 0;
  const black1 = locations[3] ?? 0;
  if (black1 >= 0) sum -= numerators[kind1 + 120 - black1] ?? 0;
  const kind2 = kind1 + BOARD_CELLS;
  const white2 = locations[4] ?? 0;
  if (white2 >= 0) sum += numerators[kind2 + white2] ?? 0;
  const black2 = locations[5] ?? 0;
  if (black2 >= 0) sum -= numerators[kind2 + 120 - black2] ?? 0;
  const kind3 = kind2 + BOARD_CELLS;
  const white3 = locations[6] ?? 0;
  if (white3 >= 0) sum += numerators[kind3 + white3] ?? 0;
  const black3 = locations[7] ?? 0;
  if (black3 >= 0) sum -= numerators[kind3 + 120 - black3] ?? 0;
  const kind4 = kind3 + BOARD_CELLS;
  const white4 = locations[8] ?? 0;
  if (white4 >= 0) sum += numerators[kind4 + white4] ?? 0;
  const black4 = locations[9] ?? 0;
  if (black4 >= 0) sum -= numerators[kind4 + 120 - black4] ?? 0;
  return sum * LEARNED_PRO_RESIDUAL_SCALE;
}

type AttackTables = {
  readonly mysticSteps: Uint8Array;
  readonly demonStarts: Int32Array;
  readonly demonCounts: Int32Array;
  readonly demonOrigins: Int32Array;
  readonly demonBetween: Int32Array;
};

const ATTACK_TABLES = new WeakMap<object, AttackTables>();
// Every evaluation of one search shares a single squares array, so a pointer check answers
// the lookup without touching the weak map on the hot path.
let lastAttackSquares: ArrayLike<number> | undefined;
let lastAttackTables: AttackTables | undefined;

function sameSquareContent(
  previous: ArrayLike<number> | undefined,
  current: ArrayLike<number>,
): boolean {
  if (previous?.length !== current.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    if (u8(previous, index) !== u8(current, index)) return false;
  }
  return true;
}

function buildAttackTables(squares: ArrayLike<number>): AttackTables {
  try {
    const mysticSteps = new Uint8Array(BOARD_CELLS * BOARD_CELLS).fill(
      UNREACHABLE_DISTANCE,
    );
    const demonStarts = new Int32Array(BOARD_CELLS);
    const demonCounts = new Int32Array(BOARD_CELLS);
    const origins: number[] = [];
    const betweens: number[] = [];
    for (let at = 0; at < BOARD_CELLS; at += 1) {
      const mysticStart = i32(MYSTIC_TARGETS.starts, at);
      const mysticCount = i32(MYSTIC_TARGETS.counts, at);
      for (let index = 0; index < BOARD_CELLS; index += 1) {
        let best = UNREACHABLE_DISTANCE;
        for (let offset = 0; offset < mysticCount; offset += 1) {
          const origin = i32(MYSTIC_TARGETS.list, mysticStart + offset);
          if (u8(squares, origin) >= SQ_MON_BASE) continue;
          const steps = chebyshev(index, origin);
          if (steps < best) best = steps;
        }
        mysticSteps[at * BOARD_CELLS + index] = best;
      }
      demonStarts[at] = origins.length;
      const demonStart = i32(DEMON_TARGETS.starts, at);
      const demonCount = i32(DEMON_TARGETS.counts, at);
      for (let offset = 0; offset < demonCount; offset += 1) {
        const origin = i32(DEMON_TARGETS.list, demonStart + offset);
        if (u8(squares, origin) >= SQ_MON_BASE) continue;
        const between = midpoint(at, origin);
        const betweenSquare = u8(squares, between);
        if (betweenSquare === SQ_SUPERMANA_BASE || betweenSquare >= SQ_MON_BASE) {
          continue;
        }
        origins.push(origin);
        betweens.push(between);
      }
      demonCounts[at] = origins.length - i32(demonStarts, at);
    }
    return {
      mysticSteps,
      demonStarts,
      demonCounts,
      demonOrigins: new Int32Array(origins),
      demonBetween: new Int32Array(betweens),
    };
  } catch (error) {
    rethrowFastWorkspaceAllocation(error);
  }
}

// The static part of the attack-origin filter depends only on the variant's squares, so
// it is precomputed once per squares array: mystic origins reduce to a min-distance table
// and demon origins to the (origin, between) pairs whose squares allow the attack.
function attackTablesFor(squares: ArrayLike<number>): AttackTables {
  if (squares === lastAttackSquares && lastAttackTables !== undefined) {
    return lastAttackTables;
  }
  const cached = ATTACK_TABLES.get(squares);
  if (cached !== undefined) {
    lastAttackSquares = squares;
    lastAttackTables = cached;
    return cached;
  }
  // Each selection call arrives with a fresh squares array - `fastSquaresForVariant` slices the
  // canonical table and `FastPosition.reset` copies that slice again - so the identity caches
  // above never hit across calls and the mystic table below was rebuilt every time. The tables
  // are a pure function of the squares content, so one comparison stands in for the rebuild.
  // This requires that a published squares array is never written in place: every writer
  // allocates a fresh array, and an in-place edit would let one array donate stale tables to a
  // different array whose content matches the edited state.
  if (lastAttackTables !== undefined && sameSquareContent(lastAttackSquares, squares)) {
    const reused = lastAttackTables;
    ATTACK_TABLES.set(squares, reused);
    lastAttackSquares = squares;
    return reused;
  }
  const tables = buildAttackTables(squares);
  ATTACK_TABLES.set(squares, tables);
  lastAttackSquares = squares;
  lastAttackTables = tables;
  return tables;
}

function estimatedAttackSteps(
  position: FastPosition,
  at: number,
  ownerColor: number,
  guarded: boolean,
): number {
  const cells = position.cells;
  if (!damagingAttackCanComplete(cells[at] ?? 0)) {
    return UNREACHABLE_DISTANCE;
  }
  const enemy = ownerColor ^ 1;
  const actionAvailable = enemy !== position.active || canUseAction(position);
  let best = UNREACHABLE_DISTANCE;
  const attackTables = attackTablesFor(position.squares);

  for (let kind = 0, id = enemy; kind < MON_KIND_COUNT; kind += 1, id += COLOR_COUNT) {
    const index = position.monLocations[id] ?? -1;
    if (index < 0) continue;
    const cell = cells[index] ?? 0;
    if (cellOccupancy(cell) !== OCC_MON) continue;
    const consumable = cellConsumable(cell);
    if (consumable === CONS_BOMB) {
      const reach = chebyshev(index, at) - 3;
      const steps = reach < 0 ? 0 : reach;
      if (steps === 0) return 0;
      if (steps < best) best = steps;
      continue;
    }
    if ((kind !== KIND_MYSTIC && kind !== KIND_DEMON) || !actionAvailable) continue;
    if (guarded) continue;
    if (cellCooldown(cell) !== 0) continue;
    if (consumable !== 0) continue;
    if (cellMana(cell) !== 0) continue;
    if (kind === KIND_MYSTIC) {
      const steps = attackTables.mysticSteps[at * BOARD_CELLS + index] ?? 0;
      if (steps === 0) return 0;
      if (steps < best) best = steps;
      continue;
    }
    const targetStart = attackTables.demonStarts[at] ?? 0;
    const targetCount = attackTables.demonCounts[at] ?? 0;
    for (let offset = 0; offset < targetCount; offset += 1) {
      const between = attackTables.demonBetween[targetStart + offset] ?? 0;
      if (between !== index && cells[between] !== 0) continue;
      const steps = chebyshev(
        index,
        attackTables.demonOrigins[targetStart + offset] ?? 0,
      );
      if (steps === 0) return 0;
      if (steps < best) best = steps;
    }
  }
  return best;
}

export function evaluateWithTables(
  position: FastPosition,
  tables: EvalTables,
  winsNextTurnThreat = 0,
): number {
  const weights = tables.weights;
  const cells = position.cells;
  const squares = position.squares;
  const monLocations = position.monLocations;
  const manaIndices = position.manaIndices;
  const potions = position.potions;
  let value =
    (position.whiteScore - position.blackScore) * weights.scoreUnit +
    (tables.scoreShape[
      position.whiteScore * SCORE_SHAPE_STRIDE + position.blackScore
    ] ?? 0) +
    ((potions[0] ?? 0) - (potions[1] ?? 0)) * weights.potion;

  const drainerWhite = monLocations[KIND_DRAINER * COLOR_COUNT] ?? 0;
  const drainerBlack = monLocations[KIND_DRAINER * COLOR_COUNT + 1] ?? 0;
  const drainerReadyWhite =
    drainerWhite >= 0 && cellCooldown(cells[drainerWhite] ?? 0) === 0;
  const drainerReadyBlack =
    drainerBlack >= 0 && cellCooldown(cells[drainerBlack] ?? 0) === 0;
  let nearestManaWhite = UNREACHABLE_DISTANCE;
  let nearestManaBlack = UNREACHABLE_DISTANCE;
  let onePointPickupWhite = UNREACHABLE_DISTANCE;
  let onePointPickupBlack = UNREACHABLE_DISTANCE;
  let twoPointPickupWhite = UNREACHABLE_DISTANCE;
  let twoPointPickupBlack = UNREACHABLE_DISTANCE;
  const remaining = MONS_MOVES_PER_TURN - position.monsMoves;
  const windowTracking = winsNextTurnThreat !== 0;
  const needWhite = TARGET_SCORE - position.whiteScore;
  const needBlack = TARGET_SCORE - position.blackScore;
  let manaStepWin = 0;
  let manaStepTurnsWhite = RACE_MAX_TURNS;
  let manaStepTurnsBlack = RACE_MAX_TURNS;
  let tripTurnsWhite = RACE_MAX_TURNS;
  let tripTurnsBlack = RACE_MAX_TURNS;
  let pickupNextWhite = false;
  let pickupNextBlack = false;
  if (windowTracking) {
    if (drainerWhite >= 0) {
      const cell = cells[drainerWhite] ?? 0;
      pickupNextWhite =
        cellCooldown(cell) <= 1 && cellMana(cell) === 0 && cellConsumable(cell) === 0;
    }
    if (drainerBlack >= 0) {
      const cell = cells[drainerBlack] ?? 0;
      pickupNextBlack =
        cellCooldown(cell) <= 1 && cellMana(cell) === 0 && cellConsumable(cell) === 0;
    }
  }
  let pickupBestPointsWhite = 0;
  let pickupBestPointsBlack = 0;
  let pickupBestAdjacentOwnWhite = false;
  let pickupBestAdjacentOwnBlack = false;
  let manaMoveCountWhite = 0;
  let manaMoveCountBlack = 0;
  let carrierNextPointsWhite = 0;
  let carrierNextPointsBlack = 0;

  for (let slot = 0; slot < position.manaCount; slot += 1) {
    const index = manaIndices[slot] ?? 0;
    const cell = cells[index] ?? 0;
    if (cellOccupancy(cell) !== OCC_MANA) continue;
    const mana = cellMana(cell);
    const distanceWhite = drainerReadyWhite
      ? chebyshev(drainerWhite, index)
      : UNREACHABLE_DISTANCE;
    const distanceBlack = drainerReadyBlack
      ? chebyshev(drainerBlack, index)
      : UNREACHABLE_DISTANCE;
    if (distanceWhite < nearestManaWhite) nearestManaWhite = distanceWhite;
    if (distanceBlack < nearestManaBlack) nearestManaBlack = distanceBlack;
    const scoreDistance = POOL_DISTANCE[index] ?? 0;
    if (drainerReadyWhite) {
      const pickupScoreDistance = distanceWhite + scoreDistance;
      if (mana === MANA_WHITE && pickupScoreDistance < onePointPickupWhite) {
        onePointPickupWhite = pickupScoreDistance;
      } else if (mana !== MANA_WHITE && pickupScoreDistance < twoPointPickupWhite) {
        twoPointPickupWhite = pickupScoreDistance;
      }
    }
    if (drainerReadyBlack) {
      const pickupScoreDistance = distanceBlack + scoreDistance;
      if (mana === MANA_BLACK && pickupScoreDistance < onePointPickupBlack) {
        onePointPickupBlack = pickupScoreDistance;
      } else if (mana !== MANA_BLACK && pickupScoreDistance < twoPointPickupBlack) {
        twoPointPickupBlack = pickupScoreDistance;
      }
    }
    if (windowTracking) {
      let manaMoveTarget = false;
      if (
        mana !== MANA_SUPER &&
        scoreDistance <= 1 &&
        hasAdjacentScoringPool(position, index)
      ) {
        manaMoveTarget = true;
        if (mana - 1 === 0) {
          if (manaMoveCountWhite < 2) manaMoveCountWhite += 1;
        } else if (manaMoveCountBlack < 2) {
          manaMoveCountBlack += 1;
        }
      }
      if (pickupNextWhite) {
        const distance = drainerReadyWhite
          ? distanceWhite
          : chebyshev(drainerWhite, index);
        if (distance + scoreDistance <= MONS_MOVES_PER_TURN) {
          const points = manaScoreValue(mana, 0);
          if (points > pickupBestPointsWhite) {
            pickupBestPointsWhite = points;
            pickupBestAdjacentOwnWhite = manaMoveTarget && mana - 1 === 0;
          } else if (
            points === pickupBestPointsWhite &&
            !(manaMoveTarget && mana - 1 === 0)
          ) {
            pickupBestAdjacentOwnWhite = false;
          }
        }
      }
      if (pickupNextBlack) {
        const distance = drainerReadyBlack
          ? distanceBlack
          : chebyshev(drainerBlack, index);
        if (distance + scoreDistance <= MONS_MOVES_PER_TURN) {
          const points = manaScoreValue(mana, 1);
          if (points > pickupBestPointsBlack) {
            pickupBestPointsBlack = points;
            pickupBestAdjacentOwnBlack = manaMoveTarget && mana - 1 === 1;
          } else if (
            points === pickupBestPointsBlack &&
            !(manaMoveTarget && mana - 1 === 1)
          ) {
            pickupBestAdjacentOwnBlack = false;
          }
        }
      }
    }
    let control = distanceBlack - distanceWhite;
    if (control > 4) control = 4;
    if (control < -4) control = -4;
    if (weights.manaPointsAttraction !== 0) {
      const attraction = tables.manaPointsAttraction;
      if (drainerReadyWhite) {
        value +=
          attraction[manaScoreValue(mana, 0) * DISTANCE_TABLE_SIZE + distanceWhite] ??
          0;
      }
      if (drainerReadyBlack) {
        value -=
          attraction[manaScoreValue(mana, 1) * DISTANCE_TABLE_SIZE + distanceBlack] ??
          0;
      }
    }
    if (mana === MANA_SUPER) {
      value += weights.supermanaDrainerControl * control;
    } else {
      const ownerColor = mana - 1;
      const ownerSign = ownerColor === 0 ? 1 : -1;
      value +=
        ownerSign *
        (tables.manaToOwnerPool[
          OWN_POOL_DISTANCE[ownerColor * BOARD_CELLS + index] ?? 0
        ] ?? 0);
      value += ownerSign * (tables.manaToNearestPool[scoreDistance] ?? 0);
      value += weights.manaDrainerControl * control;
      // One point from winning, with own mana already inside mana-step reach of a pool, is
      // the one need-by-distance cell the additive form cannot price.
      if (scoreDistance <= 2 && (ownerColor === 0 ? needWhite : needBlack) <= 1) {
        manaStepWin |= ownerColor === 0 ? 1 : 2;
      }
      if (ownerColor === 0) {
        if (scoreDistance < manaStepTurnsWhite) manaStepTurnsWhite = scoreDistance;
      } else if (scoreDistance < manaStepTurnsBlack) {
        manaStepTurnsBlack = scoreDistance;
      }
    }
  }

  if (manaStepWin !== 0) {
    value +=
      weights.manaStepWinThreat *
      (((manaStepWin & 1) === 0 ? 0 : 1) - ((manaStepWin & 2) === 0 ? 0 : 1));
  }

  for (let color = 0; color < COLOR_COUNT; color += 1) {
    const sign = color === 0 ? 1 : -1;
    const enemy = color ^ 1;
    for (
      let kind = 0, id = color;
      kind < MON_KIND_COUNT;
      kind += 1, id += COLOR_COUNT
    ) {
      const index = monLocations[id] ?? 0;
      if (index < 0) continue;
      const cell = cells[index] ?? 0;
      if (cellOccupancy(cell) !== OCC_MON) continue;
      const cooldown = cellCooldown(cell);
      if (cooldown !== 0) {
        value -=
          sign *
          ((kind === KIND_DRAINER ? weights.faintDrainer : weights.faintMon) +
            weights.faintCooldownStep * cooldown);
      }
      const square = squares[index] ?? 0;
      if (cooldown === 0 && square < SQ_MON_BASE) {
        value += sign * weights.activeMon;
      }

      const carriedMana = cellMana(cell);
      if (carriedMana !== 0) {
        const points = manaScoreValue(carriedMana, color);
        const poolDistance = POOL_DISTANCE[index] ?? 0;
        value +=
          sign *
          ((tables.carrierCloseToPool[poolDistance] ?? 0) +
            points * weights.carrierPointBonus);
        if (carriedMana === MANA_SUPER) value += sign * weights.supermanaCarrier;
        if (color === position.active && poolDistance <= remaining) {
          value += sign * weights.carrierScoresThisTurn * points;
        } else if (color !== position.active && poolDistance <= MONS_MOVES_PER_TURN) {
          value += sign * weights.carrierScoresNextTurn * points;
          if (windowTracking) {
            if (color === 0) {
              if (points > carrierNextPointsWhite) carrierNextPointsWhite = points;
            } else if (points > carrierNextPointsBlack) {
              carrierNextPointsBlack = points;
            }
          }
        }
        const ownScore = color === 0 ? position.whiteScore : position.blackScore;
        if (points >= TARGET_SCORE - ownScore) {
          value += sign * weights.winningCarrier;
        }
      } else if (cellConsumable(cell) === CONS_BOMB) {
        value += sign * weights.bomb;
      }

      if (cooldown !== 0) continue;

      if (kind === KIND_DRAINER) {
        let plan = 0;
        const minMana = color === 0 ? nearestManaWhite : nearestManaBlack;
        const onePointPickup = color === 0 ? onePointPickupWhite : onePointPickupBlack;
        const twoPointPickup = color === 0 ? twoPointPickupWhite : twoPointPickupBlack;
        const pickupScoreDistance =
          onePointPickup < twoPointPickup ? onePointPickup : twoPointPickup;
        const tripBudget = color === position.active ? remaining : MONS_MOVES_PER_TURN;
        let tripTable = tables.drainerTrip;
        let tripSteps =
          carriedMana !== 0
            ? (POOL_DISTANCE[index] ?? 0)
            : cellConsumable(cell) !== 0
              ? UNREACHABLE_DISTANCE
              : onePointPickup;
        if (
          carriedMana === 0 &&
          cellConsumable(cell) === 0 &&
          twoPointPickup < UNREACHABLE_DISTANCE &&
          (onePointPickup >= UNREACHABLE_DISTANCE ||
            (tables.drainerTripTwoPoint[
              twoPointPickup > tripBudget ? twoPointPickup - tripBudget : 0
            ] ?? 0) -
              (tables.tripStep[twoPointPickup] ?? 0) >
              (tables.drainerTrip[
                onePointPickup > tripBudget ? onePointPickup - tripBudget : 0
              ] ?? 0) -
                (tables.tripStep[onePointPickup] ?? 0))
        ) {
          tripTable = tables.drainerTripTwoPoint;
          tripSteps = twoPointPickup;
        }
        plan -= tables.tripStep[tripSteps] ?? 0;
        const tripExcess = tripSteps > tripBudget ? tripSteps - tripBudget : 0;
        const tripTurns =
          1 + (((tripExcess + MONS_MOVES_PER_TURN - 1) / MONS_MOVES_PER_TURN) | 0);
        if (color === 0) {
          if (tripTurns < tripTurnsWhite) tripTurnsWhite = tripTurns;
        } else if (tripTurns < tripTurnsBlack) {
          tripTurnsBlack = tripTurns;
        }
        plan += tripTable[tripExcess] ?? 0;
        plan += tables.drainerCloseToMana[minMana] ?? 0;
        plan +=
          tables.drainerCloseToOwnPool[
            OWN_POOL_DISTANCE[color * BOARD_CELLS + index] ?? 0
          ] ?? 0;
        plan +=
          tables.drainerCloseToSupermana[chebyshev(index, SUPERMANA_BASE_INDEX)] ?? 0;
        if (
          carriedMana === 0 &&
          cellConsumable(cell) === 0 &&
          color === position.active &&
          pickupScoreDistance <= remaining
        ) {
          plan += weights.drainerPickupScoresThisTurn;
        }
        value += sign * plan;
        const guarded = awakeAngelGuards(position, color, index);
        const threatSteps = estimatedAttackSteps(position, index, color, guarded);
        const carrying = carriedMana !== 0;
        const bucket =
          color !== position.active || remaining === 0
            ? THREAT_BUCKET_EXPOSED
            : remaining >= THREAT_SPARE_MOVES
              ? THREAT_BUCKET_SPARE
              : THREAT_BUCKET_FEW;
        const row = (carrying ? THREAT_BUCKETS : 0) + bucket;
        if (threatSteps === 0) {
          value -= sign * (tables.threatImmediate[row] ?? 0);
        } else if (threatSteps <= MONS_MOVES_PER_TURN) {
          value -=
            sign * (tables.threatWalk[row * THREAT_WALK_STRIDE + threatSteps] ?? 0);
        }
        if (guarded) {
          value += sign * weights.angelGuardingDrainer;
        }
      } else if (kind === KIND_ANGEL) {
        const own = color === 0 ? drainerWhite : drainerBlack;
        if (own >= 0) {
          value += sign * (tables.angelCloseToDrainer[chebyshev(index, own)] ?? 0);
        }
      } else if (kind === KIND_SPIRIT) {
        let nearestEnemy = UNREACHABLE_DISTANCE;
        for (
          let other = 0, id = enemy;
          other < MON_KIND_COUNT;
          other += 1, id += COLOR_COUNT
        ) {
          const enemyIndex = monLocations[id] ?? 0;
          if (enemyIndex < 0) continue;
          const enemyCell = cells[enemyIndex] ?? 0;
          if (cellCooldown(enemyCell) !== 0) continue;
          const distance = chebyshev(index, enemyIndex);
          if (distance < nearestEnemy) nearestEnemy = distance;
        }
        value += sign * (tables.spiritCloseToEnemy[nearestEnemy] ?? 0);
        if (square >= SQ_MON_BASE) value -= sign * weights.spiritOnOwnBase;
      } else {
        value += sign * (tables.monCloseToCenter[CENTER_ROW_DISTANCE[index] ?? 0] ?? 0);
        const enemyDrainer = enemy === 0 ? drainerWhite : drainerBlack;
        const enemyDrainerReady = enemy === 0 ? drainerReadyWhite : drainerReadyBlack;
        if (enemyDrainer >= 0 && enemyDrainerReady) {
          value +=
            sign *
            (tables.attackerCloseToEnemyDrainer[chebyshev(index, enemyDrainer)] ?? 0);
        }
      }
    }
  }

  // The lead in tempo decides a race that is nearly over; earlier it is one plan among many.
  if (
    weights.raceHalfTurn !== 0 &&
    (needWhite < needBlack ? needWhite : needBlack) <= RACE_LATE_NEED
  ) {
    // A side that has already spent its free mana step this turn needs one more turn to
    // deliver by that channel.
    const stepUsed = position.manaMoves > 0 ? 1 : 0;
    const stepWhite = manaStepTurnsWhite + (position.active === 0 ? stepUsed : 0);
    const stepBlack = manaStepTurnsBlack + (position.active === 1 ? stepUsed : 0);
    const tauWhite = tripTurnsWhite < stepWhite ? tripTurnsWhite : stepWhite;
    const tauBlack = tripTurnsBlack < stepBlack ? tripTurnsBlack : stepBlack;
    // Half-turns: the side to move starts its count now, the other side one half-turn later.
    const half =
      tauBlack * 2 +
      (position.active === 1 ? 0 : 1) -
      (tauWhite * 2 + (position.active === 0 ? 0 : 1));
    const clamped =
      half > RACE_SPAN ? RACE_SPAN : half < -RACE_SPAN ? -RACE_SPAN : half;
    value += tables.race[clamped + RACE_SPAN] ?? 0;
  }

  if (windowTracking) {
    const inactive = position.active ^ 1;
    const inactiveSign = inactive === 0 ? 1 : -1;
    const pickupPoints = inactive === 0 ? pickupBestPointsWhite : pickupBestPointsBlack;
    const carrierPoints =
      inactive === 0 ? carrierNextPointsWhite : carrierNextPointsBlack;
    const manaMoveCount = inactive === 0 ? manaMoveCountWhite : manaMoveCountBlack;
    const manaMoveWindow = manaMoveCount > 0;
    const pickupBestAdjacentOwn =
      inactive === 0 ? pickupBestAdjacentOwnWhite : pickupBestAdjacentOwnBlack;
    const spareManaMove =
      manaMoveCount >= 2 || (manaMoveCount === 1 && !pickupBestAdjacentOwn);
    let window = pickupPoints;
    if (window > 0 && spareManaMove) window += 1;
    let carrierWindow = carrierPoints;
    if (carrierWindow > 0 && manaMoveWindow) carrierWindow += 1;
    if (carrierWindow > window) window = carrierWindow;
    if (manaMoveWindow && window < 1) window = 1;
    const inactiveScore = inactive === 0 ? position.whiteScore : position.blackScore;
    if (window > 0 && inactiveScore + window >= TARGET_SCORE) {
      value += inactiveSign * winsNextTurnThreat;
    }
  }

  if (tables.learnedPro !== undefined) {
    value += learnedProResidual(position, tables.learnedPro);
  }

  return value;
}
