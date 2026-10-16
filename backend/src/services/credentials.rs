use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

pub fn encrypt(secret: &str, key: &[u8; 32]) -> Result<String, ()> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
    let mut nonce = [0_u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), secret.as_bytes())
        .map_err(|_| ())?;
    let mut payload = nonce.to_vec();
    payload.extend(ciphertext);
    Ok(format!("v1:{}", hex::encode(payload)))
}

pub fn decrypt(encrypted: &str, key: &[u8; 32]) -> Result<String, ()> {
    let payload = hex::decode(encrypted.strip_prefix("v1:").ok_or(())?).map_err(|_| ())?;
    if payload.len() < 12 {
        return Err(());
    }
    let (nonce, ciphertext) = payload.split_at(12);
    let plaintext = Aes256Gcm::new_from_slice(key)
        .map_err(|_| ())?
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| ())?;
    String::from_utf8(plaintext).map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::{decrypt, encrypt};

    #[test]
    fn credentials_are_encrypted_and_round_trip() {
        let key = [7_u8; 32];
        let encrypted = encrypt("meta-access-token", &key).expect("encrypt token");
        assert!(!encrypted.contains("meta-access-token"));
        assert_eq!(
            decrypt(&encrypted, &key).expect("decrypt with original key"),
            "meta-access-token"
        );
        assert!(decrypt(&encrypted, &[8_u8; 32]).is_err());
    }
}
