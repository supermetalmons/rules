import {
  type AutomoveFacadeResult,
  type MonsGameAutomoveDelegate,
  setMonsGameAutomoveDelegate,
} from "../api/mons-game-model.js";
import {
  Color,
  cloneInput,
  cloneInputs,
  inputChainsEqual,
  type Input,
  type Output,
} from "../engine/domain.js";
import { inputArrayFen, parseInputArrayFen } from "../engine/fen.js";
import { FOR_AUTOMOVE_START_INPUT_OPTIONS, MonsGame } from "../engine/game.js";
import {
  AUTOMOVE_SELECTOR_BUDGET_MS,
  checkpoint,
  checkpointWithReserve,
  takePreviousTimeout,
  withCooperativeSubdeadline,
  withDeadlineIfAbsent,
} from "./deadline.js";
import {
  exactOpportunityContext,
  type ExactOpportunityContext,
} from "./exact.js";
import {
  replyRiskConfigForSearch,
  replyRiskGuardShortlistIndices,
} from "./reply-risk.js";
import {
  isOwnDrainerVulnerable,
  isOwnDrainerWalkVulnerable,
  rankRootCandidates,
  type RootCandidate,
} from "./root-candidates.js";
import { rootFamily } from "./root-family.js";
import { filteredRootCandidateIndices } from "./root-selector.js";
import {
  applyShippingProConfig,
  executionConfigFromSearchConfig,
  shippingSearchConfigForGame,
} from "./selector-config.js";
import {
  clearShippingSelectorCaches,
  focusedCandidateRankForRuntimeInputs,
  focusedScoredRootsForRuntime,
  rootSelectorOptions,
  smartSearchBestInputs,
  turnEngineConfigFromSearchConfig,
} from "./shipping-selector.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  hasProgressSurface as rootHasProgressSurface,
  type AutomoveSearchConfig,
  type AutomoveSearchExecutionConfig,
  type RootEvaluation,
  type SmartAutomovePreference,
} from "./selector-types.js";
import {
  TurnEngineUtility,
  TurnPlanFamily,
  clearTurnEnginePlanCache,
  turnEngineEvaluatePlanWithReplies,
  turnEngineEvaluateStateUtility,
  type TurnPlan,
} from "./turn-engine.js";
import {
  applyInputsForSearchWithEvents,
  compareInputChains,
} from "./transitions.js";
import {
  CRYPTO_RANDOM_SOURCE,
  randomIndex,
  type RandomSource,
} from "./types.js";

const MAX_INPUT_CHAIN = 8;
const PRO_FAST_BANK_BUDGET_MS = 200;
const PRO_START_RESERVE_MS = 100;
const PRO_SELECTOR_BUDGET_MS = 550;

export type AutomoveRuntimeRoute =
  | "standard"
  | "pro-fast-bank"
  | "early-white-pro"
  | "early-white-fast"
  | "score-window"
  | "black-unconditional"
  | "pro-current"
  | "white-engine-disabled"
  | "white-nonnegative-deny"
  | "white-negative-deny"
  | "white-confirm-tiebreak"
  | "white-confirm-better"
  | "black-late";

type RuntimeSelector = (
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  route: AutomoveRuntimeRoute,
) => readonly Input[];

export type AutomoveRuntimeOptions = {
  readonly randomSource?: RandomSource;
  /** Test seam; production delegates to the shipping selector. */
  readonly selector?: RuntimeSelector;
  readonly clearTimeoutCaches?: () => void;
  readonly clearFreshProCache?: () => void;
  readonly opportunityContext?: (
    game: MonsGame,
    perspective: Color,
  ) => ExactOpportunityContext;
  readonly ownDrainerUnsafe?: (game: MonsGame, perspective: Color) => boolean;
  readonly rankedRoots?: (
    game: MonsGame,
    perspective: Color,
    config: AutomoveSearchExecutionConfig,
  ) => readonly RootCandidate[];
  readonly focusedRoots?: (
    game: MonsGame,
    config: AutomoveSearchExecutionConfig,
  ) => readonly RootEvaluation[];
  readonly focusedCandidateRank?: (
    game: MonsGame,
    config: AutomoveSearchExecutionConfig,
    inputs: readonly Input[],
  ) => number | undefined;
  readonly selectedUtility?: (
    game: MonsGame,
    root: RootEvaluation,
    perspective: Color,
    config: AutomoveSearchExecutionConfig,
  ) => TurnEngineUtility;
};

