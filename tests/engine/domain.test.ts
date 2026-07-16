import { describe, expect, it } from "vitest";

import {
  AvailableMoveKind,
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  SUPERMANA,
  cloneItem,
  createMon,
  decreaseMonCooldown,
  faintMon,
  isMonFainted,
  itemEquals,
  manaScore,
  monWithManaItem,
  regularMana,
} from "../../src/engine/domain.js";
import {
  I32_MAX,
  I32_MIN,
  addI32,
  addU64,
  divI32,
  mulI32,
  parseI32Strict,
  remI32,
  rotateLeftU64,
  saturatingAddI32,
  saturatingMulI32,
  toI32,
  u64,
  u64ToHex,
} from "../../src/engine/numerics.js";

describe("numeric engine values", () => {
  it("retains Rust enum ordinals, reverse mappings, and frozen objects", () => {
    expect(
      [
        Color,
        MonKind,
        Consumable,
        AvailableMoveKind,
        Modifier,
        NextInputKind,
      ].every(Object.isFrozen),
    ).toBe(true);
    expect(Color.White).toBe(0);
    expect(Color[0]).toBe("White");
    expect(MonKind.Mystic).toBe(4);
    expect(MonKind[4]).toBe("Mystic");
    expect(Consumable.BombOrPotion).toBe(2);
    expect(Consumable[2]).toBe("BombOrPotion");
    expect(AvailableMoveKind.Potion).toBe(3);
    expect(AvailableMoveKind[3]).toBe("Potion");
    expect(Modifier.Cancel).toBe(2);
    expect(Modifier[2]).toBe("Cancel");
    expect(NextInputKind.BombAttack).toBe(8);
    expect(NextInputKind[8]).toBe("BombAttack");
  });

  it("matches WebAssembly i32 coercion and wrapping arithmetic", () => {
    expect(toI32(4.9)).toBe(4);
    expect(toI32(-4.9)).toBe(-4);
    expect(toI32(Number.NaN)).toBe(0);
    expect(toI32(Number.POSITIVE_INFINITY)).toBe(0);
    expect(toI32(0x1_0000_0001)).toBe(1);
    expect(addI32(I32_MAX, 1)).toBe(I32_MIN);
    expect(mulI32(0x4000_0000, 4)).toBe(0);
    expect(saturatingAddI32(I32_MAX, 1)).toBe(I32_MAX);
    expect(saturatingMulI32(I32_MIN, 2)).toBe(I32_MIN);
  });

  it("matches Rust signed division and remainder behavior", () => {
    expect(divI32(7, 3)).toBe(2);
    expect(divI32(-7, 3)).toBe(-2);
    expect(divI32(7, -3)).toBe(-2);
    expect(divI32(I32_MIN, 1)).toBe(I32_MIN);
    expect(divI32(I32_MAX, -1)).toBe(-I32_MAX);
    expect(remI32(-7, 3)).toBe(-1);
    expect(remI32(I32_MIN, 1)).toBe(0);

    for (const zero of [0, -0]) {
      expect(() => divI32(1, zero)).toThrow(
        new RangeError("attempt to divide by zero"),
      );
      expect(() => remI32(1, zero)).toThrow(
        new RangeError(
          "attempt to calculate the remainder with a divisor of zero",
        ),
      );
    }

    expect(() => divI32(I32_MIN, -1)).toThrow(
      new RangeError("attempt to divide with overflow"),
    );
    expect(() => remI32(I32_MIN, -1)).toThrow(
      new RangeError("attempt to calculate the remainder with overflow"),
    );
  });

  it("parses only values accepted by Rust i32 parsing", () => {
    expect(parseI32Strict("+17")).toBe(17);
    expect(parseI32Strict("-2147483648")).toBe(I32_MIN);
    expect(parseI32Strict("2147483647")).toBe(I32_MAX);
    expect(parseI32Strict("2147483648")).toBeUndefined();
    expect(parseI32Strict(" 1")).toBeUndefined();
    expect(parseI32Strict("1.0")).toBeUndefined();
    expect(parseI32Strict("")).toBeUndefined();
    for (const lineTerminator of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
      expect(parseI32Strict(`1${lineTerminator}`)).toBeUndefined();
    }
  });

  it("wraps 64-bit hash operations exactly", () => {
    expect(addU64(u64(0xffff_ffff_ffff_ffffn), u64(2))).toBe(1n);
    expect(rotateLeftU64(u64(1), 63)).toBe(0x8000_0000_0000_0000n);
    expect(rotateLeftU64(u64(0x8000_0000_0000_0000n), 1)).toBe(1n);
    expect(u64ToHex(u64(-1))).toBe("ffffffffffffffff");
  });
});

describe("domain values", () => {
  it("matches mon cooldown behavior", () => {
    const mon = createMon(MonKind.Demon, Color.White, 0x1_0000_0001);
    expect(mon.cooldown).toBe(1);
    expect(isMonFainted(mon)).toBe(true);
    decreaseMonCooldown(mon);
    expect(mon.cooldown).toBe(0);
    decreaseMonCooldown(mon);
    expect(mon.cooldown).toBe(0);
    faintMon(mon);
    expect(mon.cooldown).toBe(2);
  });

  it("deep-copies composite items", () => {
    const source = monWithManaItem(
      createMon(MonKind.Spirit, Color.Black, 1),
      regularMana(Color.White),
    );
    const copy = cloneItem(source);
    expect(itemEquals(copy, source)).toBe(true);
    expect(copy).not.toBe(source);
    if (copy.kind !== "mon-with-mana") {
      throw new Error("expected mon-with-mana");
    }
    copy.mon.cooldown = 0;
    expect(source.mon.cooldown).toBe(1);
  });

  it("scores friendly, opposing, and supermana values", () => {
    expect(manaScore(regularMana(Color.White), Color.White)).toBe(1);
    expect(manaScore(regularMana(Color.Black), Color.White)).toBe(2);
    expect(manaScore(SUPERMANA, Color.White)).toBe(2);
  });
});
