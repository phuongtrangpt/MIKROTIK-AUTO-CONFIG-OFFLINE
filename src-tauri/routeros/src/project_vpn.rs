use base64::{engine::general_purpose::STANDARD, Engine};
use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

type Result<T> = super::Result<T>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    endpoint: String,
    port: u16,
    wan: String,
    router_ip: Ipv4Addr,
    reuse_ssl: bool,
    api_port: u16,
    tls_name: String,
    ca_pem: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub endpoint: String,
    pub port: u16,
    pub router_ip: Ipv4Addr,
    pub client_ip: Ipv4Addr,
    pub api_port: u16,
    pub tls_name: String,
    pub ca_pem: String,
}

pub struct Provision {
    pub profile: Profile,
    pub tunnel: Zeroizing<String>,
    pub script: Zeroizing<String>,
}

fn key() -> Result<StaticSecret> {
    let mut bytes = Zeroizing::new([0u8; 32]);
    getrandom::fill(bytes.as_mut()).map_err(|_| "Không tạo được khóa WireGuard.")?;
    bytes[0] &= 248;
    bytes[31] = (bytes[31] & 127) | 64;
    Ok(StaticSecret::from(*bytes))
}

fn quote(value: &str) -> String {
    let value = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('\r', "")
        .replace('\n', "\\n");
    format!("\"{value}\"")
}

fn certificates(id: &str, router_ip: Ipv4Addr) -> Result<(String, String, Zeroizing<String>)> {
    let err = |_| "Không tạo được chứng chỉ quản trị.";
    let mut ca_params = CertificateParams::default();
    ca_params
        .distinguished_name
        .push(rcgen::DnType::CommonName, format!("Studio CA {id}"));
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    ca_params
        .key_usages
        .push(rcgen::KeyUsagePurpose::KeyCertSign);
    let ca_key = KeyPair::generate().map_err(err)?;
    let ca = ca_params.self_signed(&ca_key).map_err(err)?;

    let mut leaf = CertificateParams::new(vec![router_ip.to_string()]).map_err(err)?;
    leaf.distinguished_name
        .push(rcgen::DnType::CommonName, format!("studio-{id}"));
    leaf.extended_key_usages
        .push(ExtendedKeyUsagePurpose::ServerAuth);
    leaf.key_usages
        .push(rcgen::KeyUsagePurpose::DigitalSignature);
    let leaf_key = KeyPair::generate().map_err(err)?;
    let leaf = leaf.signed_by(&leaf_key, &ca, &ca_key).map_err(err)?;
    Ok((
        ca.pem(),
        leaf.pem(),
        Zeroizing::new(leaf_key.serialize_pem()),
    ))
}

