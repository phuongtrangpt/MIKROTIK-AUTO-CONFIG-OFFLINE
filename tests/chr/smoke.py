"""Run generated configurations on disposable RouterOS CHR disks using QEMU."""
import argparse
import os
from pathlib import Path
import re
import selectors
import shutil
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

    def send(self, command):
        self.process.stdin.write(command.encode() + b'\r')
        self.process.stdin.flush()

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
        password = ''
        for _ in range(12):
            idx, _ = self.expect(patterns, timeout=100)
            if idx == 5:
                return
            replies = ['admin', password, 'n', 'StudioLab-62159', 'StudioLab-62159']
            self.send(replies[idx])
            if idx == 4:
                password = replies[idx]
        raise RuntimeError("Unable to log into CHR serial console")

    def command(self, command):
        self.sequence += 1
        marker = f"__STUDIO_{self.sequence}_END__"
        self.send(command)
        self.send(f':put "{marker}"')
        _, lines = self.expect([re.compile(rb'[\r\n]+' + marker.encode() + rb'[\r\n]+')], timeout=60)
        self.expect([PROMPT])
        return lines.decode(errors='replace')

    def upload(self, file):
        self.command(':global studioFixture ""')
        data = file.read_bytes()
        for index in range(0, len(data), 400):
            fragment = ''.join(f'\\{value:02X}' for value in data[index:index + 400])
            self.command(':global studioFixture; :set studioFixture ($studioFixture . "' + fragment + '")')
        self.command('/file print file=studio-upload')
        self.command(':global studioFixture; /file set studio-upload.txt contents=$studioFixture')
        self.command('/file set studio-upload.txt name=studio.rsc')
        self.check('[/file get studio.rsc size] = ' + str(len(data)))

    def check(self, expression):
        output = self.command(':put (' + expression + ')')
        if not re.search(r'(?m)^\s*true\s*$', output):
            raise AssertionError(f"RouterOS assertion failed: {expression}\n{output}")


def run(image, qemu, scratch, mode):
    disk = scratch / (mode + '.img')
    shutil.copyfile(image, disk)
    cmd = [qemu, '-display','none','-vga','none','-monitor','none','-serial','stdio','-m','256',
           '-drive',f'file={disk},format=raw,if=ide,snapshot=on']
    for index in range(1, 6):
        cmd += ['-netdev',f'user,id=net{index},net=10.16.{index}.0/24',
                '-device',f'e1000,netdev=net{index},mac=52:54:00:12:00:{index:02x}']
    process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, bufsize=0)
    console = Console(process)
    try:
        console.login()
        console.command('/ip dhcp-client remove [find]')
        console.upload(scratch / (mode + '.rsc'))
        outcome = console.command('/import file-name=studio.rsc verbose=yes')
        if 'Script file loaded and executed successfully' not in outcome:
            raise AssertionError(outcome)
        console.check(f'[/system identity get name] = "CHR-{mode.upper()}"')
        console.check('[/interface bridge get bridge-LAN vlan-filtering] = true')
        console.check('[:len [/ip dhcp-server find where name=dhcp-vlan10 and disabled=no]] = 1')
        console.check('[:len [/ppp secret find where name=lab-user and service=pppoe]] = 1')
        console.check('[:len [/ip firewall filter find where comment="Explicit remote WinBox"]] = 1')
        console.check('[:len [/routing table find where name=rt_WAN2]] = 1')
        console.check('[:len [/ip firewall mangle find where per-connection-classifier!=""]] ' +
                      ('> 0' if mode == 'pcc' else '= 0'))
        console.check('[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance=1]] = 1')
        console.command('/interface ethernet disable ether1')
        for _ in range(15):
            try:
                console.check('[:len [/ip route find where dst-address=0.0.0.0/0 and routing-table=main and active=yes and distance=2]] = 1')
                break
            except AssertionError:
                time.sleep(1)
        else:
            raise AssertionError('Backup route did not activate after disabling WAN1')
        print(f'PASS RouterOS CHR 7.21.5 {mode}: import, VLAN/DHCP, PPPoE, WinBox rules and WAN link failover', flush=True)
    except Exception:
        print(ANSI.sub(b'', console.transcript[-16000:]).decode(errors='replace'), flush=True)
        raise
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        console.selector.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('image', type=Path)
    parser.add_argument('--qemu', default='qemu-system-x86_64')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='studio-chr-') as directory:
        scratch = Path(directory)
        subprocess.run(['node', ROOT / 'tests/chr/fixtures.cjs', directory], check=True)
        for mode in ('pcc', 'failover'):
            run(args.image, args.qemu, scratch, mode)


if __name__ == '__main__':
    main()
