use kernel::error::KernelError;
use notebook::notebook::CellId;
use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum ExecutionError {
    KernelError(KernelError),
    AlreadyQueued(CellId),
}

impl Display for ExecutionError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match &self {
            ExecutionError::KernelError(err) => write!(f, "Kernel error: {err}"),
            ExecutionError::AlreadyQueued(id) => {
                write!(f, "Execution already queued for cell: {id}")
            }
        }
    }
}

impl Error for ExecutionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            ExecutionError::KernelError(e) => Some(e),
            _ => None,
        }
    }
}

impl From<KernelError> for ExecutionError {
    fn from(e: KernelError) -> Self {
        ExecutionError::KernelError(e)
    }
}