type RuntimeServices = Required<AutomoveRuntimeOptions>;

function defaultOwnDrainerUnsafe(game: MonsGame, perspective: Color): boolean {
  return (
    isOwnDrainerVulnerable(game, perspective) ||
    isOwnDrainerWalkVulnerable(game, perspective)
  );
}

function servicesFor(options: AutomoveRuntimeOptions): RuntimeServices {
  return {
    randomSource: options.randomSource ?? CRYPTO_RANDOM_SOURCE,
    selector:
      options.selector ??
      ((game, config) => smartSearchBestInputs(game, config, true)),
    clearTimeoutCaches:
      options.clearTimeoutCaches ?? clearShippingSelectorCaches,
    clearFreshProCache: options.clearFreshProCache ?? clearTurnEnginePlanCache,
    opportunityContext: options.opportunityContext ?? exactOpportunityContext,
    ownDrainerUnsafe: options.ownDrainerUnsafe ?? defaultOwnDrainerUnsafe,
    rankedRoots:
      options.rankedRoots ??
      ((game, perspective, config) =>
        rankRootCandidates(game, perspective, config)),
    focusedRoots:
      options.focusedRoots ??
      ((game, config) => focusedScoredRootsForRuntime(game, config, true)),
    focusedCandidateRank:
      options.focusedCandidateRank ?? focusedCandidateRankForRuntimeInputs,
    selectedUtility:
      options.selectedUtility ??
      ((game, root, perspective, config) => {
        const engineConfig = turnEngineConfigFromSearchConfig(config);
        const headUtility = turnEngineEvaluateStateUtility(
          root.game,
          game,
          perspective,
          engineConfig,
        );
        const family = rootFamily(root);
        const plan: TurnPlan = {
          actions: [],
          compiledChunks: [root.inputs],
          endGame: root.game.cloneForSimulation(),
          utility: headUtility,
          headUtility,
          headFamily: family,
          goalFamily: family,
          packageMeta: {
            scoreGain: 0,
            denyGain: 0,
            drainerSafetyDelta: 0,
            spiritOnlySetup: false,
            endsNonnegativeDrainerSafety: true,
            opponentImmediateWindowAfter: 0,
          },
        };
        return turnEngineEvaluatePlanWithReplies(
          game,
          plan,
          perspective,
          engineConfig,
        );
      }),
  };
}

function nextInputsForPrompt(output: Output): Input[] | undefined {
  switch (output.kind) {
    case "invalid-input":
    case "events":
      return undefined;
    case "locations-to-start-from":
      return output.locations.map((at) => ({
        kind: "location",
        location: { i: at.i, j: at.j },
      }));
    case "next-input-options":
      return output.nextInputs.map((next) => cloneInput(next.input));
  }
}

export function randomAutomove(
  game: MonsGame,
  source: RandomSource = CRYPTO_RANDOM_SOURCE,
): AutomoveFacadeResult {
  const inputs: Input[] = [];
  for (;;) {
    if (inputs.length > MAX_INPUT_CHAIN) {
      return { output: { kind: "invalid-input" }, inputFen: "" };
    }
    const output = game.processInputWithStartOptions(
      inputs,
      false,
      false,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
    );
    if (output.kind === "invalid-input") {
      return { output, inputFen: "" };
    }
    if (output.kind === "events") {
      return { output, inputFen: inputArrayFen(inputs) };
    }
    const choices = nextInputsForPrompt(output);
    if (choices === undefined || choices.length === 0) {
      return { output: { kind: "invalid-input" }, inputFen: "" };
    }
    const choice = choices[randomIndex(choices.length, source)];
    if (choice === undefined) {
      return { output: { kind: "invalid-input" }, inputFen: "" };
    }
    inputs.push(choice);
  }
}

