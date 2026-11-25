use std::io::{self, Read, Write};
const MAX_WORD: usize = 1024 * 1024;
const MAX_WORDS: usize = 4096;
fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid RouterOS API frame")
}
fn write_len(w: &mut impl Write, n: usize) -> io::Result<()> {
    if n > MAX_WORD {
        return Err(invalid());
    }
    if n < 0x80 {
        w.write_all(&[n as u8])
    } else if n < 0x4000 {
        w.write_all(&((n as u16) | 0x8000).to_be_bytes())
    } else {
        let b = ((n as u32) | 0xc00000).to_be_bytes();
        w.write_all(&b[1..])
    }
}
fn byte(r: &mut impl Read) -> io::Result<usize> {
    let mut b = [0];
    r.read_exact(&mut b)?;
    Ok(b[0] as usize)
}
fn read_len(r: &mut impl Read) -> io::Result<usize> {
    let b = byte(r)?;
    let n = if b < 0x80 {
        b
    } else if b < 0xc0 {
        ((b & 0x3f) << 8) | byte(r)?
    } else if b < 0xe0 {
        ((b & 0x1f) << 16) | (byte(r)? << 8) | byte(r)?
    } else {
        return Err(invalid());
    };
    if n > MAX_WORD {
        Err(invalid())
    } else {
        Ok(n)
    }
}
pub fn send(w: &mut impl Write, words: &[&str]) -> io::Result<()> {
    if words.len() > MAX_WORDS || words.iter().any(|s| s.is_empty() || s.len() > MAX_WORD) {
        return Err(invalid());
    }
    for s in words {
        write_len(w, s.len())?;
        w.write_all(s.as_bytes())?;
    }
    write_len(w, 0)?;
    w.flush()
}
pub fn receive(r: &mut impl Read) -> io::Result<Vec<String>> {
    let mut words = Vec::new();
    let mut total = 0;
    loop {
        let n = read_len(r)?;
        if n == 0 {
            return Ok(words);
        }
        total += n;
        if words.len() >= MAX_WORDS || total > 4 * MAX_WORD {
            return Err(invalid());
        }
        let mut buf = vec![0; n];
        r.read_exact(&mut buf)?;
        words.push(String::from_utf8(buf).map_err(|_| invalid())?);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip() {
        for n in [1, 127, 128, 16383, 16384, MAX_WORD] {
            let s = "x".repeat(n);
            let mut buf = Vec::new();
            send(&mut buf, &[&s]).unwrap();
            assert_eq!(receive(&mut &buf[..]).unwrap(), vec![s]);
        }
    }
    #[test]
    fn truncated() {
        assert!(receive(&mut &[3, b'a'][..]).is_err());
    }
    #[test]
    fn invalid_prefix() {
        assert!(receive(&mut &[0xf8][..]).is_err());
    }
}
