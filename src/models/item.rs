use crate::*;

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub(crate) enum Item {
    Mon { mon: Mon },
    Mana { mana: Mana },
    MonWithMana { mon: Mon, mana: Mana },
    MonWithConsumable { mon: Mon, consumable: Consumable },
    Consumable { consumable: Consumable },
}

impl Item {
    #[inline]
    pub fn mon(&self) -> Option<&Mon> {
        match self {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => Some(mon),
            _ => None,
        }
    }

    #[inline]
    pub fn mana(&self) -> Option<&Mana> {
        match self {
            Item::Mana { mana } | Item::MonWithMana { mana, .. } => Some(mana),
            _ => None,
        }
    }

    #[inline]
    pub fn consumable(&self) -> Option<&Consumable> {
        match self {
            Item::MonWithConsumable { consumable, .. } | Item::Consumable { consumable } => {
                Some(consumable)
            }
            _ => None,
        }
    }
}
