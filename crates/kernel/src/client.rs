use crate::connection::KernelConnection;
use crate::error::KernelError;
use crate::launcher;
use crate::message::{
    DisplayDataContent, ErrorContent, ExecuteRequestContent, ExecuteResultContent, ExecutionStatus,
    InterruptRequestContent, JupyterMessage, KernelState, MessageContent, OutputData,
    ShutdownRequestContent, StatusContent, StreamContent, StreamName,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::mpsc;
use tokio::sync::mpsc::Receiver;
use tokio::sync::mpsc::Sender;
use uuid::Uuid;

/// Main client for interacting with a Jupyter Python kernel.
///
/// The `JupyterClient` manages the lifecycle of a kernel process and provides
/// a high-level API for code execution. Outputs are delivered asynchronously
/// via an MPSC channel.
pub struct JupyterClient {
    connection: Arc<KernelConnection>,
    kernel_process: Child,
    connection_file: crate::connection_file::ConnectionFile,
    connection_file_path: PathBuf,
    output_tx: Sender<KernelOutput>,
    output_rx: Receiver<KernelOutput>,
}

/// Output from the Jupyter kernel.
#[derive(Debug, Clone)]
pub struct KernelOutput {
    pub message_id: String,
    pub parent_id: Option<String>,
    pub output: OutputEvent,
}

#[derive(Debug, Clone)]
pub enum OutputEvent {
    /// stdout/stderr from print(), etc.
    Stream { name: StreamName, text: String },

    /// Result of expression evaluation
    ExecuteResult {
        execution_count: u32,
        data: OutputData,
    },

    /// Display data (plots, images, etc.)
    DisplayData { data: OutputData },

    /// Execution error
    Error {
        ename: String,
        evalue: String,
        traceback: Vec<String>,
    },

    /// Kernel status changed
    Status { state: KernelState },

    /// Execution finished
    ExecutionFinished {
        execution_count: u32,
        status: ExecutionStatus,
    },
}

impl JupyterClient {
    /// Launch a new Python kernel and connect to it.
    pub async fn new() -> Result<Self, KernelError> {
        let (child, connection_file, connection_file_path) = launcher::launch().await?;

        let connection = KernelConnection::connect(&connection_file).await?;

        let (tx, rx) = mpsc::channel(256);

        let client = Self {
            connection: Arc::new(connection),
            kernel_process: child,
            connection_file,
            connection_file_path,
            output_tx: tx.clone(),
            output_rx: rx,
        };

        tokio::spawn(iopub_listener(Arc::clone(&client.connection), tx));

        Ok(client)
    }

    /// Get a mutable reference to the output channel.
    ///
    /// Use this to receive kernel outputs asynchronously.
    pub fn output_channel(&mut self) -> &mut Receiver<KernelOutput> {
        &mut self.output_rx
    }

    /// Execute code in a cell.
    /// Returns immediately - outputs arrive via broadcast channel
    pub async fn execute_code(&mut self, code: &str) -> Result<String, KernelError> {
        let id = Uuid::new_v4().to_string();
        self.connection
            .send_shell(JupyterMessage::new(
                &id,
                "execute_request",
                MessageContent::ExecuteRequest(ExecuteRequestContent {
                    code: code.to_string(),
                    silent: false,
                    store_history: false,
                    allow_stdin: false,
                    stop_on_error: false,
                }),
            ))
            .await?;
        Ok(id)
    }

    /// Interrupt running execution (Ctrl+C equivalent)
    pub async fn interrupt(&self) -> Result<String, KernelError> {
        let id = Uuid::new_v4().to_string();
        self.connection
            .send_control(JupyterMessage::new(
                &id,
                "interrupt_request",
                MessageContent::InterruptRequest(InterruptRequestContent {}),
            ))
            .await?;
        Ok(id)
    }

    /// Restart kernel (clears all variables).
    ///
    /// Sends a shutdown request, waits for the process to exit,
    /// then relaunches a new kernel on the same ports with a fresh connection.
    pub async fn restart(&mut self) -> Result<(), KernelError> {
        // Ask the kernel to shut down
        let id = Uuid::new_v4().to_string();
        let _ = self
            .connection
            .send_control(JupyterMessage::new(
                &id,
                "shutdown_request",
                MessageContent::ShutdownRequest(ShutdownRequestContent { restart: true }),
            ))
            .await;

        // Wait for the kernel process to exit
        let _ = tokio::time::timeout(
            tokio::time::Duration::from_secs(5),
            self.kernel_process.wait(),
        )
        .await;

        // Kill it if it's still alive
        let _ = self.kernel_process.kill().await;

        // Relaunch a new kernel on the same ports
        self.kernel_process = launcher::relaunch(&self.connection_file_path).await?;

        // Create a fresh connection (old ZMQ sockets may be in a bad state)
        let connection = KernelConnection::connect(&self.connection_file).await?;
        self.connection = Arc::new(connection);

        // Spawn a new iopub listener with the new connection
        tokio::spawn(iopub_listener(
            Arc::clone(&self.connection),
            self.output_tx.clone(),
        ));

        Ok(())
    }

    /// Check if kernel is alive
    pub async fn is_alive(&self) -> bool {
        self.connection.heartbeat().await.is_ok()
    }
}

async fn iopub_listener(connection: Arc<KernelConnection>, output_tx: Sender<KernelOutput>) {
    loop {
        match connection.recv_iopub().await {
            Err(_) => continue,
            Ok(msg) => {
                let event: OutputEvent = match msg.content {
                    MessageContent::ExecuteResult(ExecuteResultContent {
                        execution_count,
                        data,
                        ..
                    }) => OutputEvent::ExecuteResult {
                        execution_count,
                        data,
                    },
                    MessageContent::Stream(StreamContent { name, text }) => {
                        OutputEvent::Stream { name, text }
                    }
                    MessageContent::DisplayData(DisplayDataContent { data, .. }) => {
                        OutputEvent::DisplayData { data }
                    }
                    MessageContent::Error(ErrorContent {
                        ename,
                        evalue,
                        traceback,
                    }) => OutputEvent::Error {
                        ename,
                        evalue,
                        traceback,
                    },
                    MessageContent::Status(StatusContent { execution_state }) => {
                        OutputEvent::Status {
                            state: execution_state,
                        }
                    }
                    _ => continue,
                };
                let _ = output_tx
                    .send(KernelOutput {
                        message_id: msg.header.msg_id,
                        parent_id: msg.parent_header.map(|p| p.msg_id),
                        output: event.clone(),
                    })
                    .await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{Duration, timeout};

    /// Helper to check if Python and ipykernel are available
    fn is_jupyter_available() -> bool {
        std::process::Command::new("python3")
            .args(["-c", "import ipykernel"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[tokio::test]
    async fn test_kernel_launch() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let client = JupyterClient::new().await;
        assert!(client.is_ok(), "Failed to launch kernel");
    }

    #[tokio::test]
    async fn test_kernel_is_alive() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let client = JupyterClient::new().await.expect("Failed to launch kernel");

        // Give kernel time to start
        tokio::time::sleep(Duration::from_secs(1)).await;

        assert!(client.is_alive().await, "Kernel should be alive");
    }

    #[tokio::test]
    async fn test_execute_simple_code() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");

        // Give kernel time to start
        tokio::time::sleep(Duration::from_secs(1)).await;

        let msg_id = client
            .execute_code("print('hello')")
            .await
            .expect("Failed to execute code");

        // Should receive output within 5 seconds
        let output_rx = client.output_channel();
        let result = timeout(Duration::from_secs(5), output_rx.recv()).await;

        assert!(result.is_ok(), "Should receive output within timeout");

        let output = result.unwrap();
        assert!(output.is_some(), "Should receive some output");

        let kernel_output = output.unwrap();
        assert_eq!(
            kernel_output.parent_id,
            Some(msg_id),
            "Output should have correct parent_id"
        );
    }

    #[tokio::test]
    async fn test_execute_with_output() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        let msg_id = client
            .execute_code("print('test output')")
            .await
            .expect("Failed to execute code");

        let output_rx = client.output_channel();

        // Collect outputs for up to 5 seconds
        let mut outputs = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);

        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(100), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                        outputs.push(output.clone());
                        // Look for stream output
                        if matches!(output.output, OutputEvent::Stream { .. }) {
                            break;
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        // Should have received at least one output
        assert!(!outputs.is_empty(), "Should receive at least one output");

        // Check if we got stream output
        let has_stream = outputs
            .iter()
            .any(|o| matches!(o.output, OutputEvent::Stream { .. }));
        assert!(
            has_stream,
            "Should receive stream output from print statement"
        );
    }

    #[tokio::test]
    async fn test_execute_with_result() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        let msg_id = client
            .execute_code("2 + 2")
            .await
            .expect("Failed to execute code");

        let output_rx = client.output_channel();

        let mut outputs = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);

        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(100), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                        outputs.push(output.clone());
                        if matches!(output.output, OutputEvent::ExecuteResult { .. }) {
                            break;
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        let has_result = outputs
            .iter()
            .any(|o| matches!(o.output, OutputEvent::ExecuteResult { .. }));
        assert!(has_result, "Should receive execute result for expression");
    }

    #[tokio::test]
    async fn test_execute_with_error() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        let msg_id = client
            .execute_code("1 / 0")
            .await
            .expect("Failed to execute code");

        let output_rx = client.output_channel();

        let mut outputs = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);

        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(100), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                        outputs.push(output.clone());
                        if matches!(output.output, OutputEvent::Error { .. }) {
                            break;
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        let has_error = outputs.iter().any(|o| {
            if let OutputEvent::Error { ename, .. } = &o.output {
                ename == "ZeroDivisionError"
            } else {
                false
            }
        });
        assert!(has_error, "Should receive error for division by zero");
    }

    #[tokio::test]
    async fn test_kernel_status_changes() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        client
            .execute_code("import time; time.sleep(0.1)")
            .await
            .expect("Failed to execute code");

        let output_rx = client.output_channel();

        let mut statuses = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);

        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(100), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if let OutputEvent::Status { state } = output.output {
                        statuses.push(state.clone());
                        if matches!(state, KernelState::Idle) && statuses.len() > 1 {
                            break;
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        // Should see kernel go busy then idle
        assert!(statuses.len() >= 2, "Should see multiple status changes");
        assert!(
            statuses.iter().any(|s| matches!(s, KernelState::Busy)),
            "Should see busy status"
        );
        assert!(
            statuses.iter().any(|s| matches!(s, KernelState::Idle)),
            "Should see idle status"
        );
    }

    #[tokio::test]
    async fn test_multiple_executions() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        // Execute multiple times
        let msg_id1 = client
            .execute_code("x = 1")
            .await
            .expect("Failed to execute");
        let msg_id2 = client
            .execute_code("y = 2")
            .await
            .expect("Failed to execute");
        let msg_id3 = client
            .execute_code("x + y")
            .await
            .expect("Failed to execute");

        assert_ne!(msg_id1, msg_id2, "Message IDs should be unique");
        assert_ne!(msg_id2, msg_id3, "Message IDs should be unique");

        // Should receive outputs for all executions
        let output_rx = client.output_channel();
        let mut received_ids = std::collections::HashSet::new();

        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(100), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if let Some(parent) = output.parent_id {
                        received_ids.insert(parent);
                    }
                    if received_ids.len() >= 3 {
                        break;
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        assert!(
            received_ids.contains(&msg_id1),
            "Should receive output for first execution"
        );
        assert!(
            received_ids.contains(&msg_id2),
            "Should receive output for second execution"
        );
        assert!(
            received_ids.contains(&msg_id3),
            "Should receive output for third execution"
        );
    }

    #[tokio::test]
    async fn test_kernel_restart() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        // Set a variable
        client
            .execute_code("test_var = 42")
            .await
            .expect("Failed to execute");
        tokio::time::sleep(Duration::from_secs(1)).await;

        // Restart kernel
        client.restart().await.expect("Failed to restart");

        // Wait for the new kernel to be ready by checking iopub for status messages
        tokio::time::sleep(Duration::from_secs(2)).await;

        // Drain any stale messages from shutdown/startup
        {
            let output_rx = client.output_channel();
            loop {
                match timeout(Duration::from_millis(200), output_rx.recv()).await {
                    Ok(Some(_)) => continue,
                    _ => break,
                }
            }
        }

        // Variable should be gone after restart
        let msg_id = client
            .execute_code("test_var")
            .await
            .expect("Failed to execute after restart");

        let output_rx = client.output_channel();
        let mut has_name_error = false;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(200), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                        if let OutputEvent::Error { ename, .. } = &output.output {
                            if ename == "NameError" {
                                has_name_error = true;
                                break;
                            }
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        assert!(has_name_error, "Variable should not exist after restart");
    }

    #[tokio::test]
    async fn test_interrupt() {
        if !is_jupyter_available() {
            eprintln!("Skipping test: Python/ipykernel not available");
            return;
        }

        let mut client = JupyterClient::new().await.expect("Failed to launch kernel");
        tokio::time::sleep(Duration::from_secs(1)).await;

        // Start a long-running execution
        let msg_id = client
            .execute_code("import time; time.sleep(30)")
            .await
            .expect("Failed to execute code");

        // Wait for kernel to become busy
        {
            let output_rx = client.output_channel();
            let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
            while tokio::time::Instant::now() < deadline {
                match timeout(Duration::from_millis(100), output_rx.recv()).await {
                    Ok(Some(output)) => {
                        if let OutputEvent::Status {
                            state: KernelState::Busy,
                        } = &output.output
                        {
                            break;
                        }
                    }
                    _ => continue,
                }
            }
        }

        // Send interrupt
        client.interrupt().await.expect("Failed to interrupt");

        // Should receive a KeyboardInterrupt error
        let mut was_interrupted = false;
        {
            let output_rx = client.output_channel();
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            while tokio::time::Instant::now() < deadline {
                match timeout(Duration::from_millis(200), output_rx.recv()).await {
                    Ok(Some(output)) => {
                        if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                            if let OutputEvent::Error { ename, .. } = &output.output {
                                if ename == "KeyboardInterrupt" {
                                    was_interrupted = true;
                                    break;
                                }
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(_) => continue,
                }
            }
        }

        assert!(
            was_interrupted,
            "Should receive KeyboardInterrupt after interrupt"
        );

        // Kernel should still be usable after interrupt
        let msg_id = client
            .execute_code("1 + 1")
            .await
            .expect("Failed to execute after interrupt");

        let output_rx = client.output_channel();
        let mut got_result = false;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        while tokio::time::Instant::now() < deadline {
            match timeout(Duration::from_millis(200), output_rx.recv()).await {
                Ok(Some(output)) => {
                    if output.parent_id.as_deref() == Some(msg_id.as_str()) {
                        if matches!(output.output, OutputEvent::ExecuteResult { .. }) {
                            got_result = true;
                            break;
                        }
                    }
                }
                Ok(None) => break,
                Err(_) => continue,
            }
        }

        assert!(got_result, "Kernel should still work after interrupt");
    }
}
