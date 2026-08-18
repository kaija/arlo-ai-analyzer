use crate::model::{Session, ToolKind};
use anyhow::Result;

pub trait UsageSource {
    fn tool(&self) -> ToolKind;
    fn scan(&self) -> Result<Vec<Session>>;
}
