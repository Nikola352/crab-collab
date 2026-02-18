use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionFile {
    pub shell_port: u16,
    pub iopub_port: u16,
    pub stdin_port: u16,
    pub control_port: u16,
    pub hb_port: u16,
    pub host: String,
    pub key: String,
    pub transport: String,
    pub signature_scheme: String,
    pub kernel_name: String,
}

impl ConnectionFile {
    pub fn new_with_random_ports() -> Self {
        Self {
            shell_port: find_free_port(),
            iopub_port: find_free_port(),
            stdin_port: find_free_port(),
            control_port: find_free_port(),
            hb_port: find_free_port(),
            host: "127.0.0.1".to_owned(),
            key: Uuid::new_v4().to_string(),
            transport: "tcp".to_owned(),
            signature_scheme: "hmac-sha256".to_owned(),
            kernel_name: "python3".to_owned(),
        }
    }

    pub fn shell_endpoint(&self) -> String {
        format!("{}://{}:{}", self.transport, self.host, self.shell_port)
    }

    pub fn iopub_endpoint(&self) -> String {
        format!("{}://{}:{}", self.transport, self.host, self.iopub_port)
    }

    pub fn control_endpoint(&self) -> String {
        format!("{}://{}:{}", self.transport, self.host, self.control_port)
    }

    pub fn hb_endpoint(&self) -> String {
        format!("{}://{}:{}", self.transport, self.host, self.hb_port)
    }
}

fn find_free_port() -> u16 {
    // Bind to port 0, OS assigns free port
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().port()
}
