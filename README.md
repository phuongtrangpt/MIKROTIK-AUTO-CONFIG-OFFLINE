# MikroTik Auto Config Studio — Offline (v1.2.0)

Công cụ **tạo lệnh cấu hình MikroTik RouterOS 7** theo từng bước Next → Xem lệnh → Sao chép → Dán vào Winbox. Chạy **offline** trên Windows bằng `index.html` hoặc `CHAY_PHAN_MEM.bat` (không cần cài Node.js).

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
```

## Liên hệ
**Nhận cấu hình MikroTik theo yêu cầu, triển khai mạng nhà trọ, doanh nghiệp, văn phòng.**

☎ **0963839369** · [Facebook](https://www.facebook.com/leviethoaiphuong/)