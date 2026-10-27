import { copyEvent, type Color, type Event } from "../model/domain.js";

export type VerboseTrackingEntity = {
  readonly fen: string;
  readonly color: Color;
  readonly events: readonly Event[];
};

type PreparedTakeback = {
  readonly previousFen: string;
  readonly takebackFens: string[];
  readonly trackingEntries: VerboseTrackingEntity[];
};

type CompletedEventApplication = {
  readonly snapshotFen: () => string;
  readonly color: Color;
  readonly events: readonly Event[];
  readonly turnAdvanced: boolean;
  readonly winner: Color | undefined;
};

export type HistoryReplacement = {
  readonly takebackFens?: readonly string[];
  readonly trackingEntries?: readonly VerboseTrackingEntity[];
  readonly movesVerified?: boolean;
  readonly verboseTrackingEnabled?: boolean;
};

function copyTrackingEntries(
  entries: readonly VerboseTrackingEntity[],
): VerboseTrackingEntity[] {
  return entries.map((entry) => ({
    fen: entry.fen,
    color: entry.color,
    events: entry.events.map(copyEvent),
  }));
}

export class GameHistory {
  #takebackFens: string[] = [];
  #trackingEntries: VerboseTrackingEntity[] = [];
  #movesVerified = true;
  #verboseTrackingEnabled: boolean;
  #takebackTrackingEnabled = true;

  public constructor(verboseTrackingEnabled = false) {
    this.#verboseTrackingEnabled = verboseTrackingEnabled;
  }

  public get takebackFens(): readonly string[] {
    return [...this.#takebackFens];
  }

  public get trackingEntries(): readonly VerboseTrackingEntity[] {
    return copyTrackingEntries(this.#trackingEntries);
  }

  public get movesVerified(): boolean {
    return this.#movesVerified;
  }

  public get verboseTrackingEnabled(): boolean {
    return this.#verboseTrackingEnabled;
  }

  public get eventApplicationTrackingEnabled(): boolean {
    return this.#takebackTrackingEnabled || this.#verboseTrackingEnabled;
  }

  public copy(): GameHistory {
    const history = new GameHistory(this.#verboseTrackingEnabled);
    history.#takebackFens = [...this.#takebackFens];
    history.#trackingEntries = copyTrackingEntries(this.#trackingEntries);
    history.#movesVerified = this.#movesVerified;
    history.#takebackTrackingEnabled = this.#takebackTrackingEnabled;
    return history;
  }

  public fork(): GameHistory {
    const history = new GameHistory(false);
    history.#movesVerified = this.#movesVerified;
    history.#takebackTrackingEnabled = false;
    return history;
  }

  public resetForLoadedFen(): void {
    this.#takebackFens = [];
    this.#trackingEntries = [];
    this.#movesVerified = false;
  }

  public replace(replacement: HistoryReplacement): void {
    if (replacement.takebackFens !== undefined) {
      this.#takebackFens = [...replacement.takebackFens];
    }
    if (replacement.trackingEntries !== undefined) {
      this.#trackingEntries = copyTrackingEntries(replacement.trackingEntries);
    }
    if (replacement.movesVerified !== undefined) {
      this.#movesVerified = replacement.movesVerified;
    }
    if (replacement.verboseTrackingEnabled !== undefined) {
      this.#verboseTrackingEnabled = replacement.verboseTrackingEnabled;
      if (!replacement.verboseTrackingEnabled) {
        this.#trackingEntries = [];
      }
    }
  }

  public canTakeback(activeColor: Color, requestedColor: Color): boolean {
    return (
      this.#takebackTrackingEnabled &&
      this.#takebackFens.length > 1 &&
      activeColor === requestedColor
    );
  }

  public prepareTakeback(
    activeColor: Color,
    requestedColor: Color,
  ): PreparedTakeback | undefined {
    if (!this.canTakeback(activeColor, requestedColor)) return undefined;
    const previousFen = this.#takebackFens[this.#takebackFens.length - 2];
    if (previousFen === undefined) return undefined;
    return {
      previousFen,
      takebackFens: this.#takebackFens.slice(0, -1),
      trackingEntries: copyTrackingEntries(this.#trackingEntries.slice(0, -1)),
    };
  }

  public commitTakeback(prepared: PreparedTakeback): void {
    this.#takebackFens = [...prepared.takebackFens];
    this.#trackingEntries = copyTrackingEntries(prepared.trackingEntries);
  }

  public beginEventApplication(snapshotFen: () => string, color: Color): void {
    if (!this.#takebackTrackingEnabled || this.#takebackFens.length !== 0) {
      return;
    }

    const fen = snapshotFen();
    this.#takebackFens.push(fen);
    if (this.#verboseTrackingEnabled && this.#trackingEntries.length === 0) {
      this.#trackingEntries.push({ fen, color, events: [] });
    }
  }

  public completeEventApplication(completed: CompletedEventApplication): void {
    let capturedFen: string | undefined;
    const snapshotFen = (): string => (capturedFen ??= completed.snapshotFen());

    if (this.#takebackTrackingEnabled) {
      if (completed.winner !== undefined) {
        this.#takebackFens = [];
      } else if (completed.turnAdvanced) {
        this.#takebackFens = [snapshotFen()];
      } else {
        this.#takebackFens.push(snapshotFen());
      }
    }

    if (this.#verboseTrackingEnabled) {
      this.#trackingEntries.push({
        fen: snapshotFen(),
        color: completed.color,
        events: completed.events.map(copyEvent),
      });
    }
  }
}
