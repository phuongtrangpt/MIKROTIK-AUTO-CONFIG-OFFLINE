mod codec;

use native_tls::{Certificate, Protocol, TlsConnector, TlsStream};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::{self, Read, Write},
    net::{IpAddr, SocketAddr, TcpStream},
    time::{Duration, Instant},
};
use zeroize::ZeroizeOnDrop;

const TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REPLY_ROWS: usize = 2048;
const MAX_REPLY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    host: String,
    port: u16,
    username: String,
    password: String,
    tls: bool,
    tls_name: String,
    ca_pem: String,
}

#[derive(Deserialize, ZeroizeOnDrop)]
pub struct Backup {
    name: String,
    password: String,
}

type Row = BTreeMap<String, String>;
type Result<T> = std::result::Result<T, String>;

trait Transport: Read + Write {
    fn tcp(&self) -> &TcpStream;
}
impl Transport for TcpStream {
    fn tcp(&self) -> &TcpStream {
        self
    }
}
impl Transport for TlsStream<TcpStream> {
    fn tcp(&self) -> &TcpStream {
        self.get_ref()
    }
}

struct TimedStream {
    stream: Box<dyn Transport>,
    deadline: Instant,
}
impl TimedStream {
    fn remaining(&self) -> io::Result<Duration> {
        self.deadline
            .checked_duration_since(Instant::now())
            .filter(|remaining| !remaining.is_zero())
            .ok_or_else(|| io::Error::from(io::ErrorKind::TimedOut))
    }
}
impl Read for TimedStream {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
        self.stream
            .tcp()
            .set_read_timeout(Some(self.remaining()?))?;
        self.stream.read(bytes)
    }
}
impl Write for TimedStream {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.stream
            .tcp()
            .set_write_timeout(Some(self.remaining()?))?;
        self.stream.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.stream
            .tcp()
            .set_write_timeout(Some(self.remaining()?))?;
        self.stream.flush()
    }
}

fn io_error(error: io::Error) -> String {
    format!("Lỗi giao tiếp RouterOS ({:?}).", error.kind())
}

fn request(stream: &mut (impl Read + Write), words: &[&str]) -> Result<Vec<Row>> {
    codec::send(stream, words).map_err(io_error)?;
    let mut rows = Vec::new();
    let mut total = 0;
    for _ in 0..=MAX_REPLY_ROWS {
        let words = codec::receive(stream).map_err(io_error)?;
        total += words.iter().map(String::len).sum::<usize>();
        if total > MAX_REPLY_BYTES {
            return Err("Phản hồi RouterOS vượt giới hạn dữ liệu.".into());
        }
        let (kind, attributes) = words.split_first().ok_or("Phản hồi RouterOS trống.")?;
        match kind.as_str() {
            "!done" => {
                if attributes.iter().any(|word| word.starts_with("=ret=")) {
                    return Err(
                        "RouterOS yêu cầu phương thức đăng nhập cũ. Hãy dùng RouterOS 7.".into(),
                    );
                }
                return Ok(rows);
            }
            "!empty" => (),
            "!re" => rows.push(
                attributes
                    .iter()
                    .filter_map(|word| {
                        let (key, value) = word.strip_prefix('=')?.split_once('=')?;
                        Some((key.to_owned(), value.to_owned()))
                    })
                    .collect(),
            ),
            // Keep router-supplied error text out of UI and logs. It can contain submitted credentials.
            "!trap" => {
                return Err(
                    "RouterOS từ chối lệnh. Kiểm tra tài khoản, quyền và cấu hình dịch vụ.".into(),
                )
            }
            "!fatal" => return Err("RouterOS đóng phiên API.".into()),
            _ => return Err("Phản hồi API RouterOS không hợp lệ.".into()),
        }
    }
    Err("Phản hồi RouterOS vượt giới hạn số dòng.".into())
}

