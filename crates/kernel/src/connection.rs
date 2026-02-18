use crate::connection_file::ConnectionFile;
use crate::error::KernelError;
use crate::message::*;
use bytes::Bytes;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use tokio::sync::Mutex;
use zeromq::{Socket, SocketRecv, SocketSend, ZmqMessage};

pub struct KernelConnection {
    shell: Mutex<zeromq::DealerSocket>,
    iopub: Mutex<zeromq::SubSocket>,
    control: Mutex<zeromq::DealerSocket>,
    hb: Mutex<zeromq::ReqSocket>,
    signer: MessageSigner,
}

impl KernelConnection {
    pub async fn connect(connection_file: &ConnectionFile) -> Result<Self, KernelError> {
        tracing::info!("Connecting to kernel at {}", connection_file.host);

        let mut shell = zeromq::DealerSocket::new();
        shell.connect(&connection_file.shell_endpoint()).await?;

        let mut iopub = zeromq::SubSocket::new();
        iopub.connect(&connection_file.iopub_endpoint()).await?;
        iopub.subscribe("").await?; // Subscribe to all topics

        let mut control = zeromq::DealerSocket::new();
        control.connect(&connection_file.control_endpoint()).await?;

        let mut hb = zeromq::ReqSocket::new();
        hb.connect(&connection_file.hb_endpoint()).await?;

        let signer = MessageSigner::new(&connection_file.key);

        Ok(Self {
            shell: Mutex::new(shell),
            iopub: Mutex::new(iopub),
            control: Mutex::new(control),
            hb: Mutex::new(hb),
            signer,
        })
    }

    pub async fn send_shell(&self, msg: JupyterMessage) -> Result<(), KernelError> {
        let frames = self.serialize_message(msg)?; // Vec<Vec<u8>>
        let mut shell = self.shell.lock().await;
        shell.send(frames).await?;
        Ok(())
    }

    pub async fn recv_iopub(&self) -> Result<JupyterMessage, KernelError> {
        let mut iopub = self.iopub.lock().await;
        let msg = iopub.recv().await?;
        drop(iopub); // Release lock before deserialization
        self.deserialize_message(msg)
    }

    pub async fn send_control(&self, msg: JupyterMessage) -> Result<(), KernelError> {
        let frames = self.serialize_message(msg)?;
        let mut control = self.control.lock().await;
        control.send(frames).await?;
        Ok(())
    }

    pub async fn heartbeat(&self) -> Result<(), KernelError> {
        let mut hb = self.hb.lock().await;
        hb.send(b"ping".to_vec().into()).await?;
        hb.recv().await?;
        Ok(())
    }

    fn serialize_message(&self, msg: JupyterMessage) -> Result<ZmqMessage, KernelError> {
        let header = serde_json::to_vec(&msg.header)?;
        // Jupyter protocol requires empty dict {}, not null, for missing parent_header
        let parent_header = match &msg.parent_header {
            Some(ph) => serde_json::to_vec(ph)?,
            None => b"{}".to_vec(),
        };
        let metadata = serde_json::to_vec(&msg.metadata)?;
        let content = msg.content.serialize()?;

        let signature = self
            .signer
            .sign(&[&header, &parent_header, &metadata, &content]);

        to_zmq_message(vec![
            b"<IDS|MSG>".to_vec(),
            signature.into_bytes(),
            header,
            parent_header,
            metadata,
            content,
        ])
    }

    fn deserialize_message(&self, frames: ZmqMessage) -> Result<JupyterMessage, KernelError> {
        let frames: Vec<_> = frames.iter().collect();

        let delim_pos = frames
            .iter()
            .position(|f| f.as_ref() == b"<IDS|MSG>")
            .ok_or(KernelError::InvalidMessage("No delimiter".into()))?;

        // Frames after delimiter:
        // [signature, header, parent_header, metadata, content]
        let after_delim = &frames[delim_pos + 1..];

        if after_delim.len() < 5 {
            return Err(KernelError::InvalidMessage(
                "Insufficient frames after delimiter".into()
            ));
        }
        let signature = std::str::from_utf8(&after_delim[0])
            .map_err(|_| KernelError::InvalidMessage("Invalid signature encoding".into()))?;

        let message_parts: Vec<&[u8]> = after_delim[1..5]
            .iter()
            .map(|bytes| bytes.as_ref())
            .collect();
        if !self.signer.verify(&message_parts, signature) {
            return Err(KernelError::InvalidSignature);
        }

        let header: Header = serde_json::from_slice(&after_delim[1])?;
        let parent_header: Option<Header> = serde_json::from_slice(&after_delim[2]).ok();
        let metadata = serde_json::from_slice(&after_delim[3])?;
        let content = MessageContent::deserialize(&header.msg_type, &after_delim[4])?;

        Ok(JupyterMessage {
            header,
            parent_header,
            metadata,
            content,
        })
    }
}

fn to_zmq_message(frames: Vec<Vec<u8>>) -> Result<ZmqMessage, KernelError> {
    let mut frames_iter = frames.into_iter();
    let first_frame = frames_iter.next().ok_or(KernelError::EmptyMessage)?;
    let mut zmq_message = ZmqMessage::from(Bytes::from(first_frame));
    for frame in frames_iter {
        zmq_message.push_back(Bytes::from(frame));
    }
    Ok(zmq_message)
}

pub struct MessageSigner {
    key: Vec<u8>,
}

impl MessageSigner {
    pub fn new(key: &str) -> Self {
        Self {
            key: key.as_bytes().to_vec(),
        }
    }

    pub fn sign(&self, parts: &[&[u8]]) -> String {
        let mut mac =
            Hmac::<Sha256>::new_from_slice(&self.key).expect("HMAC can take key of any size");

        for part in parts {
            mac.update(part);
        }

        hex::encode(mac.finalize().into_bytes())
    }

    pub fn verify(&self, parts: &[&[u8]], signature: &str) -> bool {
        let expected = self.sign(parts);
        expected == signature
    }
}
