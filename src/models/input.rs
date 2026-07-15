use crate::*;

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy, PartialOrd, Ord)]
pub(crate) enum Input {
    Takeback,
    Location(Location),
    Modifier(Modifier),
}

#[wasm_bindgen]
#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy, PartialOrd, Ord)]
pub enum Modifier {
    SelectPotion,
    SelectBomb,
    Cancel,
}
