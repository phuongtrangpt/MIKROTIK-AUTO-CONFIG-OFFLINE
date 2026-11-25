"""Run generated configurations on disposable RouterOS CHR disks using QEMU."""
import argparse
import os
from pathlib import Path
import re
import selectors
import shutil
import socket
import subprocess
import tempfile
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
PROMPT = re.compile(rb'\[[^\r\n\]]+@[^\r\n\]]+\][^\r\n]*> ')
ANSI = re.compile(rb'\x1b\[[0-?]*[ -/]*[@-~]')


class Console:
    def __init__(self, process):
        self.process = process
        self.selector = selectors.DefaultSelector()
        self.selector.register(process.stdout, selectors.EVENT_READ)
        self.output = b""
        self.transcript = bytearray()
        self.sequence = 0
        self.password = ''

    def control(self, data):
        self.process.stdin.write(data)
        self.process.stdin.flush()

    def send(self, command):
        self.control(command.encode() + b'\r')

    def expect(self, expressions, timeout=35):
        deadline = time.monotonic() + timeout
        while True:
            clean = ANSI.sub(b'', self.output).replace(b'\x00', b'')
            matches = [(match.start(), idx, match) for idx, expr in enumerate(expressions)
                       if (match := expr.search(clean))]
            if matches:
                _, idx, match = min(matches)
                self.output = clean[match.end():]
                return idx, clean[:match.start()]
            delay = deadline - time.monotonic()
            if delay <= 0 or not self.selector.select(delay):
                raise TimeoutError(f"Missing console prompt for {expressions!r}")
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError("QEMU console closed")
            if os.environ.get("STUDIO_CHR_TRACE") == "1":
                sys.stderr.buffer.write(chunk)
                sys.stderr.flush()
            self.transcript.extend(chunk)
            self.output += chunk

    def login(self):
        patterns = [re.compile(rb'Login: ?$', re.I), re.compile(rb'Password: ?$', re.I),
                    re.compile(rb'\[y/n\]:? ?$', re.I), re.compile(rb'new password[^\r\n]*[>:] ?$', re.I),
                    re.compile(rb'(?:repeat|confirm) (?:new )?password[^\r\n]*[>:] ?$', re.I), PROMPT]
        answered_password_change = set()
        for _ in range(12):
            idx, _ = self.expect(patterns, timeout=100)
            if idx == 5:
                return
            if idx in (3, 4):
                if idx in answered_password_change:
                    continue
                answered_password_change.add(idx)
            replies = ['admin', self.password, 'n', 'StudioLab-62159', 'StudioLab-62159']
            self.send(replies[idx])
            if idx == 4:
                self.password = replies[idx]
        raise RuntimeError("Unable to log into CHR serial console")

    def command(self, command):
        self.sequence += 1
        marker = f"__STUDIO_{self.sequence}_END__"
        self.send(command)
        self.send(f':put "{marker}"')
        _, lines = self.expect([re.compile(rb'[\r\n]+' + marker.encode() + rb'[\r\n]+')], timeout=60)
        self.expect([PROMPT])
        return lines.decode(errors='replace')

    def upload(self, file, name='studio.rsc'):
        self.command(':global studioFixture ""')
        data = file.read_bytes()
        for index in range(0, len(data), 400):
            fragment = ''.join(chr(value) if 32 <= value < 127 and value not in (34,36,92) else f'\\{value:02X}'
                               for value in data[index:index + 400])
            self.command(':global studioFixture; :set studioFixture ($studioFixture . "' + fragment + '")')
        self.command(f':global studioFixture; /file add name={name} type=file contents=$studioFixture')
        output = self.command(f':put [:len [/file get {name} contents]]')
        if not re.search(r'(?m)^\s*' + str(len(data)) + r'\s*$', output):
            raise AssertionError(f'Serial upload length mismatch ({len(data)} bytes expected): {output}')

    def import_fixture(self, name, dry_run=False):
        command = f'/import file-name={name} verbose=yes' + (' dry-run' if dry_run else '')
        output = self.command(':onerror studioError in={ ' + command +
                              '; :put "STUDIO_IMPORT_OK" } do={ :put ("STUDIO_IMPORT_ERROR: " . $studioError) }')
        if not re.search(r'(?m)^\s*STUDIO_IMPORT_OK\s*$', output):
            raise AssertionError(output)

    def check(self, expression):
        output = self.command(':put (' + expression + ')')
        if not re.search(r'(?m)^\s*true\s*$', output):
            raise AssertionError(f"RouterOS assertion failed: {expression}\n{output}")

    def check_eventually(self, expression, attempts=15):
        for attempt in range(attempts):
            try:
                self.check(expression)
                return
            except AssertionError:
                if attempt == attempts - 1:
                    raise
                time.sleep(1)

    def verify_recovery(self, mode):
        name = 'CHR-' + mode.upper()
        password = 'StudioBackup-74682'
        self.command(f'/system backup save name=studio-lab password={password} dont-encrypt=no encryption=aes-sha256')
        self.check_eventually('[:len [/file find where name="studio-lab.backup"]] = 1')
        self.command('/system identity set name=TEMP-BEFORE-RESTORE')
        self.send(f'/system backup load name=studio-lab.backup password={password}')
        self.expect([re.compile(rb'Restore and reboot[^\r\n]*\[y/n\]', re.I)])
        self.send('y')
        self.expect([re.compile(rb'System configuration restored, rebooting now', re.I)])
        self.expect([re.compile(rb'Login: ?$', re.I)], timeout=100)
        self.send('admin')
        self.login()
        self.check(f'[/system identity get name] = "{name}"')


    def verify_timed_rollback(self, scratch):
        for kind in ('first','keep','timer'):
            file = 'rollback-' + kind + '.rsc'
            self.upload(scratch / file, file)
        self.import_fixture('rollback-first.rsc')
        self.check('[:len [/system scheduler find where name=studio-config-rollback and disabled=no]] = 1')
        self.import_fixture('rollback-keep.rsc')
        self.check('[:len [/system scheduler find where name=studio-config-rollback]] = 0')
        self.check('[:len [/file find where name="studio-restore-1111111122222222.backup"]] = 0')

        self.import_fixture('rollback-timer.rsc')
        self.check('[:len [/system scheduler find where name=studio-config-rollback and disabled=no]] = 1')
        self.command('/system identity set name=TEMP-WITHOUT-CONFIRM')
        self.check('[/system identity get name] = "TEMP-WITHOUT-CONFIRM"')
        self.send('/quit')
        self.expect([re.compile(rb'CHR-FAILOVER Login: ?$', re.I)], timeout=100)
        self.send('admin')
        self.login()
        self.check('[/system identity get name] = "CHR-FAILOVER"')
        self.check('[:len [/system scheduler find where name=studio-config-rollback]] = 0')