export function deterministicLegalFallbackInputs(game: MonsGame): Input[] {
  const simulated = game.cloneForSimulation();
  const inputs: Input[] = [];
  for (;;) {
    if (inputs.length > MAX_INPUT_CHAIN) return [];
    const output = simulated.processInputWithStartOptions(
      inputs,
      true,
      false,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
    );
    if (output.kind === "invalid-input") return [];
    if (output.kind === "events") return inputs.length === 0 ? [] : inputs;
    const choices = nextInputsForPrompt(output);
    if (choices === undefined || choices.length === 0) return [];
    choices.sort((left, right) => compareInputChains([left], [right]));
    const choice = choices[0];
    if (choice === undefined) return [];
    inputs.push(choice);
  }
}

function executionConfigForGame(
  game: MonsGame,
  preference: SmartAutomovePreference,
): AutomoveSearchExecutionConfig {
  return executionConfigFromSearchConfig(
    shippingSearchConfigForGame(game, preference),
    preference,
  );
}

function deriveExecutionConfig(
  template: AutomoveSearchExecutionConfig,
  config: AutomoveSearchConfig,
): AutomoveSearchExecutionConfig {
  return executionConfigFromSearchConfig(config, template.preference, template);
}

function selectShippingSearchInputsInternal(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  route: AutomoveRuntimeRoute,
  services: RuntimeServices,
): Input[] {
  if (checkpoint()) return [];
  const inputs = cloneInputs(services.selector(game, config, route));
  if (inputs.length > 0) return inputs;
  if (checkpoint()) return [];
  const random = randomAutomove(
    game.cloneForSimulation(),
    services.randomSource,
  );
  return random.output.kind === "events"
    ? parseInputArrayFen(random.inputFen)
    : [];
}

function selectShippingFallbackInputs(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  route: AutomoveRuntimeRoute,
  services: RuntimeServices,
): Input[] {
  return selectShippingSearchInputsInternal(game, config, route, services);
}

function selectSearchInputsWithFreshProCache(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  route: AutomoveRuntimeRoute,
  services: RuntimeServices,
): Input[] {
  if (checkpoint()) return [];
  if (config.enableTurnEngineSelector) services.clearFreshProCache();
  return selectShippingSearchInputsInternal(game, config, route, services);
}

function selectWithSharedDeadline(
  game: MonsGame,
  select: () => Input[],
  services: RuntimeServices,
): Input[] {
  const clearWarmCaches = takePreviousTimeout();
  return withDeadlineIfAbsent(AUTOMOVE_SELECTOR_BUDGET_MS, () => {
    const fallback = deterministicLegalFallbackInputs(game);
    if (clearWarmCaches) services.clearTimeoutCaches();
    if (checkpoint()) return fallback;
    const selected = select();
    return selected.length === 0 || checkpoint() ? fallback : selected;
  });
}

function selectProFastBankInputs(
  selectFast: () => Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const selected = withCooperativeSubdeadline(
    PRO_FAST_BANK_BUDGET_MS,
    selectFast,
  );
  if (selected === undefined) services.clearTimeoutCaches();
  return selected;
}

function selectProWithSharedDeadline(
  game: MonsGame,
  select: () => Input[],
  services: RuntimeServices,
): Input[] {
  const clearWarmCaches = takePreviousTimeout();
  return withDeadlineIfAbsent(PRO_SELECTOR_BUDGET_MS, () => {
    const emergency = deterministicLegalFallbackInputs(game);
    if (clearWarmCaches) services.clearTimeoutCaches();
    if (checkpoint()) return emergency;

    const fastConfig = executionConfigForGame(game, "fast");
    const fast =
      selectProFastBankInputs(
        () => cloneInputs(services.selector(game, fastConfig, "pro-fast-bank")),
        services,
      ) ?? [];
    const timeoutInputs = fast.length > 0 && !checkpoint() ? fast : emergency;
    if (checkpointWithReserve(PRO_START_RESERVE_MS)) return timeoutInputs;

    const selected = select();
    return selected.length === 0 || checkpoint() ? timeoutInputs : selected;
  });
}

