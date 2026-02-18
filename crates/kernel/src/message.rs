use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct JupyterMessage {
    pub header: Header,
    pub parent_header: Option<Header>,
    pub metadata: serde_json::Value,
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Header {
    pub msg_id: String,
    pub session: String,
    pub username: String,
    pub date: String, // ISO 8601 timestamp
    pub msg_type: String,
    pub version: String,
}

#[derive(Debug, Clone)]
pub enum MessageContent {
    ExecuteRequest(ExecuteRequestContent),
    ExecuteReply(ExecuteReplyContent),
    ExecuteInput(ExecuteInputContent),
    ExecuteResult(ExecuteResultContent),
    Stream(StreamContent),
    DisplayData(DisplayDataContent),
    Error(ErrorContent),
    Status(StatusContent),
    ShutdownRequest(ShutdownRequestContent),
    ShutdownReply(ShutdownReplyContent),
    InterruptRequest(InterruptRequestContent),
    InterruptReply(InterruptReplyContent),
    /// Catch-all for unused and unknown messages from the protocol
    Unknown(serde_json::Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteRequestContent {
    pub code: String,
    pub silent: bool,
    pub store_history: bool,
    pub allow_stdin: bool,
    pub stop_on_error: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteReplyContent {
    pub status: ExecutionStatus,
    pub execution_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteInputContent {
    pub code: String,
    pub execution_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteResultContent {
    pub execution_count: u32,
    pub data: OutputData,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamContent {
    pub name: StreamName,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayDataContent {
    pub data: OutputData,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContent {
    pub ename: String,
    pub evalue: String,
    pub traceback: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusContent {
    pub execution_state: KernelState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownRequestContent {
    pub restart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptRequestContent {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShutdownReplyContent {
    pub status: ExecutionStatus,
    pub restart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptReplyContent {
    pub status: ExecutionStatus,
}

impl MessageContent {
    pub fn serialize(&self) -> Result<Vec<u8>, serde_json::Error> {
        match self {
            MessageContent::ExecuteRequest(c) => serde_json::to_vec(c),
            MessageContent::ExecuteReply(c) => serde_json::to_vec(c),
            MessageContent::ExecuteInput(c) => serde_json::to_vec(c),
            MessageContent::ExecuteResult(c) => serde_json::to_vec(c),
            MessageContent::Stream(c) => serde_json::to_vec(c),
            MessageContent::DisplayData(c) => serde_json::to_vec(c),
            MessageContent::Error(c) => serde_json::to_vec(c),
            MessageContent::Status(c) => serde_json::to_vec(c),
            MessageContent::ShutdownRequest(c) => serde_json::to_vec(c),
            MessageContent::ShutdownReply(c) => serde_json::to_vec(c),
            MessageContent::InterruptRequest(c) => serde_json::to_vec(c),
            MessageContent::InterruptReply(c) => serde_json::to_vec(c),
            MessageContent::Unknown(v) => serde_json::to_vec(v),
        }
    }

    pub fn deserialize(msg_type: &str, raw: &[u8]) -> Result<Self, serde_json::Error> {
        match msg_type {
            "execute_request" => Ok(Self::ExecuteRequest(serde_json::from_slice(raw)?)),
            "execute_reply" => Ok(Self::ExecuteReply(serde_json::from_slice(raw)?)),
            "execute_input" => Ok(Self::ExecuteInput(serde_json::from_slice(raw)?)),
            "execute_result" => Ok(Self::ExecuteResult(serde_json::from_slice(raw)?)),
            "stream" => Ok(Self::Stream(serde_json::from_slice(raw)?)),
            "display_data" => Ok(Self::DisplayData(serde_json::from_slice(raw)?)),
            "error" => Ok(Self::Error(serde_json::from_slice(raw)?)),
            "status" => Ok(Self::Status(serde_json::from_slice(raw)?)),
            "shutdown_request" => Ok(Self::ShutdownRequest(serde_json::from_slice(raw)?)),
            "shutdown_reply" => Ok(Self::ShutdownReply(serde_json::from_slice(raw)?)),
            "interrupt_request" => Ok(Self::InterruptRequest(serde_json::from_slice(raw)?)),
            "interrupt_reply" => Ok(Self::InterruptReply(serde_json::from_slice(raw)?)),
            _ => Ok(Self::Unknown(serde_json::from_slice(raw)?)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputData {
    #[serde(rename = "text/plain")]
    pub text_plain: Option<String>,

    #[serde(rename = "text/html")]
    pub text_html: Option<String>,

    #[serde(rename = "image/png")]
    pub image_png: Option<String>, // Base64 encoded

    #[serde(rename = "application/json")]
    pub application_json: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Ok,
    Error,
    Abort,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KernelState {
    Busy,
    Idle,
    Starting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamName {
    Stdout,
    Stderr,
}

lazy_static::lazy_static! {
    static ref SESSION_ID: String = Uuid::new_v4().to_string();
}

impl JupyterMessage {
    pub fn new(message_id: &str, msg_type: &str, content: MessageContent) -> Self {
        let session = SESSION_ID.clone();
        Self {
            header: Header {
                msg_id: message_id.to_string(),
                session,
                username: "crab-collab".to_string(),
                date: chrono::Utc::now().to_rfc3339(),
                msg_type: msg_type.to_string(),
                version: "5.5".to_string(),
            },
            parent_header: None,
            metadata: serde_json::Value::Object(Default::default()),
            content,
        }
    }

    pub fn reply_to(
        parent: &JupyterMessage,
        message_id: &str,
        msg_type: &str,
        content: MessageContent,
    ) -> Self {
        Self {
            header: Header {
                msg_id: message_id.to_string(),
                session: parent.header.session.clone(),
                username: "crab-collab".to_string(),
                date: chrono::Utc::now().to_rfc3339(),
                msg_type: msg_type.to_string(),
                version: "5.5".to_string(),
            },
            parent_header: Some(parent.header.clone()),
            metadata: serde_json::Value::Object(Default::default()),
            content,
        }
    }
}