def start_guest(image, qemu, scratch, name, links, upstream=False):
    disk = scratch / (name + '.img')
    shutil.copyfile(image, disk)
    cmd = [qemu, '-display', 'none', '-vga', 'none', '-monitor', 'none', '-serial', 'stdio', '-m', '256',
           '-drive', f'file={disk},format=raw,if=ide,snapshot=on']
    for index in range(1, 4 if upstream else 6):
        link = links.get(index)
        if link:
            operation = 'connect' if upstream else 'listen'
            netdev = f'socket,id=net{index},{operation}=127.0.0.1:{link}'
        else:
            netdev = f'user,id=net{index},net=10.16.{index}.0/24'
        side = 13 if upstream else 12
        cmd += ['-netdev', netdev, '-device',
                f'e1000,netdev=net{index},mac=52:54:00:{side:02x}:00:{index:02x}']
    return Console(subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, bufsize=0))


def stop_guest(console):
    process = console.process
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    console.selector.close()


def reserve_ports():
    with socket.socket() as first, socket.socket() as second, socket.socket() as third:
        for sock in (first, second, third):
            sock.bind(('127.0.0.1', 0))
        return [sock.getsockname()[1] for sock in (first, second, third)]


def prepare_upstream(upstream):
    upstream.login()
    for command in (
        '/ip dhcp-client remove [find]',
        '/ip address add address=10.16.1.2/24 interface=ether1',
        '/ip address add address=10.16.2.2/24 interface=ether2',
        '/ip address add address=203.0.113.5/32 interface=ether1 comment=probe1',
        '/ip address add address=198.51.100.7/32 interface=ether2',
        '/ip pool add name=uplink ranges=10.16.1.15-10.16.1.15',
        '/ip dhcp-server network add address=10.16.1.0/24 gateway=10.16.1.2',
        '/ip dhcp-server add name=uplink interface=ether1 address-pool=uplink disabled=no',
    ):
        upstream.command(command)
    upstream.check('[:len [/ip dhcp-server find where name=uplink and disabled=no]] = 1')