function selectShippingSearchInputs(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  services: RuntimeServices,
): Input[] {
  return selectWithSharedDeadline(
    game,
    () =>
      selectShippingSearchInputsInternal(game, config, "standard", services),
    services,
  );
}

function selectEarlyWhiteFallbackInputs(
  game: MonsGame,
  services: RuntimeServices,
): Input[] | undefined {
  const broadFallback =
    (game.activeColor === Color.White &&
      game.turnNumber <= 3 &&
      !game.playerCanUseAction() &&
      !game.playerCanMoveMana() &&
      (game.monsMovesCount === 0 || game.monsMovesCount === 3)) ||
    (game.activeColor === Color.White &&
      game.turnNumber === 1 &&
      game.monsMovesCount === 2 &&
      !game.playerCanUseAction() &&
      !game.playerCanMoveMana()) ||
    (game.activeColor === Color.White &&
      game.turnNumber === 3 &&
      game.monsMovesCount === 0 &&
      game.playerCanUseAction() &&
      game.playerCanMoveMana()) ||
    (game.activeColor === Color.White &&
      game.turnNumber === 3 &&
      game.monsMovesCount >= 3 &&
      game.playerCanUseAction() &&
      game.playerCanMoveMana());
  if (broadFallback) {
    return selectShippingFallbackInputs(
      game,
      executionConfigForGame(game, "pro"),
      "early-white-pro",
      services,
    );
  }

  const manaOnly =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount === 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana();
  const midTurn =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount > 0 &&
    !manaOnly &&
    (game.playerCanUseAction() || game.playerCanMoveMana());
  if (!midTurn || !services.ownDrainerUnsafe(game, game.activeColor)) {
    return undefined;
  }
  return selectShippingFallbackInputs(
    game,
    executionConfigForGame(game, "fast"),
    "early-white-fast",
    services,
  );
}

function selectScoreWindowTacticalFallbackInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    (game.monsMovesCount === 1 || game.monsMovesCount === 2) &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana();
  if (!eligible) return undefined;
  const context = services.opportunityContext(game, game.activeColor);
  if (context.delta.sameTurnScoreWindowValue <= 0) return undefined;
  return selectSearchInputsWithFreshProCache(
    game,
    deriveExecutionConfig(base, applyShippingProConfig(base)),
    "score-window",
    services,
  );
}

function findRoot(
  roots: readonly RootCandidate[],
  inputs: readonly Input[],
): RootCandidate | undefined {
  return roots.find((root) => inputChainsEqual(root.inputs, inputs));
}

function whiteDenyFallbackContextEligible(
  context: ExactOpportunityContext,
): boolean {
  return (
    !context.opponentCanWinImmediately &&
    context.delta.sameTurnScoreWindowValue === 1 &&
    context.delta.opponentWindowDenyGain === 1 &&
    !context.delta.drainerAttackAvailable &&
    context.delta.drainerSafety < 0
  );
}

