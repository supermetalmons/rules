use crate::*;

#[derive(Debug, PartialEq, Eq, Hash, Clone)]
pub(crate) enum Event {
    MonMove {
        item: Item,
        from: Location,
        to: Location,
    },
    ManaMove {
        mana: Mana,
        from: Location,
        to: Location,
    },
    ManaScored {
        mana: Mana,
        at: Location,
    },
    MysticAction {
        mystic: Mon,
        from: Location,
        to: Location,
    },
    DemonAction {
        demon: Mon,
        from: Location,
        to: Location,
    },
    DemonAdditionalStep {
        demon: Mon,
        from: Location,
        to: Location,
    },
    SpiritTargetMove {
        item: Item,
        from: Location,
        to: Location,
        by: Location,
    },
    PickupBomb {
        by: Mon,
        at: Location,
    },
    PickupPotion {
        by: Item,
        at: Location,
    },
    UsePotion {
        from: Location,
        to: Location,
    },
    PickupMana {
        mana: Mana,
        by: Mon,
        at: Location,
    },
    MonFainted {
        mon: Mon,
        from: Location,
        to: Location,
    },
    ManaDropped {
        mana: Mana,
        at: Location,
    },
    SupermanaBackToBase {
        from: Location,
        to: Location,
    },
    BombAttack {
        by: Mon,
        from: Location,
        to: Location,
    },
    MonAwake {
        mon: Mon,
        at: Location,
    },
    BombExplosion {
        at: Location,
    },
    NextTurn {
        color: Color,
    },
    GameOver {
        winner: Color,
    },
    Takeback,
}
