#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol,
};

const ADMIN: Symbol = symbol_short!("ADMIN");
const PENDING_ADMIN: Symbol = symbol_short!("PEND_ADM");

// Conservative TTL bump so offset records don't get archived between writes.
// Values are in ledgers (~5s each): ~6 days threshold, ~30 days bump.
const BUMP_THRESHOLD: u32 = 100_000;
const BUMP_AMOUNT: u32 = 500_000;

// Instance TTL bounds: ~6 days threshold, ~30 days bump. Instance storage holds
// the admin config, so every state-changing entrypoint must extend it to avoid
// the config being archived on a quiet deployment.
const TTL_MIN: u32 = 100_000;
const TTL_MAX: u32 = 500_000;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Offset(u64),
    Verification(u64),
    Voided(u64),
}

#[derive(Clone)]
#[contracttype]
pub struct VerifierApproval {
    pub kg_co2: u64,
    pub verifier: Address,
}

/// On-chain carbon offset certificate for a single order.
#[derive(Clone)]
#[contracttype]
pub struct CarbonOffset {
    pub order_id: u64,
    pub kg_co2: u64,
    pub offset_paid: bool,
    pub verifier: Address,
}

#[contract]
pub struct CarbonOffsetContract;

/// Extend the instance storage TTL so admin/config data is never archived.
fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_MAX);
}

