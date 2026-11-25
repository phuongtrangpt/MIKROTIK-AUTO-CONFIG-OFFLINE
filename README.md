# MikroTik Auto Config Studio — Offline (v1.5.0)

## Desktop v2.0.0-alpha.1

Nhánh `develop/v2-tauri` xây dựng ứng dụng Windows bằng Tauri 2 và Rust. Bộ cài thử nghiệm nằm trong mục **Artifacts** của workflow [V2 desktop CI](https://github.com/phuongtrangpt/MIKROTIK-AUTO-CONFIG-OFFLINE/actions/workflows/v2-desktop-ci.yml). Trình hướng dẫn trên `index.html` vẫn chạy được offline trên trình duyệt. Các tính năng desktop xuất hiện trong bộ cài.

- **Dự án** lưu mẫu trên máy. Mẫu và tệp JSON bỏ mật khẩu WAN cùng danh sách tài khoản PPPoE. Tệp script .RSC chứa mật khẩu PPPoE mà RouterOS cần khi nhập lệnh.
- **RouterOS** đọc thông tin hệ thống và danh sách thuê bao. API-SSL kiểm tra tên trên chứng chỉ bằng kho chứng chỉ hệ điều hành hoặc CA PEM được cung cấp. Thay đổi thuê bao và sao lưu mã hóa đều yêu cầu API-SSL. Bật dịch vụ API qua WinBox trên mạng quản trị, giới hạn IP nguồn tại dịch vụ và firewall. RouterOS giữ tệp `.backup` trong **Files**.
- **Áp dụng và khôi phục** xuất .RSC cho RouterOS 7 trống. Có thể kiểm tra bằng `/import file-name=<ten.rsc> verbose=yes dry-run`. Khi chỉnh router đang chạy, dùng Safe Mode trong WinBox hoặc Ctrl+X trong Terminal, thực hiện theo từng nhóm lệnh nhỏ và kiểm tra bằng phiên quản trị thứ hai trước khi xác nhận. Để phục hồi toàn bộ, mở **Files** trên đúng router gốc và chọn **Restore** với mật khẩu sao lưu.
- **WAN** mỗi đường có thể khai báo một IP giám sát riêng. Với DHCP + giám sát, script cập nhật route /32 khi địa chỉ thuê thay đổi. Chọn đích phản hồi ICMP ổn định qua đúng nhà mạng. WinBox từ WAN là lựa chọn riêng, có thể giới hạn theo IP/CIDR nguồn.
- **WireGuard** xuất cấu hình RouterOS cho Remote Access, Hub hoặc Site-to-Site. Chạy script sau cấu hình cơ sở. Remote Access và Hub nghe trên WAN 1. Điền public key của các peer vào ứng dụng, rồi lấy public key của router bằng `/interface wireguard print` để cấu hình máy khách hoặc chi nhánh. Cấu hình chi nhánh dạng Site-to-Site đặt endpoint là IP hoặc DNS của Hub và dùng IP VPN cùng subnet.

### Chạy kiểm thử

```sh
node --test tests/*.js tests/*.cjs
cargo test --manifest-path src-tauri/routeros/Cargo.toml
node scripts/prepare-desktop.cjs
python3 tests/chr/smoke.py /duong-dan/chr-7.21.5.img
```

Trên Windows, dựng bộ cài bằng `npx --yes --package @tauri-apps/cli@2 tauri build --bundles nsis`. CI chạy mô phỏng CHR bằng QEMU trên một đĩa dùng một lần.

### Kênh cập nhật thử nghiệm

Workflow **Publish signed V2 Windows preview** chạy khi đẩy tag `studio-v2-preview-v<phiên-bản>` trỏ tới commit của nhánh v2 đã vượt qua Windows, giao diện và CHR CI. Kênh thử nghiệm dùng prerelease riêng `v2-desktop-preview`. Thiết lập biến `STUDIO_UPDATER_PUBLIC_KEY`, secret `TAURI_SIGNING_PRIVATE_KEY` và secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` nếu khóa có mật khẩu. Các bản kiểm thử CI thông thường được dựng với cập nhật tắt. Bản có khóa công khai kiểm tra phiên bản khi mở ứng dụng và xác minh chữ ký trước khi cài.

---


Công cụ **tạo lệnh cấu hình MikroTik RouterOS 7** theo từng bước Next → Xem lệnh → Sao chép → Dán vào Winbox. Chạy **offline** trên Windows bằng `index.html` hoặc `CHAY_PHAN_MEM.bat` (không cần cài Node.js).

## v1.5.0 — Rà soát bộ sinh script RouterOS 7 và an toàn triển khai
- Rà soát thứ tự firewall: `accept established/related/untracked` → `drop invalid` → cho phép DHCP client WAN → chặn input WAN. Không tạo trùng rule bootstrap khi sang bước PCC/NAT.
- Kiểm tra IP gateway LAN, VLAN và WAN tĩnh không trùng network/broadcast; gateway WAN không được trùng IP router; chặn WAN tĩnh chồng subnet.
- Kiểm tra tên VLAN trùng interface thiết bị/bridge/PPPoE tự sinh, trùng cổng trunk/access, model không hợp lệ và DHCP Lease Time ngoài danh sách (kể cả mẫu JSON nhập vào).
- Phân biệt VLAN WAN nhà mạng và VLAN LAN. Thêm subnet WAN tĩnh vào danh sách bỏ qua đánh dấu PCC để quản trị gateway modem thuận tiện hơn.
- PPPoE Server chạy chung `bridge-LAN` có IP: bắt buộc xác nhận rõ rủi ro. **MikroTik khuyến nghị cổng nhận PPPoE không gán IP**; phương án an toàn hơn là bridge riêng hoặc VLAN PPPoE-only. Khi dùng chung với DHCP, mạng có thể nhận DHCP không cần PPPoE.
- CSV/TXT PPPoE phân tích dấu ngăn cách nằm ngoài chuỗi trong dấu nháy kép, hỗ trợ mật khẩu có dấu phẩy hoặc chấm phẩy. Tự bỏ DNS/NTP trùng lặp.
- Mẫu tạo theo IPv4. Nếu chưa có cấu hình IPv6 firewall và định tuyến an toàn, không cho bật IPv6 bằng wizard ở phiên bản này.
- Wizard cảnh báo nếu các lệnh đã Copy trước đó thay đổi sau khi sửa cấu hình; nếu đã dán lên router, reset lại trước khi chạy script mới.
- Khi mở lại JSON, bắt buộc xác nhận lại thông số PPPoE với nhà mạng. Bước cuối có nút **Sao chép lệnh kiểm tra (chỉ đọc)**.
- Bổ sung kiểm thử lõi, kiểm thử 9 tổ hợp hai WAN PPPoE/DHCP/Static, VLAN, PPPoE Server, PCQ, chuỗi ký tự đặc biệt và cập nhật Windows.

**Giới hạn kiểm thử:** Kiểm thử Node.js và quy tắc sinh lệnh không thay thế thử chạy trên MikroTik thật. Để xác minh cú pháp RouterOS 7.16+ trước khi triển khai, có thể tải file `.rsc` lên router lab rồi dùng `import file-name=ten_file.rsc verbose=yes dry-run` để kiểm tra mà chưa thay đổi cấu hình. Luôn giữ Safe Mode và sao lưu; không áp dụng script tổng lên router đã cấu hình.

## v1.4.1 — Sửa lỗi cập nhật Windows ở đường dẫn có dấu cách/ngoặc
- Sửa lỗi `Resolve-Path : Illegal characters in path` khi chạy `CAP_NHAT_TU_DONG.bat` ở các thư mục như `New folder (29)`.
- Batch file không truyền `-AppDir` nữa; PowerShell tự xác định thư mục thực tế bằng `$PSScriptRoot`.
- **Người dùng bản v1.4.0:** cập nhật ngay một dòng trong file BAT, bỏ `-AppDir "%~dp0"`, sau đó chạy BAT để nâng cấp trực tiếp lên v1.4.1. Hoặc tải ZIP v1.4.1 tại GitHub Releases, giải nén vào thư mục mới.
- Bản vá không ảnh hưởng đến dữ liệu cấu hình RouterOS đã lưu.

## Mới trong v1.4.0 — Cập nhật trực tiếp từ ứng dụng
- Trên giao diện có nút **↻ Kiểm tra cập nhật**. Khi nhấn, ứng dụng cần Internet để đọc phiên bản mới nhất tại GitHub Releases của repository chính thức. Nếu có bản mới, trình duyệt được yêu cầu **tự tải ZIP**; không cần vào trang GitHub để tìm link. Nếu lỗi mạng, mọi chức năng cấu hình vẫn dùng offline bình thường.
- Giao diện **không tự ghi đè file đang chạy**: Chrome/Edge cấm trang `file://` tự sửa file trên máy. Nếu muốn cập nhật toàn bộ chương trình tại chỗ, nhấn đúp **`CAP_NHAT_TU_DONG.bat`** trong thư mục hiện tại. Windows PowerShell sẽ tải bản mới nhất, xác minh nguồn GitHub, kiểm tra SHA-256 nếu GitHub cung cấp, sao lưu mã nguồn rồi tự thay file và mở lại phần mềm.
- Các file mẫu JSON/TXT/RSC của khách hàng không bị thay đổi. **Nên lưu mẫu JSON trước khi cập nhật** nếu đang chỉnh cấu hình dở. Cập nhật không cần quyền admin khi thư mục cho phép ghi.
- Chỉ phần kiểm tra/tải bản mới cần mạng. Dữ liệu WAN, mật khẩu PPPoE, cấu hình khách hàng **không được gửi tới GitHub**.

## Bổ sung v1.3.0 — PPPoE WAN tagged VLAN (802.1Q)
- Từng WAN PPPoE phải chọn **trực tiếp trên cổng vật lý** hoặc **qua VLAN 802.1Q**. Mặc định là **chưa xác nhận**, chặn xuất lệnh đến khi người dùng xác nhận với nhà mạng.
- Nếu chọn PPPoE tagged, nhập **VLAN ID do nhà mạng cung cấp (1–4094)**. Lệnh `/interface vlan add` tự đứng **trước** lệnh `/interface pppoe-client add`, client quay trên `vlan-WAN1`, `vlan-WAN2`, ... thay cho `ether1`/`ether2`.
- Thay đổi loại PPPoE, port hoặc VLAN ID sẽ xóa trạng thái xác nhận để tránh dùng sai thông tin. VLAN WAN tách biệt module VLAN LAN ở bước 4.
- Các tuyến PCC, NAT, failover vẫn sử dụng interface PPPoE logic (`pppoe-WAN1`, ...); không coi cổng vật lý và VLAN WAN là hai đường Internet.
- **Không có VLAN ID dùng chung cho mọi nhà mạng.** Người dùng cần hỏi tổng đài hoặc kỹ thuật viên cung cấp dịch vụ, đồng thời xác nhận ONT có chuyển tiếp VLAN tagged về MikroTik hay đã tự xử lý tag/untag.

## Điểm mới
- Nhập tốc độ từng WAN như `250M`, `1G`; PCC tự tính tỷ lệ: **250M + 1G → 1:4 (5 phần)**. Giới hạn 24 phần để tránh quá nhiều luật mangle.
- Bridge LAN có hai chế độ: **Tất cả cổng còn lại** hoặc **Tự chọn cổng**.
- PPPoE Server có thể hoạt động **trên bridge-LAN**, **trên bridge-PPPoE riêng nhiều cổng**, hoặc **trên VLAN PPPoE-only**.
- Chân trang liên hệ dịch vụ hỗ trợ triển khai mạng và cấu hình MikroTik.

## Chạy phần mềm
Giải nén ZIP; mở `index.html` trên Edge/Chrome hoặc nhấn `CHAY_PHAN_MEM.bat` trên Windows. Trong wizard, chọn thiết bị, khai báo WAN/LAN/VLAN/PPPoE, sao chép lệnh từng bước, hoặc tải TXT/RSC cuối cùng.

> **Cảnh báo:** Dành cho RouterOS v7 **No Default Configuration** và router mới reset. Không dán lại đoạn lệnh đã thực thi hoặc dán script tổng sau khi đã chạy từng bước. Script chứa mật khẩu ISP và PPPoE; không công khai các bản đã sinh. Cần kiểm tra trên router thử nghiệm trước khi triển khai môi trường thật.

### Ví dụ phân cổng
- ether1: FPT 250 Mbps, ether2: VNPT 1 Gbps.
- ether3 + ether4: `bridge-LAN`, DHCP Server.
- ether5 + ether6: `bridge-PPPoE`, PPPoE Server khách hàng.
- Hoặc: tất cả các cổng LAN vào `bridge-LAN`, tắt DHCP LAN và bật PPPoE Server chạy trên `bridge-LAN`.

### Chạy test (dành cho người phát triển)
```bash
node tests/test_core.js
node tests/test_ui_smoke.js
node tests/test_update.js
node tests/test_update_ui.js
node tests/test_audit.js
node tests/test_wizard_edit.js
```

## Liên hệ
**Việt Phương** — **Nhận cấu hình MikroTik theo yêu cầu, triển khai mạng nhà trọ, doanh nghiệp, văn phòng.**

☎ **0963839369** · [Facebook](https://www.facebook.com/leviethoaiphuong/)