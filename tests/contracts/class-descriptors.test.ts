import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as api from "../../src/entrypoints/mons-rust.js";

const EXPECTED_RUNTIME_CONTRACT_SHA256 =
  "3ceb65633db4e783b879a86ade932480d66d3069eb0442fd79d16ae5e28e063c";

type CapturedClass = {
  readonly name: string;
  readonly length: number;
  readonly staticKeys: readonly string[];
  readonly prototypeKeys: readonly string[];
  readonly staticDescriptors: Readonly<Record<string, CapturedDescriptor>>;
  readonly prototypeDescriptors: Readonly<Record<string, CapturedDescriptor>>;
};

type CapturedDescriptor = {
  readonly configurable: boolean;
  readonly enumerable: boolean;
  readonly kind: "accessor" | "data";
  readonly writable?: boolean;
  readonly value?: CapturedFunction;
  readonly get?: CapturedFunction;
  readonly set?: CapturedFunction;
};

type CapturedFunction = {
  readonly type: "function";
  readonly name: string;
  readonly length: number;
};

const runtimeContractBytes = fs.readFileSync(
  path.resolve("contracts/legacy/runtime-contract.json"),
);
const contract = JSON.parse(runtimeContractBytes.toString("utf8")) as {
  readonly schemaVersion: number;
  readonly baselineCommit: string;
  readonly packageVersion: string;
  readonly classes: Readonly<Record<string, CapturedClass>>;
};

function sha256(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const classes = {
  EventModel: api.EventModel,
  ItemModel: api.ItemModel,
  Location: api.Location,
  ManaModel: api.ManaModel,
  Mon: api.Mon,
  MonsGameModel: api.MonsGameModel,
  NextInputModel: api.NextInputModel,
  OutputModel: api.OutputModel,
  SquareModel: api.SquareModel,
  VerboseTrackingEntityModel: api.VerboseTrackingEntityModel,
};

function functionObservation(value: unknown): CapturedFunction | undefined {
  return typeof value === "function"
    ? { type: "function", name: value.name, length: value.length }
    : undefined;
}

function descriptorObservation(owner: object, key: string): CapturedDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  if (descriptor === undefined) throw new Error(`missing descriptor: ${key}`);
  if ("value" in descriptor) {
    const value = functionObservation(descriptor.value);
    return {
      configurable: descriptor.configurable ?? false,
      enumerable: descriptor.enumerable ?? false,
      kind: "data",
      writable: descriptor.writable ?? false,
      ...(value === undefined ? {} : { value }),
    };
  }
  // Accessor functions are inspected, never invoked or rebound.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const getter = functionObservation(descriptor.get);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = functionObservation(descriptor.set);
  return {
    configurable: descriptor.configurable ?? false,
    enumerable: descriptor.enumerable ?? false,
    kind: "accessor",
    ...(getter === undefined ? {} : { get: getter }),
    ...(setter === undefined ? {} : { set: setter }),
  };
}

describe("captured class descriptors", () => {
  it("pins the immutable runtime contract bytes", () => {
    expect(sha256(runtimeContractBytes)).toBe(EXPECTED_RUNTIME_CONTRACT_SHA256);
    expect(contract).toMatchObject({
      schemaVersion: 1,
      baselineCommit: "55c9e97f8643e3edba7249a1daff1f2b83fccad9",
      packageVersion: "0.1.135",
    });
  });

  for (const [name, constructor] of Object.entries(classes)) {
    it(`matches ${name}`, () => {
      const captured = contract.classes[name];
      if (captured === undefined)
        throw new Error(`missing captured class: ${name}`);
      const staticKeys = Object.getOwnPropertyNames(constructor).filter(
        (key) => !["length", "name", "prototype"].includes(key),
      );
      const prototypeKeys = Object.getOwnPropertyNames(
        constructor.prototype,
      ).filter((key) => key !== "constructor");

      expect(constructor.name).toBe(captured.name);
      expect(constructor.length).toBe(captured.length);
      expect(staticKeys).toEqual(captured.staticKeys);
      expect(prototypeKeys).toEqual(captured.prototypeKeys);
      for (const key of staticKeys) {
        expect(descriptorObservation(constructor, key)).toEqual(
          captured.staticDescriptors[key],
        );
      }
      for (const key of prototypeKeys) {
        expect(descriptorObservation(constructor.prototype, key)).toEqual(
          captured.prototypeDescriptors[key],
        );
      }
    });
  }
});
