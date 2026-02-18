use crate::connection_file::ConnectionFile;
use crate::error::KernelError;
use std::path::PathBuf;
use tokio::process::{Child, Command};
use uuid::Uuid;

pub async fn launch() -> Result<(Child, ConnectionFile, PathBuf), KernelError> {
    let connection_file_path =
        std::env::temp_dir().join(format!("crab-collab-kernel-{}.json", Uuid::new_v4()));

    let connection_file = ConnectionFile::new_with_random_ports();
    let json = serde_json::to_string_pretty(&connection_file)?;
    tokio::fs::write(&connection_file_path, &json).await?;

    let child = spawn_kernel(&connection_file_path)?;

    // Wait for kernel to start (it needs time to bind sockets)
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    Ok((child, connection_file, connection_file_path))
}

/// Relaunch a kernel using the same connection file (same ports).
pub async fn relaunch(connection_file_path: &PathBuf) -> Result<Child, KernelError> {
    let child = spawn_kernel(connection_file_path)?;
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    Ok(child)
}

fn spawn_kernel(connection_file_path: &PathBuf) -> Result<Child, KernelError> {
    let child = Command::new("python3")
        .args([
            "-m",
            "ipykernel_launcher",
            "-f",
            connection_file_path.to_str().unwrap(),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    Ok(child)
}
