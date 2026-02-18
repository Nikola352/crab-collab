use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum KernelError {
    InvalidMessage(String),
    Zmq(zeromq::ZmqError),
    Io(std::io::Error),
    Serialization(serde_json::Error),
    EmptyMessage,
}

impl Display for KernelError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            KernelError::InvalidMessage(msg) => write!(f, "Invalid message: {msg}"),
            KernelError::Zmq(e) => write!(f, "ZMQ error: {e}"),
            KernelError::Io(e) => write!(f, "IO error: {e}"),
            KernelError::Serialization(e) => write!(f, "Serialization error: {e}"),
            KernelError::EmptyMessage => write!(f, "Tried to send an empty message"),
        }
    }
}

impl Error for KernelError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            KernelError::Zmq(e) => Some(e),
            KernelError::Io(e) => Some(e),
            KernelError::Serialization(e) => Some(e),
            _ => None,
        }
    }
}

impl From<zeromq::ZmqError> for KernelError {
    fn from(e: zeromq::ZmqError) -> Self {
        KernelError::Zmq(e)
    }
}

impl From<std::io::Error> for KernelError {
    fn from(e: std::io::Error) -> Self {
        KernelError::Io(e)
    }
}

impl From<serde_json::Error> for KernelError {
    fn from(e: serde_json::Error) -> Self {
        KernelError::Serialization(e)
    }
}