def verify_recursive(console, upstream, scratch):
    main_active = '[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance={distance}]] = 1'
    console.check_eventually('[:len [/ip route find where dst-address=203.0.113.5/32 and comment="AUTO probe WAN1" and active=yes]] = 1')
    console.check('[:len [/ip route find where dst-address=198.51.100.7/32 and comment="AUTO probe WAN2" and active=yes]] = 1')
    console.check_eventually(main_active.format(distance=1))
    upstream.command('/ip address disable [find where comment=probe1]')
    console.check_eventually(main_active.format(distance=2), attempts=45)
    console.check('[:len [/interface ethernet find where name=ether1 and running=yes]] = 1')
    upstream.command('/ip address enable [find where comment=probe1]')
    console.check_eventually(main_active.format(distance=1), attempts=45)
    console.command('/interface ethernet disable ether1')
    console.check_eventually('[:len [/ip route find where dst-address=203.0.113.5/32 and comment="AUTO probe WAN1" and active=yes]] = 0')
    console.command('/interface ethernet enable ether1')
    console.check_eventually(main_active.format(distance=1), attempts=45)
    print('PASS RouterOS CHR recursive failover with WAN link up and DHCP rebind', flush=True)

    upstream.command('/interface pppoe-client add name=pppoe-lab interface=ether3 user=lab-user password=lab-test disabled=no')
    console.check_eventually('[:len [/ppp active find where name=lab-user and service=pppoe]] = 1')
    print('PASS RouterOS CHR PPPoE subscriber authentication between two guests', flush=True)

    console.upload(scratch / 'wireguard-live.rsc', 'wireguard-live.rsc')
    console.import_fixture('wireguard-live.rsc')
    reported = console.command(':put [/interface wireguard get wg-live public-key]')
    key = re.search(r'(?m)^\s*([A-Za-z0-9+/]{43}=)\s*$', reported)
    if not key:
        raise AssertionError(reported)
    private = (scratch / 'wireguard-client.key').read_text()
    upstream.command(f'/interface wireguard add name=wg-client listen-port=51831 private-key="{private}"')
    upstream.command('/ip address add address=10.81.0.2/24 interface=wg-client')
    upstream.command('/interface wireguard peers add interface=wg-client public-key="' + key[1] +
                     '" endpoint-address=10.16.1.15 endpoint-port=51830 allowed-address=10.81.0.1/32 persistent-keepalive=5s')
    console.check_eventually('[/interface wireguard peers get [find where interface=wg-live] current-endpoint-address] = 10.16.1.2')
    console.check('[/ping address=10.81.0.2 interface=wg-live count=3] = 3')
    console.check('[/interface wireguard peers get [find where interface=wg-live] rx] > 0')
    print('PASS RouterOS CHR WireGuard Remote Access handshake and traffic between two guests', flush=True)