function selectWhiteEarlyEngineDisabledFallbackInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    proInputs.length > 0;
  if (!eligible) return undefined;
  const context = services.opportunityContext(game, game.activeColor);
  if (!whiteDenyFallbackContextEligible(context)) return undefined;

  const currentPro = deriveExecutionConfig(base, applyShippingProConfig(base));
  const selected = findRoot(
    services.rankedRoots(game, game.activeColor, currentPro),
    proInputs,
  );
  if (
    selected === undefined ||
    selected.winsImmediately ||
    selected.attacksOpponentDrainer ||
    selected.spiritDevelopment ||
    selected.spiritSameTurnScoreSetupNow ||
    selected.spiritOwnManaSetupNow ||
    selected.scoresSupermanaThisTurn ||
    selected.scoresOpponentManaThisTurn ||
    selected.safeSupermanaPickupNow ||
    selected.safeOpponentManaPickupNow ||
    selected.supermanaProgress ||
    selected.opponentManaProgress ||
    !selected.ownDrainerVulnerable ||
    selected.ownDrainerWalkVulnerable ||
    selected.manaHandoffToOpponent ||
    selected.hasRoundtrip ||
    selected.sameTurnScoreWindowValue !== 1
  ) {
    return undefined;
  }

  const shipping = executionConfigForGame(game, "pro");
  const inputs = selectShippingFallbackInputs(
    game,
    shipping,
    "white-engine-disabled",
    services,
  );
  if (inputs.length === 0 || inputChainsEqual(inputs, proInputs)) {
    return undefined;
  }
  const fallback = findRoot(
    services.rankedRoots(game, game.activeColor, shipping),
    inputs,
  );
  if (
    fallback === undefined ||
    !fallback.spiritDevelopment ||
    fallback.spiritSameTurnScoreSetupNow ||
    !rootHasProgressSurface(fallback) ||
    fallback.winsImmediately ||
    fallback.attacksOpponentDrainer ||
    fallback.scoresSupermanaThisTurn ||
    fallback.scoresOpponentManaThisTurn ||
    fallback.safeSupermanaPickupNow ||
    fallback.safeOpponentManaPickupNow ||
    fallback.manaHandoffToOpponent ||
    fallback.hasRoundtrip ||
    !fallback.ownDrainerVulnerable ||
    fallback.ownDrainerWalkVulnerable ||
    fallback.sameTurnScoreWindowValue !== 0
  ) {
    return undefined;
  }
  return inputs;
}

function rootEvaluationForCandidate(root: RootCandidate): RootEvaluation {
  return { ...root, score: root.heuristic };
}

function selectedRootUtility(
  game: MonsGame,
  root: RootCandidate,
  config: AutomoveSearchExecutionConfig,
  services: RuntimeServices,
): TurnEngineUtility {
  return services.selectedUtility(
    game,
    rootEvaluationForCandidate(root),
    game.activeColor,
    config,
  );
}

function selectWhiteNonnegativeDenyFallbackInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount === 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    proInputs.length > 0;
  if (!eligible) return undefined;
  const context = services.opportunityContext(game, game.activeColor);
  if (!whiteDenyFallbackContextEligible(context)) return undefined;
  const currentPro = deriveExecutionConfig(base, applyShippingProConfig(base));
  const selected = findRoot(
    services.rankedRoots(game, game.activeColor, currentPro),
    proInputs,
  );
  if (
    selected === undefined ||
    !selectedRootUtility(
      game,
      selected,
      currentPro,
      services,
    ).hasNonnegativeDenyGain()
  ) {
    return undefined;
  }
  const searchOnly = deriveExecutionConfig(currentPro, {
    ...currentPro,
    enableTurnEngineSelector: false,
    enableTurnHeadRerank: true,
    turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  });
  const inputs = selectShippingFallbackInputs(
    game,
    searchOnly,
    "white-nonnegative-deny",
    services,
  );
  return inputs.length === 0 || inputChainsEqual(inputs, proInputs)
    ? undefined
    : inputs;
}

function selectWhiteNegativeDenyFallbackInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount === 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    proInputs.length > 0;
  if (!eligible) return undefined;
  const context = services.opportunityContext(game, game.activeColor);
  if (!whiteDenyFallbackContextEligible(context)) return undefined;
  const currentPro = deriveExecutionConfig(base, applyShippingProConfig(base));
  const selected = findRoot(
    services.rankedRoots(game, game.activeColor, currentPro),
    proInputs,
  );
  if (
    selected === undefined ||
    selectedRootUtility(
      game,
      selected,
      currentPro,
      services,
    ).hasNonnegativeDenyGain()
  ) {
    return undefined;
  }
  const shipping = executionConfigForGame(game, "pro");
  const searchOnly = deriveExecutionConfig(currentPro, {
    ...currentPro,
    enableTurnEngineSelector: false,
    enableTurnHeadRerank: true,
    turnEngineSeedCap: shipping.turnEngineSeedCap,
    turnEngineBeamWidth: shipping.turnEngineBeamWidth,
    turnEnginePerNodeFamilyCap: shipping.turnEnginePerNodeFamilyCap,
    turnEngineStepCap: shipping.turnEngineStepCap,
  });
  const inputs = selectShippingFallbackInputs(
    game,
    searchOnly,
    "white-negative-deny",
    services,
  );
  if (inputs.length === 0 || inputChainsEqual(inputs, proInputs)) {
    return undefined;
  }
  return services.focusedCandidateRank(game, searchOnly, inputs) === 0
    ? inputs
    : undefined;
}

