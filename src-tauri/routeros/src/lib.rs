mod codec;

use native_tls::{Certificate, Protocol, TlsConnector, TlsStream};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::{self, Read, Write},
    net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs},
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
    let authenticating = words.first() == Some(&"/login");
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
                if authenticating && attributes.iter().any(|word| word.starts_with("=ret=")) {
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

fn normalized_host(value: &str) -> Option<String> {
    let host = value.trim();
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Some(ip.to_string());
    }
    if let Some(inner) = host.strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
        return inner
            .parse::<std::net::Ipv6Addr>()
            .ok()
            .map(|ip| ip.to_string());
    }
    let name = host.strip_suffix('.').unwrap_or(host);
    let valid = !name.is_empty()
        && name.len() <= 253
        && name.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        });
    valid.then(|| name.to_ascii_lowercase())
}

fn connect(host: &str, port: u16) -> Result<TcpStream> {
    let targets: Vec<SocketAddr> = match host.parse::<IpAddr>() {
        Ok(ip) => vec![SocketAddr::new(ip, port)],
        Err(_) => (host, port).to_socket_addrs()
            .map_err(|_| "Không phân giải được tên DNS. Kiểm tra DNS Name trong IP → Cloud hoặc kết nối mạng.")?
            .collect(),
    };
    if targets.is_empty() {
        return Err("Tên DNS chưa có địa chỉ IP.".to_owned());
    }
    let deadline = Instant::now() + TIMEOUT;
    let last = targets.len() - 1;
    let mut last_error = io::Error::from(io::ErrorKind::TimedOut);
    for (index, target) in targets.into_iter().enumerate() {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            break;
        };
        if remaining.is_zero() {
            break;
        }
        // A stale or unreachable first record must leave time for the other addresses.
        let timeout = if index == last {
            remaining
        } else {
            remaining.min(Duration::from_secs(3))
        };
        match TcpStream::connect_timeout(&target, timeout) {
            Ok(socket) => return Ok(socket),
            Err(error) => last_error = error,
        }
    }
    Err(format!(
        "Không mở được TCP cổng {port} ({:?}). Kiểm tra IP → Services và firewall RouterOS.",
        last_error.kind()
    ))
}