#[contractimpl]
impl CarbonOffsetContract {
    fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);
    }

    fn require_positive_offset(kg_co2: u64) {
        if kg_co2 == 0 {
            panic!("kg_co2 must be positive");
        }
    }

    /// One-time setup: sets the platform admin address allowed to call `record_offset`.
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&ADMIN) {
            panic!("already initialized");
        }
        env.storage().instance().set(&ADMIN, &admin);
        Self::bump_instance_ttl(&env);
    }

    /// A verifier must authorize the exact offset amount before the platform can record it.
    pub fn authorize_offset(env: Env, order_id: u64, kg_co2: u64, verifier: Address) {
        Self::require_positive_offset(kg_co2);
        verifier.require_auth();
        let key = DataKey::Verification(order_id);
        env.storage().persistent().set(
            &key,
            &VerifierApproval {
                kg_co2,
                verifier: verifier.clone(),
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("verify")),
            (order_id, kg_co2, verifier),
        );
        bump_instance(&env);
    }

    /// Record a verified carbon offset for `order_id`. Callable only by the platform admin.
    /// Emits ("carbon", "offset", order_id, kg_co2).
    pub fn record_offset(env: Env, order_id: u64, kg_co2: u64, verifier: Address) {
        Self::require_positive_offset(kg_co2);
        let admin: Address = env.storage().instance().get(&ADMIN).expect("not initialized");
        admin.require_auth();

        let key = DataKey::Offset(order_id);
        let void_key = DataKey::Voided(order_id);
        let was_voided: bool = env.storage().persistent().get(&void_key).unwrap_or(false);
        if env.storage().persistent().has(&key) && !was_voided {
            panic!("offset already recorded for this order");
        }

        let verification_key = DataKey::Verification(order_id);
        let approval: VerifierApproval = env
            .storage()
            .persistent()
            .get(&verification_key)
            .expect("verifier approval required");
        if approval.kg_co2 != kg_co2 || approval.verifier != verifier {
            panic!("verifier approval does not match offset");
        }

        let previous: Option<CarbonOffset> = if was_voided {
            env.storage().persistent().get(&key)
        } else {
            None
        };
        let record = CarbonOffset {
            order_id,
            kg_co2,
            // Payment is not handled or verified by this contract.
            offset_paid: false,
            verifier,
        };

        // Write state before publishing the event — no external calls occur in this
        // function, so there is no reentrancy window, but this keeps the pattern
        // consistent with the escrow contracts (state settled before any side effect).
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage().persistent().remove(&verification_key);
        if was_voided {
            env.storage().persistent().remove(&void_key);
        }
        Self::bump_instance_ttl(&env);

        if let Some(previous) = previous {
            env.events().publish(
                (symbol_short!("carbon"), symbol_short!("reissued")),
                (order_id, previous.kg_co2, kg_co2, record.verifier.clone()),
            );
        }

        bump_instance(&env);

        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("offset")),
            (order_id, kg_co2),
        );
    }

    /// Public, read-only lookup of an order's carbon offset record.
    pub fn get_offset(env: Env, order_id: u64) -> Option<CarbonOffset> {
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Voided(order_id))
            .unwrap_or(false)
        {
            return None;
        }
        env.storage().persistent().get(&DataKey::Offset(order_id))
    }

    /// Amend an incorrect record. The verifier must authorize the corrected amount.
    pub fn amend_offset(env: Env, order_id: u64, kg_co2: u64, verifier: Address) {
        Self::require_positive_offset(kg_co2);
        let admin: Address = env.storage().instance().get(&ADMIN).expect("not initialized");
        admin.require_auth();
        verifier.require_auth();
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&DataKey::Voided(order_id))
            .unwrap_or(false)
        {
            panic!("cannot amend a voided offset");
        }
        let key = DataKey::Offset(order_id);
        let mut record: CarbonOffset = env
            .storage()
            .persistent()
            .get(&key)
            .expect("offset not found");
        let previous_kg_co2 = record.kg_co2;
        record.kg_co2 = kg_co2;
        record.verifier = verifier.clone();
        record.offset_paid = false;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Self::bump_instance_ttl(&env);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("amended")),
            (order_id, previous_kg_co2, kg_co2, verifier),
        );
    }

    /// Void an incorrect record so it can be reissued after a new verifier approval.
    pub fn void_offset(env: Env, order_id: u64) {
        let admin: Address = env.storage().instance().get(&ADMIN).expect("not initialized");
        admin.require_auth();
        let key = DataKey::Offset(order_id);
        if !env.storage().persistent().has(&key)
            || env
                .storage()
                .persistent()
                .get::<DataKey, bool>(&DataKey::Voided(order_id))
                .unwrap_or(false)
        {
            panic!("active offset not found");
        }
        let record: CarbonOffset = env.storage().persistent().get(&key).unwrap();
        let void_key = DataKey::Voided(order_id);
        env.storage().persistent().set(&void_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&void_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        Self::bump_instance_ttl(&env);
        env.events().publish(
            (symbol_short!("carbon"), symbol_short!("voided")),
            (order_id, record.kg_co2),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup(env: &Env) -> (Address, CarbonOffsetContractClient) {
        env.mock_all_auths();
        let contract_id = env.register(CarbonOffsetContract, ());
        let client = CarbonOffsetContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (admin, client)
    }

    #[test]
    #[should_panic(expected = "verifier approval does not match offset")]
    fn record_offset_panics_on_kg_co2_mismatch() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let verifier = Address::generate(&env);
        client.authorize_offset(&1u64, &100u64, &verifier);
        client.record_offset(&1u64, &200u64, &verifier);
    }

    #[test]
    #[should_panic(expected = "verifier approval does not match offset")]
    fn record_offset_panics_on_verifier_mismatch() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let verifier = Address::generate(&env);
        let other = Address::generate(&env);
        client.authorize_offset(&1u64, &100u64, &verifier);
        client.record_offset(&1u64, &100u64, &other);
    }

    #[test]
    #[should_panic(expected = "offset already recorded for this order")]
    fn record_offset_panics_on_duplicate_when_not_voided() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let verifier = Address::generate(&env);
        client.authorize_offset(&1u64, &100u64, &verifier);
        client.record_offset(&1u64, &100u64, &verifier);
        client.authorize_offset(&1u64, &100u64, &verifier);
        client.record_offset(&1u64, &100u64, &verifier);
    }

    #[test]
    fn record_offset_succeeds_after_void_and_overwrites_record() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let verifier = Address::generate(&env);
        client.authorize_offset(&1u64, &100u64, &verifier);
        client.record_offset(&1u64, &100u64, &verifier);

        client.void_offset(&1u64);

        client.authorize_offset(&1u64, &250u64, &verifier);
        client.record_offset(&1u64, &250u64, &verifier);

        let record = client.get_offset(&1u64).expect("offset should exist");
        assert_eq!(record.kg_co2, 250u64);
        assert_eq!(record.order_id, 1u64);
        assert_eq!(record.verifier, verifier);
    }

    #[test]
    fn instance_ttl_extended_after_initialize_and_authorize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(CarbonOffsetContract, ());
        let client = CarbonOffsetContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        let ttl_after_init = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
        assert!(ttl_after_init >= TTL_MIN);

        let verifier = Address::generate(&env);
        client.authorize_offset(&2u64, &50u64, &verifier);
        let ttl_after_auth = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
        assert!(ttl_after_auth >= TTL_MIN);
    }

    #[test]
    #[should_panic]
    fn authorize_offset_requires_verifier_auth() {
        let env = Env::default();
        // Initialize with auths, then clear so authorize_offset cannot satisfy require_auth.
        let contract_id = env.register(CarbonOffsetContract, ());
        let client = CarbonOffsetContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin);
        env.mock_auths(&[]);
        let verifier = Address::generate(&env);
        client.authorize_offset(&3u64, &10u64, &verifier);
    }
}
