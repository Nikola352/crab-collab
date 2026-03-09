use serde::{Deserialize, Serialize};

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
