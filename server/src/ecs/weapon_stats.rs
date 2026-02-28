use super::components::{ArmorType, CombatPower, WeaponType, Armor};

/// Returns the full CombatPower for a given weapon type.
pub fn weapon_stats(weapon: WeaponType) -> CombatPower {
    match weapon {
        WeaponType::ProcessTerminator => CombatPower {
            base_damage: 8,
            attack_speed: 1.0,
            weapon: WeaponType::ProcessTerminator,
            cooldown_ticks: 6,
            cooldown_remaining: 0,
            range: 30.0,
            arc_degrees: 90.0,
            is_projectile: false,
        },
        WeaponType::HardReset => CombatPower {
            base_damage: 24,
            attack_speed: 1.0,
            weapon: WeaponType::HardReset,
            cooldown_ticks: 20,
            cooldown_remaining: 0,
            range: 35.0,
            arc_degrees: 180.0,
            is_projectile: false,
        },
        WeaponType::SignalJammer => CombatPower {
            base_damage: 14,
            attack_speed: 1.0,
            weapon: WeaponType::SignalJammer,
            cooldown_ticks: 12,
            cooldown_remaining: 0,
            range: 40.0,
            arc_degrees: 120.0,
            is_projectile: false,
        },
        WeaponType::NullPointer => CombatPower {
            base_damage: 16,
            attack_speed: 1.0,
            weapon: WeaponType::NullPointer,
            cooldown_ticks: 16,
            cooldown_remaining: 0,
            range: 120.0,
            arc_degrees: 0.0,
            is_projectile: true,
        },
        WeaponType::Flare => CombatPower {
            base_damage: 10,
            attack_speed: 1.0,
            weapon: WeaponType::Flare,
            cooldown_ticks: 10,
            cooldown_remaining: 0,
            range: 25.0,
            arc_degrees: 360.0,
            is_projectile: false,
        },
    }
}

/// Returns the full Armor stats for a given armor type.
pub fn armor_stats(armor: ArmorType) -> Armor {
    match armor {
        ArmorType::BasePrompt => Armor {
            armor_type: ArmorType::BasePrompt,
            damage_reduction: 2.0,
            speed_penalty: 0.0,
        },
        ArmorType::FewShotPadding => Armor {
            armor_type: ArmorType::FewShotPadding,
            damage_reduction: 5.0,
            speed_penalty: 0.0,
        },
        ArmorType::ChainOfThoughtMail => Armor {
            armor_type: ArmorType::ChainOfThoughtMail,
            damage_reduction: 10.0,
            speed_penalty: 0.10,
        },
        ArmorType::ConstitutionalPlate => Armor {
            armor_type: ArmorType::ConstitutionalPlate,
            damage_reduction: 18.0,
            speed_penalty: 0.25,
        },
    }
}

/// Maps client weapon IDs to server WeaponType.
pub fn weapon_from_id(id: &str) -> Option<WeaponType> {
    match id {
        "shortsword" => Some(WeaponType::ProcessTerminator),
        "greatsword" => Some(WeaponType::HardReset),
        "staff" => Some(WeaponType::SignalJammer),
        "crossbow" => Some(WeaponType::NullPointer),
        "torch" => Some(WeaponType::Flare),
        _ => None,
    }
}

/// Maps client armor IDs to server ArmorType.
pub fn armor_from_id(id: &str) -> Option<ArmorType> {
    match id {
        "cloth" => Some(ArmorType::BasePrompt),
        "leather" => Some(ArmorType::FewShotPadding),
        "chain" => Some(ArmorType::ChainOfThoughtMail),
        "plate" => Some(ArmorType::ConstitutionalPlate),
        _ => None,
    }
}
