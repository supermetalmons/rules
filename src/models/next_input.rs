use crate::*;

#[wasm_bindgen]
#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum NextInputKind {
    MonMove,
    ManaMove,
    MysticAction,
    DemonAction,
    DemonAdditionalStep,
    SpiritTargetCapture,
    SpiritTargetMove,
    SelectConsumable,
    BombAttack,
}

#[derive(Debug, PartialEq, Eq, Hash, Clone)]
pub(crate) struct NextInput {
    pub(crate) input: Input,
    pub(crate) kind: NextInputKind,
    pub(crate) actor_mon_item: Option<Item>,
}

impl NextInput {
    pub fn new(input: Input, kind: NextInputKind, actor_mon_item: Option<Item>) -> Self {
        Self {
            input,
            kind,
            actor_mon_item,
        }
    }
}