fn open(connection: &Connection) -> Result<TimedStream> {
    let host = normalized_host(&connection.host)
        .ok_or("Nhập IP hoặc tên DNS của router. Điền cổng ở ô riêng.")?;
    if connection.port == 0
        || connection.username.is_empty()
        || connection.username.len() > 128
        || connection.password.len() > 256
        || connection.ca_pem.len() > 32768
    {
        return Err("Thông tin kết nối không hợp lệ.".into());
    }
    let tls_name = if connection.tls && !connection.tls_name.trim().is_empty() {
        normalized_host(&connection.tls_name)
            .ok_or("Tên trên chứng chỉ phải là IP hoặc tên DNS.")?
    } else {
        host.clone()
    };
    let socket = connect(&host, connection.port)?;
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
        let connector = builder.build().map_err(|_| "Không khởi tạo được TLS.")?;
        let tls = connector.connect(&tls_name, socket).map_err(|_| {
            "API-SSL không bắt tay được. Kiểm tra chứng chỉ đã gán cho api-ssl, tên DNS trên chứng chỉ và CA."
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

#[derive(Deserialize, ZeroizeOnDrop)]
pub struct Subscriber {
    id: Option<String>,
    name: String,
    password: String,
    profile: String,
    comment: String,
    disabled: bool,
}

fn valid_field(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}

pub fn ppp_profiles(connection: &Connection) -> Result<Vec<String>> {
    open(connection)?
        .request(&["/ppp/profile/print", "=.proplist=name"])
        .map(|rows| {
            rows.into_iter()
                .filter_map(|mut row| row.remove("name"))
                .collect()
        })
}

pub fn save_subscriber(connection: &Connection, subscriber: &Subscriber) -> Result<()> {
    if !connection.tls {
        return Err("Thay đổi thuê bao cần kết nối API-SSL.".into());
    }
    if !valid_field(&subscriber.name, 63)
        || !valid_field(&subscriber.profile, 63)
        || (!subscriber.comment.is_empty() && !valid_field(&subscriber.comment, 128))
        || ((!subscriber.password.is_empty() || subscriber.id.is_none())
            && !valid_field(&subscriber.password, 128))
    {
        return Err("Kiểm tra tên thuê bao, gói cước, ghi chú và mật khẩu.".into());
    }
    let mut router = open(connection)?;
    let profile_query = format!("?name={}", subscriber.profile);
    if router
        .request(&["/ppp/profile/print", "=.proplist=.id", &profile_query])?
        .len()
        != 1
    {
        return Err("Gói cước PPPoE không tồn tại.".into());
    }
    let name = format!("=name={}", subscriber.name);
    let profile = format!("=profile={}", subscriber.profile);
    let comment = format!("=comment={}", subscriber.comment);
    let disabled = if subscriber.disabled {
        "=disabled=yes"
    } else {
        "=disabled=no"
    };
    let id_word;
    let mut words = if let Some(id) = &subscriber.id {
        if !id.strip_prefix('*').is_some_and(|hex| {
            !hex.is_empty() && hex.len() <= 12 && hex.bytes().all(|b| b.is_ascii_hexdigit())
        }) {
            return Err("Mã thuê bao không hợp lệ.".into());
        }
        let id_query = format!("?.id={id}");
        let existing = router.request(&[
            "/ppp/secret/print",
            "=.proplist=.id",
            &id_query,
            "?service=pppoe",
            "?#&",
        ])?;
        if existing.first().and_then(|row| row.get(".id")) != Some(id) {
            return Err("Thuê bao PPPoE đã thay đổi. Hãy làm mới danh sách.".into());
        }
        id_word = format!("=.id={id}");
        vec![
            "/ppp/secret/set",
            &id_word,
            &name,
            &profile,
            &comment,
            disabled,
        ]
    } else {
        vec![
            "/ppp/secret/add",
            "=service=pppoe",
            &name,
            &profile,
            &comment,
            disabled,
        ]
    };
    let password = zeroize::Zeroizing::new(format!("=password={}", subscriber.password));
    if !subscriber.password.is_empty() {
        words.push(&password);
    }
    router.request(&words)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{net::TcpListener, thread};

    #[test]
    fn accepts_dns_and_literal_addresses_without_url_or_port() {
        for (input, expected) in [
            (" ABC.SN.Mynetname.Net. ", "abc.sn.mynetname.net"),
            ("192.168.88.1", "192.168.88.1"),
            ("[2001:db8::1]", "2001:db8::1"),
        ] {
            assert_eq!(normalized_host(input).as_deref(), Some(expected));
        }
        for input in [
            "https://router.test",
            "router.test:8729",
            "r..test",
            "-router.test",
            "r.test/a",
            "",
        ] {
            assert!(normalized_host(input).is_none(), "{input}");
        }
    }

    #[test]
    fn done_can_return_the_new_item_id() {
        let transact = |command: &str| {
            let mut exchange = Vec::new();
            codec::send(&mut exchange, &[command]).unwrap();
            codec::send(&mut exchange, &["!done", "=ret=*1"]).unwrap();
            request(&mut io::Cursor::new(exchange), &[command])
        };
        assert!(transact("/ppp/secret/add").is_ok());
        assert!(transact("/login").unwrap_err().contains("đăng nhập cũ"));
    }

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
    #[test]
    #[ignore = "run through tests/api_tls.sh with a disposable CA"]
    fn api_ssl_validates_identity_and_saves_encrypted_backup() {
        use native_tls::{Identity, TlsAcceptor};
        let pem = std::fs::read_to_string(std::env::var("STUDIO_TEST_CA").unwrap()).unwrap();
        let pkcs12 = std::fs::read(std::env::var("STUDIO_TEST_PKCS12").unwrap()).unwrap();
        let acceptor =
            TlsAcceptor::new(Identity::from_pkcs12(&pkcs12, "lab-only").unwrap()).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let worker = thread::spawn(move || {
            let (bad, _) = listener.accept().unwrap();
            bad.set_read_timeout(Some(TIMEOUT)).unwrap();
            assert!(acceptor.accept(bad).is_err());

            let (good, _) = listener.accept().unwrap();
            good.set_read_timeout(Some(TIMEOUT)).unwrap();
            let mut stream = acceptor.accept(good).unwrap();
            for (expected, reply) in [
                (vec!["/login", "=name=lab", "=password=temporary"], vec![]),
                (
                    vec!["/file/print", "=.proplist=name", "?name=lab.backup"],
                    vec![],
                ),
                (
                    vec![
                        "/system/backup/save",
                        "=name=lab",
                        "=password=test-only-backup",
                        "=dont-encrypt=no",
                        "=encryption=aes-sha256",
                    ],
                    vec![],
                ),
                (
                    vec!["/file/print", "=.proplist=name", "?name=lab.backup"],
                    vec!["!re", "=name=lab.backup"],
                ),
            ] {
                assert_eq!(codec::receive(&mut stream).unwrap(), expected);
                if !reply.is_empty() {
                    codec::send(&mut stream, &reply).unwrap();
                }
                codec::send(&mut stream, &["!done"]).unwrap();
            }
        });
        let mut connection = Connection {
            host: "localhost".into(),
            port,
            username: "lab".into(),
            password: "temporary".into(),
            tls: true,
            tls_name: "wrong.studio.test".into(),
            ca_pem: pem,
        };
        let backup = Backup {
            name: "lab".into(),
            password: "test-only-backup".into(),
        };
        assert!(save_backup(&connection, &backup)
            .unwrap_err()
            .contains("chứng chỉ"));
        connection.tls_name.clear();
        assert_eq!(save_backup(&connection, &backup).unwrap(), "lab.backup");
        worker.join().unwrap();
    }

    #[test]
    fn rejects_mutation_over_plaintext_api() {
        let connection = Connection {
            host: "127.0.0.1".into(),
            port: 0,
            username: String::new(),
            password: String::new(),
            tls: false,
            tls_name: String::new(),
            ca_pem: String::new(),
        };
        let subscriber = Subscriber {
            id: None,
            name: "lab".into(),
            password: "fake".into(),
            profile: "test".into(),
            comment: String::new(),
            disabled: false,
        };
        assert!(save_subscriber(&connection, &subscriber)
            .unwrap_err()
            .contains("API-SSL"));
    }
}