fn open(connection: &Connection) -> Result<TimedStream> {
    let ip: IpAddr = connection
        .host
        .trim()
        .parse()
        .map_err(|_| "Nhập địa chỉ IP của router.")?;
    if connection.port == 0
        || connection.username.is_empty()
        || connection.username.len() > 128
        || connection.password.len() > 256
        || connection.ca_pem.len() > 32768
    {
        return Err("Thông tin kết nối không hợp lệ.".into());
    }
    let socket = TcpStream::connect_timeout(&SocketAddr::new(ip, connection.port), TIMEOUT)
        .map_err(io_error)?;
    socket.set_read_timeout(Some(TIMEOUT)).map_err(io_error)?;
    socket.set_write_timeout(Some(TIMEOUT)).map_err(io_error)?;
    let stream: Box<dyn Transport> = if connection.tls {
        let mut builder = TlsConnector::builder();
        builder.min_protocol_version(Some(Protocol::Tlsv12));
        if !connection.ca_pem.trim().is_empty() {
            let certificate = Certificate::from_pem(connection.ca_pem.trim().as_bytes())
                .map_err(|_| "Chứng chỉ CA PEM không hợp lệ.")?;
            builder.add_root_certificate(certificate);
        }
        let tls_name = if connection.tls_name.trim().is_empty() {
            connection.host.trim()
        } else {
            connection.tls_name.trim()
        };
        let tls = builder
            .build()
            .and_then(|connector| {
                connector
                    .connect(tls_name, socket)
                    .map_err(|err| match err {
                        native_tls::HandshakeError::Failure(err) => err,
                        native_tls::HandshakeError::WouldBlock(_) => {
                            unreachable!("socket is blocking")
                        }
                    })
            })
            .map_err(|_| {
                "API-SSL không xác minh được chứng chỉ hoặc phiên TLS. Kiểm tra tên và CA."
            })?;
        Box::new(tls)
    } else {
        Box::new(socket)
    };
    let mut transport = TimedStream {
        stream,
        deadline: Instant::now() + TIMEOUT,
    };
    let name = format!("=name={}", connection.username);
    let password = zeroize::Zeroizing::new(format!("=password={}", connection.password));
    request(&mut transport, &["/login", &name, &password])
        .map_err(|_| "Đăng nhập RouterOS thất bại. Kiểm tra tài khoản, mật khẩu và quyền API.")?;
    Ok(transport)
}

impl TimedStream {
    fn request(&mut self, words: &[&str]) -> Result<Vec<Row>> {
        self.deadline = Instant::now() + TIMEOUT;
        request(self, words)
    }
}

#[derive(Serialize)]
pub struct RouterInfo {
    identity: String,
    version: String,
    board: String,
    uptime: String,
}

pub fn inspect(connection: &Connection) -> Result<RouterInfo> {
    let mut router = open(connection)?;
    let identity = router.request(&["/system/identity/print", "=.proplist=name"])?;
    let resource = router.request(&[
        "/system/resource/print",
        "=.proplist=version,board-name,uptime",
    ])?;
    let resource = resource
        .first()
        .ok_or("RouterOS không trả về thông tin hệ thống.")?;
    Ok(RouterInfo {
        identity: identity
            .first()
            .and_then(|row| row.get("name"))
            .cloned()
            .unwrap_or_default(),
        version: resource.get("version").cloned().unwrap_or_default(),
        board: resource.get("board-name").cloned().unwrap_or_default(),
        uptime: resource.get("uptime").cloned().unwrap_or_default(),
    })
}

pub fn save_backup(connection: &Connection, backup: &Backup) -> Result<String> {
    if !connection.tls {
        return Err("Sao lưu mã hóa cần kết nối API-SSL.".into());
    }
    if backup.name.is_empty()
        || backup.name.len() > 48
        || !backup
            .name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        || backup.password.len() < 12
        || backup.password.len() > 128
    {
        return Err(
            "Tên bản sao lưu chỉ gồm chữ, số, dấu gạch. Mật khẩu dài từ 12 đến 128 byte.".into(),
        );
    }
    let mut router = open(connection)?;
    let filename = format!("{}.backup", backup.name);
    let query = format!("?name={filename}");
    if !router
        .request(&["/file/print", "=.proplist=name", &query])?
        .is_empty()
    {
        return Err("Tên bản sao lưu đã tồn tại trên router.".into());
    }
    let name = format!("=name={}", backup.name);
    let password = zeroize::Zeroizing::new(format!("=password={}", backup.password));
    router.request(&[
        "/system/backup/save",
        &name,
        &password,
        "=dont-encrypt=no",
        "=encryption=aes-sha256",
    ])?;
    if router
        .request(&["/file/print", "=.proplist=name", &query])?
        .is_empty()
    {
        return Err("RouterOS chưa trả về file sao lưu.".into());
    }
    Ok(filename)
}

pub fn subscribers(connection: &Connection) -> Result<Vec<Row>> {
    let mut router = open(connection)?;
    router.request(&[
        "/ppp/secret/print",
        "=.proplist=.id,name,profile,disabled,comment",
        "?service=pppoe",
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, thread};

    #[test]
    fn reads_router_over_mock_api() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            for (command, reply) in [
                ("/login", vec![]),
                ("/system/identity/print", vec!["!re", "=name=LAB"]),
                (
                    "/system/resource/print",
                    vec!["!re", "=version=7.21.5", "=board-name=CHR", "=uptime=1h"],
                ),
            ] {
                let words = codec::receive(&mut stream).unwrap();
                assert_eq!(words[0], command);
                if !reply.is_empty() {
                    codec::send(&mut stream, &reply).unwrap();
                }
                codec::send(&mut stream, &["!done"]).unwrap();
            }
        });
        let connection = Connection {
            host: "127.0.0.1".into(),
            port,
            username: "test".into(),
            password: "test".into(),
            tls: false,
            tls_name: String::new(),
            ca_pem: String::new(),
        };
        let router = inspect(&connection).unwrap();
        assert_eq!(
            (router.identity.as_str(), router.version.as_str()),
            ("LAB", "7.21.5")
        );
        worker.join().unwrap();
    }
}