function safeQuietManaTempoRoot(root: RootEvaluation): boolean {
  return (
    !root.winsImmediately &&
    !root.attacksOpponentDrainer &&
    !root.ownDrainerVulnerable &&
    !root.ownDrainerWalkVulnerable &&
    !root.spiritDevelopment &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip &&
    !root.scoresSupermanaThisTurn &&
    !root.scoresOpponentManaThisTurn &&
    !root.safeSupermanaPickupNow &&
    !root.safeOpponentManaPickupNow &&
    root.sameTurnScoreWindowValue === 0 &&
    !root.supermanaProgress &&
    !root.opponentManaProgress &&
    !root.classes.immediateScore &&
    !root.classes.drainerAttack &&
    !root.classes.drainerSafetyRecover &&
    !root.classes.carrierProgress &&
    !root.classes.material &&
    root.classes.quiet &&
    rootFamily(root) === TurnPlanFamily.ManaTempo
  );
}

function confirmProV1ContextEligible(
  context: ExactOpportunityContext,
): boolean {
  return (
    !context.opponentCanWinImmediately &&
    context.delta.sameTurnScoreWindowValue === 0 &&
    context.delta.spiritGain === 0 &&
    context.delta.opponentWindowDenyGain === 0 &&
    !context.delta.drainerAttackAvailable &&
    context.delta.safeSupermanaProgressSteps === undefined &&
    context.delta.safeOpponentManaProgressSteps === undefined &&
    context.delta.drainerSafety >= 0
  );
}

function proRuntimeCompetition(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
):
  | {
      readonly config: AutomoveSearchExecutionConfig;
      readonly roots: readonly RootEvaluation[];
      readonly proIndex: number;
      readonly candidateIndices: readonly number[];
      readonly shortlist: readonly number[];
    }
  | undefined {
  const config = deriveExecutionConfig(base, applyShippingProConfig(base));
  const roots = services.focusedRoots(game, config);
  const proIndex = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, proInputs),
  );
  if (proIndex < 0) return undefined;
  const candidateIndices = filteredRootCandidateIndices(
    game,
    roots,
    game.activeColor,
    config,
    rootSelectorOptions(config),
  );
  if (!candidateIndices.includes(proIndex)) return undefined;
  const shortlist = replyRiskGuardShortlistIndices(
    roots,
    candidateIndices,
    replyRiskConfigForSearch(config),
  );
  if (!shortlist.includes(proIndex)) return undefined;
  return { config, roots, proIndex, candidateIndices, shortlist };
}

function searchOnlyProV1Config(
  currentPro: AutomoveSearchExecutionConfig,
): AutomoveSearchExecutionConfig {
  return deriveExecutionConfig(currentPro, {
    ...currentPro,
    enableTurnEngineSelector: false,
    enableTurnHeadRerank: true,
    turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  });
}

function selectWhiteConfirmProV1TiebreakInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount === 2 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    proInputs.length > 0;
  if (
    !eligible ||
    !confirmProV1ContextEligible(
      services.opportunityContext(game, game.activeColor),
    )
  ) {
    return undefined;
  }
  const competition = proRuntimeCompetition(game, base, proInputs, services);
  if (
    competition?.candidateIndices.length !== 2 ||
    competition.shortlist.length !== competition.candidateIndices.length
  ) {
    return undefined;
  }
  const inputs = selectShippingFallbackInputs(
    game,
    searchOnlyProV1Config(competition.config),
    "white-confirm-tiebreak",
    services,
  );
  if (inputs.length === 0 || inputChainsEqual(inputs, proInputs)) {
    return undefined;
  }
  const searchIndex = competition.roots.findIndex((root) =>
    inputChainsEqual(root.inputs, inputs),
  );
  if (
    !competition.candidateIndices.includes(searchIndex) ||
    !competition.shortlist.includes(searchIndex)
  ) {
    return undefined;
  }
  const pro = competition.roots[competition.proIndex];
  const search = competition.roots[searchIndex];
  if (pro === undefined || search === undefined) return undefined;
  return pro.score === search.score &&
    pro.spiritSetupGain === search.spiritSetupGain &&
    pro.safeSupermanaProgressSteps === search.safeSupermanaProgressSteps &&
    pro.safeOpponentManaProgressSteps ===
      search.safeOpponentManaProgressSteps &&
    pro.scorePathBestSteps === search.scorePathBestSteps &&
    safeQuietManaTempoRoot(pro) &&
    safeQuietManaTempoRoot(search)
    ? inputs
    : undefined;
}

