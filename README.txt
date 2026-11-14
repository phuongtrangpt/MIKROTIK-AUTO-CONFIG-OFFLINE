MIKROTIK AUTO CONFIG STUDIO v1.5.0 — WINDOWS OFFLINE
RouterOS 7 | No Default Configuration | Next / Copy / Skip
==========================================================

HUONG DAN
1. Giai nen ZIP, bam CHAY_PHAN_MEM.bat hoac mo index.html trong Chrome/Edge.
2. Router da reset No Default Configuration (no-defaults=yes), da doi mat khau admin.
3. Chon model, WAN va khai bao bang thong. Vi du 250M + 1G = 1:4 -> 5 phan PCC.
4. Trong buoc LAN: chon Tat ca hoac Tu chon cong Bridge LAN; tuy chon DHCP.
5. PPPoE Server: chon 1 trong 3 cach: bridge-LAN (chung tat ca cong LAN),
   bridge-PPPoE nhieu cong rieng, hoac VLAN PPPoE-only.
6. Moi buoc: Xem lenh -> Copy -> dan Winbox Terminal -> Next.
7. VLAN, PPPoE Server, PCQ la buoc tuy chon, co nut Bo qua.
8. Cuoi cung co the xuat script TXT/RSC hoac mau JSON.

TRUONG HOP MINH HOA
  ether1 WAN 250M + ether2 WAN 1G: tu chia PCC 1:4.
  ether3,ether4 chay LAN DHCP: buoc LAN -> Tu chon -> tick ether3, ether4.
  ether5,ether6 chay PPPoE: buoc Server -> Nhom cong rieng -> tick 5,6.
  Tat ca cong LAN chay PPPoE: buoc LAN -> Tat ca + tat DHCP,
    buoc PPPoE Server -> Chay tren bridge-LAN.

CANH BAO
- Chi danh cho RouterOS 7 reset No Default Configuration.
- Khong dan lai lenh cua buoc da chay, khong dan file tong sau khi da dan tung buoc.
- PCC chia theo SO KET NOI, khong cong toc do cho mot session don.
- Ty le duoc sap xep tu dong toi da 24 phan, co the gan dung voi toc do lech lon.
- Toc do nhap la bang thong dang ky, khong dam bao toc do Internet thuc te.
- Neu doi LAN/WAN/PPPoE sau khi da dan, can reset va chay lai de tranh lech cau hinh.
- Script chu mat khau that. Khong dang tai TXT/RSC/JSON co mat khau len GitHub.
- Khong tu dong gui du lieu ra ngoai; giao dien chay offline tren trinh duyet.
- Chua kiem tra cau hinh tren router MikroTik phan cung. Hay thu router du phong.
- Khi can su dung WAN DHCP da chieu, kiem tra RouterOS v7 ho tro default-route-tables.
- Luu IP/MAC Winbox va Safe Mode/console de khoi phuc khi doi Bridge/VLAN.

LIEN HE DICH VU
Viet Phuong
Cau hinh MikroTik theo yeu cau, trien khai he thong mang nha tro/cong ty.
Dien thoai: 0963839369
Facebook: https://www.facebook.com/leviethoaiphuong/

WAN PPPoE VLAN 802.1Q (v1.3.1): Hoi ISP PPPoE truc tiep hay tagged, VLAN ID neu can. Phai check "Da xac nhan". Neu tagged, tool tu tao /interface vlan truoc PPPoE Client.

AUTO UPDATE v1.4.0
- Tren giao dien bam "Kiem tra cap nhat" khi co Internet: tu tim ZIP Release moi nhat va yeu cau trinh duyet tai ve.
- De TU CAI DAT: dong tab cu, bam CAP_NHAT_TU_DONG.bat ngay trong thu muc dang chay; PowerShell download, backup va thay code.
- Khong can cai Node.js/Python, khong upload script/mat khau.
- File mau JSON/RSC/TXT khong bi sua; nen luu JSON neu dang lam viec do.

FIX v1.4.1: Fixed Auto Update BAT passing a trailing-backslash folder path to PowerShell; works with paths containing spaces and parentheses.

BAN 1.5.0 - KIEM TRA & AN TOAN
- Tu kiem tra gateway, trung VLAN/interface, WAN tinh trung subnet, DHCP lease-time.
- Chay PPPoE tren bridge-LAN co IP can tick xac nhan canh bao; khuyen nghi bridge/VLAN rieng.
- Neu doi cau hinh sau khi Copy lenh, trang se canh bao reset router neu da dan lenh.
- Trong buoc cuoi co nut Copy lenh kiem tra chi doc.
- IPv6 chua co mo-dun firewall/routing nen phai de tat IPv6 trong wizard nay.
- RouterOS 7.16+: import file-name=ten_file.rsc verbose=yes dry-run=yes de kiem tra truoc.
- Chua duoc xac nhan tren phan cung MikroTik. Thu tren router lab truoc.