def run(image, qemu, scratch, mode):
    ports = reserve_ports() if mode == 'recursive' else []
    console = start_guest(image, qemu, scratch, mode, dict(zip((1, 2, 5), ports)))
    upstream = None
    try:
        console.login()
        if mode == 'recursive':
            upstream = start_guest(image, qemu, scratch, 'upstream', dict(zip((1, 2, 3), ports)), upstream=True)
            prepare_upstream(upstream)
        console.command('/ip dhcp-client remove [find]')
        console.upload(scratch / (mode + '.rsc'))
        console.import_fixture('studio.rsc', dry_run=True)
        console.check('[:len [/interface bridge find where name=bridge-LAN]] = 0')
        console.import_fixture('studio.rsc')
        console.check(f'[/system identity get name] = "CHR-{mode.upper()}"')
        console.check('[/interface bridge get bridge-LAN vlan-filtering] = true')
        console.check('[:len [/ip dhcp-server find where name=dhcp-vlan10 and disabled=no]] = 1')
        console.check('[:len [/ppp secret find where name=lab-user and service=pppoe]] = 1')
        console.check('[:len [/ip firewall filter find where comment="Explicit remote WinBox"]] = 1')
        console.check('[:len [/routing table find where name=rt_WAN2]] = 1')
        console.check('[:len [/ip firewall mangle find where comment~"^PCC "]] ' +
                      ('= 0' if mode == 'failover' else '> 0'))
        if mode == 'recursive':
            verify_recursive(console, upstream, scratch)
            return
        console.check_eventually('[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance=1]] = 1')
        console.command('/interface ethernet disable ether1')
        console.check_eventually('[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance=2]] = 1')
        console.command('/interface ethernet enable ether1')
        console.check_eventually('[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance=1]] = 1')
        print(f'PASS RouterOS CHR 7.21.5 {mode}: import, VLAN/DHCP, PPPoE, WinBox rules and WAN link failover', flush=True)
        if mode == 'pcc':
            console.upload(scratch / 'wireguard.rsc', 'wireguard.rsc')
            console.import_fixture('wireguard.rsc')
            for role in ('remote','hub','site'):
                console.check(f'[:len [/interface wireguard find where name="wg-{role}"]] = 1')
                console.check(f'[:len [/interface wireguard peers find where interface="wg-{role}"]] = 1')
            console.check('[:len [/ip route find where dst-address=192.168.22.0/24 and gateway="wg-hub"]] = 1')
            console.check('[:len [/ip route find where dst-address=192.168.23.0/24 and gateway="wg-site"]] = 1')
            console.check('[:len [/ip firewall address-list find where list="wg-remote-mgmt"]] = 1')
            console.check('[:len [/ip firewall filter find where src-address-list="wg-remote-mgmt" and chain=input]] = 1')
            console.check('[:tostr [/ip service get winbox address]] ~ "10[.]80[.]1[.]2"')
            console.check('[:tostr [/ip service get winbox address]] ~ "10[.]16[.]2[.]2"')
            print('PASS RouterOS CHR WireGuard imports for Remote Access, Hub and Site-to-Site', flush=True)
        if mode == 'failover':
            console.verify_recovery(mode)
            print('PASS RouterOS CHR encrypted backup restore', flush=True)
            console.verify_timed_rollback(scratch)
            print('PASS RouterOS CHR confirmed changes and automatic rollback after session ended', flush=True)
    except Exception:
        for guest in (console, upstream):
            if guest:
                print(ANSI.sub(b'', guest.transcript[-12000:]).decode(errors='replace'), flush=True)
        raise
    finally:
        if upstream:
            stop_guest(upstream)
        stop_guest(console)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image', type=Path)
    parser.add_argument('--qemu', default='qemu-system-x86_64')
    parser.add_argument('--mode', choices=('pcc','failover','recursive'))
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='studio-chr-') as directory:
        scratch = Path(directory)
        subprocess.run(['node', ROOT / 'tests/chr/fixtures.cjs', directory], check=True)
        for mode in ([args.mode] if args.mode else ['pcc', 'failover', 'recursive']):
            run(args.image, args.qemu, scratch, mode)


if __name__ == '__main__':
    main()
