pub struct OTError;

impl From<operational_transform::OTError> for OTError {
    fn from(_: operational_transform::OTError) -> Self {
        OTError
    }
}