function selectWhiteConfirmProV1BetterInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount >= 3 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    proInputs.length > 0;
  if (
    !eligible ||
    !confirmProV1ContextEligible(
      services.opportunityContext(game, game.activeColor),
    )
  ) {
    return undefined;
  }
  const competition = proRuntimeCompetition(game, base, proInputs, services);
  if (competition === undefined) return undefined;
  const inputs = selectShippingFallbackInputs(
    game,
    searchOnlyProV1Config(competition.config),
    "white-confirm-better",
    services,
  );
  if (inputs.length === 0 || inputChainsEqual(inputs, proInputs)) {
    return undefined;
  }
  const searchIndex = competition.roots.findIndex((root) =>
    inputChainsEqual(root.inputs, inputs),
  );
  if (
    !competition.candidateIndices.includes(searchIndex) ||
    !competition.shortlist.includes(searchIndex)
  ) {
    return undefined;
  }
  const pro = competition.roots[competition.proIndex];
  const search = competition.roots[searchIndex];
  if (pro === undefined || search === undefined) return undefined;
  return search.score >= pro.score &&
    search.rootRank < pro.rootRank &&
    pro.spiritSetupGain === search.spiritSetupGain &&
    pro.safeSupermanaProgressSteps === search.safeSupermanaProgressSteps &&
    pro.safeOpponentManaProgressSteps ===
      search.safeOpponentManaProgressSteps &&
    pro.scorePathBestSteps === search.scorePathBestSteps &&
    safeQuietManaTempoRoot(pro) &&
    safeQuietManaTempoRoot(search)
    ? inputs
    : undefined;
}

function selectUnconditionalBlackFallbackInputs(
  game: MonsGame,
  services: RuntimeServices,
): Input[] | undefined {
  const eligible =
    (game.activeColor === Color.Black &&
      game.turnNumber === 2 &&
      game.monsMovesCount === 0 &&
      game.playerCanUseAction() &&
      game.playerCanMoveMana()) ||
    (game.activeColor === Color.Black &&
      game.turnNumber === 2 &&
      game.monsMovesCount > 0 &&
      !game.playerCanUseAction() &&
      game.playerCanMoveMana()) ||
    (game.activeColor === Color.Black &&
      game.turnNumber === 4 &&
      game.monsMovesCount === 0 &&
      game.playerCanUseAction() &&
      game.playerCanMoveMana());
  return eligible
    ? selectShippingFallbackInputs(
        game,
        executionConfigForGame(game, "pro"),
        "black-unconditional",
        services,
      )
    : undefined;
}

function selectLateBlackFallbackInputs(
  game: MonsGame,
  proInputs: readonly Input[],
  services: RuntimeServices,
): Input[] | undefined {
  if (proInputs.length === 0) return undefined;
  const bridge =
    game.activeColor === Color.Black &&
    game.turnNumber === 4 &&
    game.monsMovesCount === 2 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana();
  const midTurn =
    game.activeColor === Color.Black &&
    game.turnNumber >= 4 &&
    game.monsMovesCount >= 3 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana();
  if (!bridge && !midTurn) return undefined;
  const inputs = selectShippingFallbackInputs(
    game,
    executionConfigForGame(game, "pro"),
    "black-late",
    services,
  );
  if (inputs.length === 0 || inputChainsEqual(inputs, proInputs)) {
    return undefined;
  }
  if (bridge && inputs.length === 3 && inputArrayFen(inputs).endsWith(";mb")) {
    return inputs;
  }
  return midTurn ? inputs : undefined;
}

