"""TrueType 글꼴 파일을 읽는 작은 도구 (표준 라이브러리만 쓴다).

두 가지에 쓴다.
 1. 글자 폭 재기: 줄바꿈을 미리 셈해서 글이 상자를 넘치지 않게 배치한다 (PPTX 는 넘침을 스스로 잡지 못한다).
 2. 글꼴 심기: PowerPoint 가 읽는 EOT 꼴로 감싸 .pptx 안에 넣는다 (글꼴이 깔리지 않은 학교 컴퓨터에서도 같은 모양).
fontTools 를 쓰지 않고 필요한 표(cmap, hmtx, hhea, head, OS/2, name)만 직접 읽는다. 의존성을 늘리지 않으려는 것이다.
"""
import struct


class Font:
    def __init__(self, path):
        self.path = path
        with open(path, 'rb') as f:
            self.data = f.read()
        d = self.data
        n = struct.unpack('>H', d[4:6])[0]
        self.tables = {}
        for i in range(n):
            tag, _, off, length = struct.unpack('>4sIII', d[12 + 16 * i: 28 + 16 * i])
            self.tables[tag.decode('latin-1')] = (off, length)
        off = self.tables['head'][0]
        self.units = struct.unpack('>H', d[off + 18: off + 20])[0]
        self.checksum_adj = struct.unpack('>I', d[off + 8: off + 12])[0]
        off = self.tables['hhea'][0]
        n_hmetrics = struct.unpack('>H', d[off + 34: off + 36])[0]
        off = self.tables['hmtx'][0]
        self.adv = [struct.unpack('>H', d[off + 4 * i: off + 4 * i + 2])[0] for i in range(n_hmetrics)]
        self.cmap = self._cmap()
        self._cache = {}

    def _cmap(self):
        d = self.data
        base = self.tables['cmap'][0]
        n = struct.unpack('>H', d[base + 2: base + 4])[0]
        best = None
        for i in range(n):
            pid, eid, off = struct.unpack('>HHI', d[base + 4 + 8 * i: base + 12 + 8 * i])
            fmt = struct.unpack('>H', d[base + off: base + off + 2])[0]
            if fmt == 12 and (pid, eid) in ((3, 10), (0, 4), (0, 6)):
                best = (12, base + off)
                break
            if fmt == 4 and (pid, eid) in ((3, 1), (0, 3)) and best is None:
                best = (4, base + off)
        out = {}
        fmt, at = best
        if fmt == 12:
            groups = struct.unpack('>I', d[at + 12: at + 16])[0]
            for g in range(groups):
                start, end, gid = struct.unpack('>III', d[at + 16 + 12 * g: at + 28 + 12 * g])
                for c in range(start, end + 1):
                    out[c] = gid + (c - start)
        else:
            segx2 = struct.unpack('>H', d[at + 6: at + 8])[0]
            seg = segx2 // 2
            ends = struct.unpack(f'>{seg}H', d[at + 14: at + 14 + segx2])
            starts = struct.unpack(f'>{seg}H', d[at + 16 + segx2: at + 16 + 2 * segx2])
            deltas = struct.unpack(f'>{seg}h', d[at + 16 + 2 * segx2: at + 16 + 3 * segx2])
            ro_at = at + 16 + 3 * segx2
            ros = struct.unpack(f'>{seg}H', d[ro_at: ro_at + segx2])
            for s in range(seg):
                for c in range(starts[s], ends[s] + 1):
                    if c == 0xFFFF:
                        continue
                    if ros[s] == 0:
                        gid = (c + deltas[s]) & 0xFFFF
                    else:
                        p = ro_at + 2 * s + ros[s] + 2 * (c - starts[s])
                        gid = struct.unpack('>H', d[p: p + 2])[0]
                        if gid:
                            gid = (gid + deltas[s]) & 0xFFFF
                    out[c] = gid
        return out

    def advance(self, ch):
        """글자 하나의 폭 (em 의 몇 배)"""
        w = self._cache.get(ch)
        if w is None:
            gid = self.cmap.get(ord(ch), 0)
            w = self.adv[min(gid, len(self.adv) - 1)] / self.units
            self._cache[ch] = w
        return w

    def width(self, text, size):
        return sum(self.advance(c) for c in text) * size

    # ───────── EOT (PowerPoint 가 .fntdata 로 읽는 꼴) ─────────

    def _table(self, tag):
        off, length = self.tables[tag]
        return self.data[off: off + length]

    def panose(self):
        return self._table('OS/2')[32:42]

    def panose_hex(self):
        return ''.join('%02X' % b for b in self.panose())

    def name(self, name_id):
        t = self._table('name')
        count, str_off = struct.unpack('>HH', t[2:6])
        for i in range(count):
            pid, eid, lid, nid, length, off = struct.unpack('>HHHHHH', t[6 + 12 * i: 18 + 12 * i])
            if nid == name_id and pid == 3:
                return t[str_off + off: str_off + off + length].decode('utf-16-be')
        return None

    def eot(self, family, style):
        """EOT 머리를 붙인 글꼴 (압축하지 않는다). 머리의 칸 차례는 EOT 2.2 꼴이다."""
        os2 = self._table('OS/2')
        fs_type = struct.unpack('>H', os2[8:10])[0]
        weight = struct.unpack('>H', os2[4:6])[0]
        fs_sel = struct.unpack('>H', os2[62:64])[0]
        ranges = struct.unpack('>IIII', os2[42:58])
        codepages = struct.unpack('>II', os2[78:86]) if len(os2) >= 86 else (0, 0)

        def u16(s):
            b = s.encode('utf-16-le')
            return struct.pack('<H', len(b)) + b
        ver = self.name(5) or 'Version 1.0'
        body = self.panose() + struct.pack('<BBIHH', 0x81, 1 if fs_sel & 1 else 0, weight, fs_type, 0x504C)
        body += struct.pack('<IIII', *ranges) + struct.pack('<II', *codepages)
        body += struct.pack('<I', self.checksum_adj) + b'\0' * 16
        body += b'\0\0' + u16(family) + b'\0\0' + u16(style) + b'\0\0' + u16(ver) + b'\0\0' + u16(family)
        body += b'\0\0' + struct.pack('<H', 0) + struct.pack('<II', 0, 0)
        body += b'\0\0' + struct.pack('<H', 0) + struct.pack('<II', 0, 0)
        head = struct.pack('<IIII', 16 + len(body) + len(self.data), len(self.data), 0x00020002, 0)
        return head + body + self.data