pub fn prepare(options: Options) -> Result<Provision> {
    let endpoint = super::normalized_host(&options.endpoint)
        .ok_or("Nhập IP công cộng hoặc tên DNS của router.")?;
    if options.port == 0 || (options.reuse_ssl && options.api_port == 0) {
        return Err("Cổng WireGuard hoặc API-SSL không hợp lệ.".into());
    }
    let [a, b, c, d] = options.router_ip.octets();
    if !options.router_ip.is_private() || d % 4 != 1 {
        return Err(
            "Chọn IP router thuộc dải riêng, là địa chỉ host đầu tiên của mạng /30.".into(),
        );
    }
    let wan = options.wan.trim();
    if wan.len() > 60
        || (!wan.is_empty()
            && !wan
                .bytes()
                .all(|ch| ch.is_ascii_alphanumeric() || b".-_/".contains(&ch)))
    {
        return Err("Tên interface WAN không hợp lệ.".into());
    }
    let mut random = [0u8; 8];
    getrandom::fill(&mut random).map_err(|_| "Không tạo được mã đường hầm.")?;
    let id = format!("{:016x}", u64::from_be_bytes(random));
    let router_key = key()?;
    let client_key = key()?;
    let router_private = Zeroizing::new(STANDARD.encode(router_key.as_bytes()));
    let client_private = Zeroizing::new(STANDARD.encode(client_key.as_bytes()));
    let router_public = STANDARD.encode(PublicKey::from(&router_key).as_bytes());
    let client_public = STANDARD.encode(PublicKey::from(&client_key).as_bytes());
    let router_ip = options.router_ip;
    let client_ip = Ipv4Addr::new(a, b, c, d + 1);
    let port = options.port;
    let tunnel_endpoint = if endpoint.parse::<std::net::Ipv6Addr>().is_ok() {
        format!("[{endpoint}]:{port}")
    } else {
        format!("{endpoint}:{port}")
    };
    let tunnel = Zeroizing::new(format!(
        "[Interface]\nPrivateKey = {}\nAddress = {client_ip}/32\n\n[Peer]\nPublicKey = {router_public}\nAllowedIPs = {router_ip}/32\nEndpoint = {tunnel_endpoint}\nPersistentKeepalive = 25\n",
        client_private.as_str(),
    ));

    let label = format!("studio-{id}");
    let interface = format!("wg-st-{}", &id[..8]);
    let wan_check = if wan.is_empty() {
        "/interface list find where name=\"WAN\"".into()
    } else {
        format!("/interface find where name={}", quote(wan))
    };
    let ingress = if wan.is_empty() {
        "in-interface-list=WAN".into()
    } else {
        format!("in-interface={}", quote(wan))
    };
    let mut script = Zeroizing::new(format!(
        "# Contains router private keys. Import once, then delete this script.\r\n{{\n:if ([:len [{wan_check}]] != 1) do={{ :error \"Studio: WAN not found\" }};\n:if ([:len [/interface find where name={interface}]] > 0 || [:len [/interface wireguard find where listen-port={port}]] > 0) do={{ :error \"Studio: WireGuard interface or UDP port already in use\" }};\n:if ([:len [/ip address find where network={a}.{b}.{c}.{}]] > 0) do={{ :error \"Studio: VPN network already used\" }};\n",
        d-1
    ));
    let (ca_pem, tls_name, api_port) = if options.reuse_ssl {
        let tls_name = super::normalized_host(&options.tls_name)
            .ok_or("Nhập tên DNS hoặc IP có trên chứng chỉ API-SSL đang dùng.")?;
        if options.ca_pem.len() > 32768
            || (!options.ca_pem.trim().is_empty()
                && native_tls::Certificate::from_pem(options.ca_pem.trim().as_bytes()).is_err())
        {
            return Err("Chứng chỉ CA PEM không hợp lệ.".into());
        }
        script.push_str(&format!(":if ([/ip service get api-ssl disabled] || [/ip service get api-ssl port] != {}) do={{ :error \"Studio: check existing API-SSL service\" }};\n", options.api_port));
        (options.ca_pem, tls_name, options.api_port)
    } else {
        let (ca, leaf, leaf_key) = certificates(&id, router_ip)?;
        script.push_str(":local studioApiCert [:tostr [/ip service get api-ssl certificate]];\n:if (![/ip service get api-ssl disabled] && [:len $studioApiCert] > 0 && $studioApiCert != \"none\") do={ :error \"Studio: API-SSL already has a certificate. Use existing certificate mode.\" };\n");
        for (extension, pem) in [
            ("ca.crt", ca.as_str()),
            ("crt", leaf.as_str()),
            ("key", leaf_key.as_str()),
        ] {
            let name = format!("{label}.{extension}");
            let contents = Zeroizing::new(quote(pem));
            script.push_str(&format!("/file add name={name} type=file contents={};\n/certificate import file-name={name} passphrase=\"\";\n/file remove [find where name={name}];\n", contents.as_str()));
        }
        script.push_str(&format!(":local cert [/certificate find where common-name={label} and private-key=yes];\n:if ([:len $cert] != 1) do={{ :error \"Studio: TLS certificate or private key import failed\" }};\n"));
        (ca, String::new(), 8729)
    };
    script.push_str(&format!(
        "/interface wireguard add name={interface} listen-port={port} private-key=\"{}\";\n/ip address add address={router_ip}/30 interface={interface} comment={label};\n/interface wireguard peers add interface={interface} public-key=\"{client_public}\" allowed-address={client_ip}/32 comment={label};\n",
        router_private.as_str()
    ));
    let rules = [
        format!("chain=input action=accept {ingress} protocol=udp dst-port={port} comment=\"{label} WireGuard\""),
        format!("chain=input action=accept in-interface={interface} src-address={client_ip}/32 dst-address={router_ip} protocol=tcp dst-port={api_port} comment=\"{label} API-SSL\""),
    ];
    for rule in rules {
        script.push_str(&format!(":local studioInput [/ip firewall filter find where chain=input];\n:if ([:len $studioInput] > 0) do={{ /ip firewall filter add {rule} place-before=[:pick $studioInput 0] }} else={{ /ip firewall filter add {rule} }};\n"));
    }
    if !options.reuse_ssl {
        script.push_str(&format!("/ip service set api-ssl disabled=no port={api_port} address={client_ip}/32 certificate=[/certificate get $cert name];\n"));
    }
    if endpoint.ends_with(".mynetname.net") && endpoint.parse::<IpAddr>().is_err() {
        script.push_str("/ip cloud set ddns-enabled=yes;\n");
    }
    script.push_str(":put \"Studio VPN ready\";\n}\n");
    Ok(Provision {
        profile: Profile {
            id,
            endpoint,
            port,
            router_ip,
            client_ip,
            api_port,
            tls_name,
            ca_pem,
        },
        tunnel,
        script,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options() -> Options {
        Options {
            endpoint: " ROUTER.sn.Mynetname.Net ".into(),
            port: 51820,
            wan: "pppoe-out1".into(),
            router_ip: Ipv4Addr::new(10, 241, 0, 1),
            reuse_ssl: false,
            api_port: 8729,
            tls_name: String::new(),
            ca_pem: String::new(),
        }
    }

    #[test]
    fn project_profile_exposes_public_certificate_and_split_route() {
        let provision = prepare(options()).unwrap();
        assert_eq!(provision.profile.endpoint, "router.sn.mynetname.net");
        assert!(provision.tunnel.contains("AllowedIPs = 10.241.0.1/32"));
        assert!(provision.script.contains("address=10.241.0.2/32"));
        assert!(provision.script.contains("ddns-enabled=yes"));
        assert!(provision.profile.ca_pem.contains("BEGIN CERTIFICATE"));
        assert!(!provision.profile.ca_pem.contains("PRIVATE KEY"));
        assert!(!provision
            .script
            .contains(provision.tunnel.lines().nth(1).unwrap()));
    }

    #[test]
    fn setup_preserves_existing_tls_and_rejects_invalid_inputs() {
        let mut tls = options();
        tls.reuse_ssl = true;
        tls.api_port = 18729;
        tls.tls_name = "router.sn.mynetname.net".into();
        let mode = prepare(tls).unwrap();
        assert_eq!(mode.profile.api_port, 18729);
        assert!(mode.script.contains("dst-port=18729"));
        assert!(!mode.script.contains("/ip service set api-ssl"));
        assert!(!mode.script.contains("/certificate import"));

        let mut invalid = options();
        invalid.wan = "ether1; malicious".into();
        assert!(prepare(invalid).is_err());
        let mut invalid = options();
        invalid.router_ip = Ipv4Addr::new(10, 241, 0, 2);
        assert!(prepare(invalid).is_err());
    }
}
