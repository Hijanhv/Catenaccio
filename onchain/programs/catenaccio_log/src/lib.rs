//! Catenaccio decision-log anchor — OPTIONAL.
//!
//! This is the *entire* amount of Rust the project needs, and it is optional:
//! the app already anchors its decision-log Merkle root on-chain via the standard
//! SPL Memo program (zero Rust), and verifies TxLINE data via TxODDS's existing
//! `Txoracle` program (zero Rust). Deploy this only if you want a dedicated,
//! queryable on-chain account that stores the latest root + a monotonic counter
//! — a slightly more "productionised" audit anchor than a memo.
//!
//! One PDA, one instruction. ~50 lines. Anchor 0.30+.

use anchor_lang::prelude::*;

declare_id!("Catenacc1oLog11111111111111111111111111111");

#[program]
pub mod catenaccio_log {
    use super::*;

    /// Commit the latest 32-byte Merkle root of the agent's decision log.
    /// Each call bumps `count`, giving an immutable, ordered, on-chain trail.
    pub fn commit_root(ctx: Context<CommitRoot>, root: [u8; 32]) -> Result<()> {
        let log = &mut ctx.accounts.log;
        log.authority = ctx.accounts.authority.key();
        log.latest_root = root;
        log.count = log.count.checked_add(1).ok_or(LogError::Overflow)?;
        log.updated_at = Clock::get()?.unix_timestamp;
        emit!(RootCommitted { root, count: log.count });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CommitRoot<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + DecisionLog::SIZE,
        seeds = [b"decision_log", authority.key().as_ref()],
        bump
    )]
    pub log: Account<'info, DecisionLog>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct DecisionLog {
    pub authority: Pubkey,    // 32
    pub latest_root: [u8; 32], // 32
    pub count: u64,            // 8
    pub updated_at: i64,       // 8
}
impl DecisionLog {
    pub const SIZE: usize = 32 + 32 + 8 + 8;
}

#[event]
pub struct RootCommitted {
    pub root: [u8; 32],
    pub count: u64,
}

#[error_code]
pub enum LogError {
    #[msg("counter overflow")]
    Overflow,
}