function selectProInputsWithRuntime(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  currentPro: AutomoveSearchExecutionConfig,
  services: RuntimeServices,
): Input[] {
  if (checkpoint()) return [];
  const earlyWhite = selectEarlyWhiteFallbackInputs(game, services);
  if (earlyWhite !== undefined) return earlyWhite;
  if (checkpoint()) return [];
  const scoreWindow = selectScoreWindowTacticalFallbackInputs(
    game,
    base,
    services,
  );
  if (scoreWindow !== undefined) return scoreWindow;
  if (checkpoint()) return [];
  const unconditionalBlack = selectUnconditionalBlackFallbackInputs(
    game,
    services,
  );
  if (unconditionalBlack !== undefined) return unconditionalBlack;

  const proInputs = selectSearchInputsWithFreshProCache(
    game,
    currentPro,
    "pro-current",
    services,
  );
  if (checkpoint()) return [];
  const fallbacks: readonly (() => Input[] | undefined)[] = [
    () =>
      selectWhiteEarlyEngineDisabledFallbackInputs(
        game,
        base,
        proInputs,
        services,
      ),
    () =>
      selectWhiteNonnegativeDenyFallbackInputs(game, base, proInputs, services),
    () =>
      selectWhiteNegativeDenyFallbackInputs(game, base, proInputs, services),
    () =>
      selectWhiteConfirmProV1TiebreakInputs(game, base, proInputs, services),
    () => selectWhiteConfirmProV1BetterInputs(game, base, proInputs, services),
    () => selectLateBlackFallbackInputs(game, proInputs, services),
  ];
  for (const fallback of fallbacks) {
    if (checkpoint()) return [];
    const inputs = fallback();
    if (inputs !== undefined) return inputs;
  }
  return proInputs;
}

function selectProInputs(
  game: MonsGame,
  base: AutomoveSearchExecutionConfig,
  services: RuntimeServices,
): Input[] {
  const currentPro = deriveExecutionConfig(base, applyShippingProConfig(base));
  return selectProWithSharedDeadline(
    game,
    () => selectProInputsWithRuntime(game, base, currentPro, services),
    services,
  );
}

export function smartAutomove(
  game: MonsGame,
  preference: SmartAutomovePreference,
  options: AutomoveRuntimeOptions = {},
): AutomoveFacadeResult {
  const sourceFen = game.fen();
  const services = servicesFor(options);
  const base = executionConfigForGame(game, preference);
  const selected =
    preference === "pro"
      ? selectProInputs(game, base, services)
      : selectShippingSearchInputs(game, base, services);
  const inputs =
    selected.length === 0 ? deterministicLegalFallbackInputs(game) : selected;
  let applied = applyInputsForSearchWithEvents(game, inputs);
  let appliedInputs = inputs;
  if (applied === undefined) {
    appliedInputs = deterministicLegalFallbackInputs(game);
    applied = applyInputsForSearchWithEvents(game, appliedInputs);
  }
  if (game.fen() !== sourceFen) {
    throw new Error("smart automove mutated its source game");
  }
  return applied === undefined
    ? { output: { kind: "invalid-input" }, inputFen: "" }
    : {
        output: { kind: "events", events: applied.events },
        inputFen: inputArrayFen(appliedInputs),
      };
}

export function createMonsGameAutomoveDelegate(
  options: AutomoveRuntimeOptions = {},
): MonsGameAutomoveDelegate {
  const source = options.randomSource ?? CRYPTO_RANDOM_SOURCE;
  return {
    automove(game): AutomoveFacadeResult {
      return randomAutomove(game, source);
    },
    smartAutomove(game, preference): AutomoveFacadeResult {
      return smartAutomove(game, preference, options);
    },
  };
}

export function installAutomoveRuntime(
  options: AutomoveRuntimeOptions = {},
): void {
  setMonsGameAutomoveDelegate(createMonsGameAutomoveDelegate(options));
}
