#!/usr/bin/env python3
"""Generate 3 royalty-free musical demo tracks + beat-accurate multi-difficulty TJA charts."""

import json
import math
import os
import struct
import subprocess
import wave

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS_DIR = os.path.join(ROOT, "public", "songs")


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


class SynthBuffer:
    def __init__(self, duration_sec: float):
        self.n = int(duration_sec * SR)
        self.L = [0.0] * self.n
        self.R = [0.0] * self.n

    def add_pluck(self, t: float, midi: float, dur: float, amp: float = 0.22, pan: float = 0.0, bright: float = 1.0):
        """Shamisen / koto-inspired bright pentatonic pluck."""
        start = int(t * SR)
        length = min(int(dur * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        hz = midi_to_hz(midi)
        w1 = 2.0 * math.pi * hz / SR
        gl = amp * (0.707 - pan * 0.35)
        gr = amp * (0.707 + pan * 0.35)
        for i in range(length):
            dt = i / SR
            attack = min(1.0, dt / 0.004)
            env = attack * math.exp(-dt * (5.2 / max(0.18, dur)))
            h2_env = math.exp(-dt * 12.0) * 0.45 * bright
            h3_env = math.exp(-dt * 18.0) * 0.22 * bright
            s = (math.sin(w1 * i) + h2_env * math.sin(2.0 * w1 * i) + h3_env * math.sin(3.0 * w1 * i)) * env
            idx = start + i
            self.L[idx] += s * gl
            self.R[idx] += s * gr

    def add_lead(self, t: float, midi: float, dur: float, amp: float = 0.16, pan: float = 0.0):
        """Bright Japanese festival flute / synth lead."""
        start = int(t * SR)
        length = min(int(dur * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        hz = midi_to_hz(midi)
        w1 = 2.0 * math.pi * hz / SR
        gl = amp * (0.707 - pan * 0.35)
        gr = amp * (0.707 + pan * 0.35)
        for i in range(length):
            dt = i / SR
            attack = min(1.0, dt / 0.015)
            release = min(1.0, max(0.0, (dur - dt) / 0.04))
            vib = 1.0 + 0.004 * math.sin(2.0 * math.pi * 5.8 * dt)
            env = attack * release
            phase = w1 * i * vib
            # soft square-like flute overtone
            s = (math.sin(phase) + 0.32 * math.sin(2.0 * phase) + 0.12 * math.sin(3.0 * phase)) * env
            idx = start + i
            self.L[idx] += s * gl
            self.R[idx] += s * gr

    def add_bass(self, t: float, midi: float, dur: float, amp: float = 0.26):
        start = int(t * SR)
        length = min(int(dur * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        hz = midi_to_hz(midi)
        w1 = 2.0 * math.pi * hz / SR
        for i in range(length):
            dt = i / SR
            attack = min(1.0, dt / 0.008)
            env = attack * math.exp(-dt * 3.8)
            s = (math.sin(w1 * i) + 0.35 * math.sin(2.0 * w1 * i)) * env * amp
            idx = start + i
            self.L[idx] += s
            self.R[idx] += s

    def add_kick(self, t: float, amp: float = 0.34):
        start = int(t * SR)
        length = min(int(0.18 * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        phase = 0.0
        for i in range(length):
            dt = i / SR
            freq = 54.0 + 115.0 * math.exp(-dt * 28.0)
            phase += 2.0 * math.pi * freq / SR
            env = math.exp(-dt * 16.0)
            s = math.sin(phase) * env * amp
            idx = start + i
            self.L[idx] += s
            self.R[idx] += s

    def add_hat(self, t: float, amp: float = 0.09, open_hat: bool = False):
        start = int(t * SR)
        dur = 0.14 if open_hat else 0.045
        length = min(int(dur * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        decay = 14.0 if open_hat else 58.0
        # deterministic PRNG noise
        x = (start * 1103515245 + 12345) & 0x7FFFFFFF
        prev = 0.0
        for i in range(length):
            dt = i / SR
            x = (x * 1103515245 + 12345) & 0x7FFFFFFF
            raw = (x / 0x3FFFFFFF) - 1.0
            hp = raw - prev * 0.85
            prev = raw
            s = hp * math.exp(-dt * decay) * amp
            idx = start + i
            self.L[idx] += s * 0.9
            self.R[idx] += s * 1.1

    def add_clap(self, t: float, amp: float = 0.14):
        start = int(t * SR)
        length = min(int(0.11 * SR), self.n - start)
        if length <= 0 or start < 0:
            return
        x = (start * 1664525 + 1013904223) & 0x7FFFFFFF
        for i in range(length):
            dt = i / SR
            x = (x * 1664525 + 1013904223) & 0x7FFFFFFF
            raw = (x / 0x3FFFFFFF) - 1.0
            env = math.exp(-dt * 32.0)
            s = raw * env * amp
            idx = start + i
            self.L[idx] += s
            self.R[idx] += s

    def add_chime(self, t: float, midi: float, amp: float = 0.12):
        self.add_pluck(t, midi, 0.55, amp=amp, pan=0.25, bright=1.4)

    def write_m4a(self, out_m4a: str):
        peak = max(max(abs(v) for v in self.L), max(abs(v) for v in self.R), 1e-6)
        scale = 0.86 / peak
        tmp_wav = out_m4a + ".tmp.wav"
        with wave.open(tmp_wav, "wb") as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            buf = bytearray()
            for l_s, r_s in zip(self.L, self.R):
                il = max(-32767, min(32767, int(l_s * scale * 32767.0)))
                ir = max(-32767, min(32767, int(r_s * scale * 32767.0)))
                buf.extend(struct.pack("<hh", il, ir))
            wf.writeframes(bytes(buf))
        subprocess.run(
            ["afconvert", "-f", "m4af", "-d", "aac", "-b", "128000", tmp_wav, out_m4a],
            check=True,
        )
        os.remove(tmp_wav)


def build_matsuri_song():
    """Song 1: 夏祭り・初陣 (BPM 128, 24 measures, ~48s)."""
    bpm = 128.0
    beat = 60.0 / bpm
    measure = 4.0 * beat
    lead_in = 2.0 * beat  # 2-beat count-in before measure 0 -> OFFSET = -lead_in
    total_measures = 24
    buf = SynthBuffer(lead_in + total_measures * measure + 2.5)

    # Yo-scale in D: D(62), E(64), G(67), A(69), B(71), D5(74), E5(76), G5(79)
    # Count-in sticks
    buf.add_clap(0.0, 0.16)
    buf.add_clap(beat, 0.16)

    bass_prog = [38, 38, 43, 45, 38, 43, 45, 38]  # D2, D2, G2, A2...
    melody_a = [
        (0.0, 62, 0.5), (0.5, 64, 0.5), (1.0, 67, 1.0), (2.0, 69, 0.5), (2.5, 67, 0.5), (3.0, 64, 1.0),
        (0.0, 67, 0.5), (0.5, 69, 0.5), (1.0, 71, 1.0), (2.0, 74, 1.0), (3.0, 69, 1.0),
        (0.0, 74, 0.5), (0.5, 76, 0.5), (1.0, 74, 0.5), (1.5, 71, 0.5), (2.0, 69, 1.0), (3.0, 67, 1.0),
        (0.0, 64, 0.5), (0.5, 67, 0.5), (1.0, 69, 1.5), (2.5, 64, 0.5), (3.0, 62, 1.0),
    ]
    melody_gogo = [
        (0.0, 74, 0.5), (0.5, 74, 0.5), (1.0, 76, 0.5), (1.5, 79, 0.5), (2.0, 76, 0.5), (2.5, 74, 0.5), (3.0, 71, 1.0),
        (0.0, 69, 0.5), (0.5, 71, 0.5), (1.0, 74, 1.0), (2.0, 76, 0.5), (2.5, 74, 0.5), (3.0, 69, 1.0),
        (0.0, 74, 0.5), (0.5, 76, 0.5), (1.0, 79, 1.0), (2.0, 81, 0.5), (2.5, 79, 0.5), (3.0, 76, 1.0),
        (0.0, 74, 0.75), (0.75, 71, 0.25), (1.0, 74, 1.0), (2.0, 76, 1.0), (3.0, 74, 1.0),
    ]

    for m in range(total_measures):
        mt = lead_in + m * measure
        root = bass_prog[m % len(bass_prog)]
        is_gogo = 12 <= m < 20
        # Rhythm section
        for b in range(4):
            bt = mt + b * beat
            if b in (0, 2) or (is_gogo and b == 3):
                buf.add_kick(bt, 0.36 if is_gogo else 0.30)
            if b in (1, 3):
                buf.add_clap(bt, 0.14 if is_gogo else 0.10)
            buf.add_hat(bt, 0.08)
            buf.add_hat(bt + 0.5 * beat, 0.07, open_hat=(is_gogo and b == 3))
        # Bassline
        buf.add_bass(mt, root, beat * 1.8, 0.28)
        buf.add_bass(mt + 2 * beat, root + 7, beat * 0.9, 0.22)
        buf.add_bass(mt + 3 * beat, root + 5, beat * 0.9, 0.24)
        # Shamisen chords
        for b in range(4):
            buf.add_pluck(mt + b * beat, root + 24, beat * 0.6, 0.11, pan=-0.35)
            buf.add_pluck(mt + (b + 0.5) * beat, root + 31, beat * 0.45, 0.09, pan=0.35)

        # Melody phrasing
        if 2 <= m < 10:
            phrase = melody_a
            pm = (m - 2) % 4
            for off, note, d in [x for i, x in enumerate(phrase) if True]:
                pass
            # slice phrase per bar
            bars = [melody_a[0:6], melody_a[6:11], melody_a[11:17], melody_a[17:22]]
            for off, note, d in bars[pm]:
                buf.add_pluck(mt + off * beat, note, d * beat * 1.1, 0.24, pan=0.1)
                if m >= 6:
                    buf.add_lead(mt + off * beat, note + 12, d * beat * 0.95, 0.11, pan=-0.1)
        elif 10 <= m < 12:
            # Build-up drumroll section
            for k in range(8):
                buf.add_pluck(mt + k * 0.5 * beat, 62 + (k % 5) * 2, 0.3 * beat, 0.18)
        elif 12 <= m < 20:
            bars = [melody_gogo[0:7], melody_gogo[7:13], melody_gogo[13:19], melody_gogo[19:24]]
            for off, note, d in bars[(m - 12) % 4]:
                buf.add_lead(mt + off * beat, note, d * beat * 0.95, 0.19, pan=0.05)
                buf.add_pluck(mt + off * beat, note - 12, d * beat * 0.9, 0.18, pan=-0.15)
        elif 20 <= m < 24:
            # Finale
            if m == 20:
                buf.add_chime(mt, 74, 0.20)
                buf.add_chime(mt + 2 * beat, 79, 0.20)
            elif m == 21:
                buf.add_chime(mt, 81, 0.22)
                buf.add_chime(mt + 2 * beat, 74, 0.22)
            elif m == 22:
                for k in range(8):
                    buf.add_pluck(mt + k * 0.5 * beat, 74 + (k % 4) * 2, 0.25 * beat, 0.20)
            elif m == 23:
                buf.add_lead(mt, 74, 3.0 * beat, 0.22)
                buf.add_bass(mt, 38, 3.0 * beat, 0.30)

    song_dir = os.path.join(SONGS_DIR, "matsuri-first-beat")
    os.makedirs(song_dir, exist_ok=True)
    buf.write_m4a(os.path.join(song_dir, "main.m4a"))

    tja = f"""TITLE:夏祭り・初陣
SUBTITLE:--Matsuri First Beat (Demo)
BPM:128
WAVE:main.m4a
OFFSET:{-lead_in:.4f}
DEMOSTART:{lead_in + 12 * measure:.2f}
GENRE:Namco Original

COURSE:Easy
LEVEL:2
BALLOON:6
#START
10001000,
10002000,
10001000,
20001000,
10102000,
10002000,
10101000,
30000000,
10201020,
10102000,
50000008,
00000000,
#GOGOSTART
10102010,
10201000,
10102020,
30004000,
10102010,
20201000,
10102010,
30000000,
#GOGOEND
70000008,
00003000,
10201020,
30000000,
#END

COURSE:Normal
LEVEL:4
BALLOON:10
#START
10102000,
10201000,
10102010,
20102000,
10102020,
10201010,
10121020,
30004000,
10201020,
11201120,
50000000,
00000008,
#GOGOSTART
10121020,
10212010,
11201120,
30204000,
10121020,
20212010,
11211020,
30004000,
#GOGOEND
70000000,
00083000,
11201120,
30000000,
#END

COURSE:Hard
LEVEL:6
BALLOON:14
#START
10121020,
10212010,
11201210,
22102120,
10121022,
11202110,
11211221,
30124000,
11201210,
11212210,
60000000,
00000008,
#GOGOSTART
11201121,
22102212,
11211022,
30114022,
12102120,
11212212,
11201212,
30214000,
#GOGOEND
70000000,
00083040,
11212212,
30000000,
#END

COURSE:Oni
LEVEL:8
BALLOON:18
#START
1120121011202120,
1210212011212010,
1121122110201210,
2212211210213000,
1121102122122012,
1120121221201120,
1121221211212121,
3011202240121000,
1212102011212210,
1121121222121120,
6000000000000000,
0000000000000008,
#GOGOSTART
1121121022122120,
1212112021212210,
1121221211212121,
3011212040221210,
1210112121202212,
1121212212112120,
1121221212121121,
3012102140003000,
#GOGOEND
7000000000000000,
0000000830214012,
1121221212121121,
3000000000000000,
#END
"""
    with open(os.path.join(song_dir, "main.tja"), "w", encoding="utf-8") as f:
        f.write(tja)

    return {
        "id": "matsuri-first-beat",
        "title": "夏祭り・初陣",
        "subtitle": "Matsuri First Beat (Built-in)",
        "genre": "Namco Original",
        "genreId": 6,
        "bpm": 128,
        "chartUrl": "/songs/matsuri-first-beat/main.tja",
        "audioUrl": "/songs/matsuri-first-beat/main.m4a",
        "demoStart": round(lead_in + 12 * measure, 2),
        "courses": {"easy": 2, "normal": 4, "hard": 6, "oni": 8},
    }


def build_sakura_song():
    """Song 2: 桜風・疾風太鼓 (BPM 160, 28 measures, ~45s)."""
    bpm = 160.0
    beat = 60.0 / bpm
    measure = 4.0 * beat
    lead_in = 2.0 * beat
    total_measures = 28
    buf = SynthBuffer(lead_in + total_measures * measure + 2.5)

    # Japanese Hirajoshi-ish minor pentatonic in A minor: A(69), B(71), C(72), E(76), F(77), A5(81)
    buf.add_clap(0.0, 0.16)
    buf.add_clap(beat, 0.16)

    bass_prog = [45, 41, 43, 45, 45, 41, 40, 45]  # A2, F2, G2, A2, A2, F2, E2, A2
    verse_bars = [
        [(0.0, 69, 0.5), (0.5, 72, 0.5), (1.0, 76, 0.5), (1.5, 72, 0.5), (2.0, 71, 1.0), (3.0, 69, 1.0)],
        [(0.0, 65, 0.5), (0.5, 69, 0.5), (1.0, 72, 1.0), (2.0, 71, 0.5), (2.5, 69, 0.5), (3.0, 67, 1.0)],
        [(0.0, 67, 0.5), (0.5, 71, 0.5), (1.0, 74, 0.5), (1.5, 76, 0.5), (2.0, 72, 1.0), (3.0, 71, 1.0)],
        [(0.0, 69, 1.0), (1.0, 76, 0.5), (1.5, 74, 0.5), (2.0, 72, 0.5), (2.5, 71, 0.5), (3.0, 69, 1.0)],
    ]
    gogo_bars = [
        [(0.0, 81, 0.5), (0.5, 76, 0.5), (1.0, 77, 0.5), (1.5, 76, 0.5), (2.0, 72, 0.5), (2.5, 76, 0.5), (3.0, 81, 1.0)],
        [(0.0, 79, 0.5), (0.5, 76, 0.5), (1.0, 74, 0.5), (1.5, 72, 0.5), (2.0, 71, 0.5), (2.5, 72, 0.5), (3.0, 76, 1.0)],
        [(0.0, 77, 0.5), (0.5, 76, 0.5), (1.0, 72, 0.5), (1.5, 76, 0.5), (2.0, 79, 0.5), (2.5, 81, 0.5), (3.0, 83, 1.0)],
        [(0.0, 84, 0.5), (0.5, 83, 0.5), (1.0, 81, 0.5), (1.5, 76, 0.5), (2.0, 79, 0.5), (2.5, 76, 0.5), (3.0, 81, 1.0)],
    ]

    for m in range(total_measures):
        mt = lead_in + m * measure
        root = bass_prog[m % len(bass_prog)]
        is_gogo = 14 <= m < 24
        for b in range(4):
            bt = mt + b * beat
            buf.add_kick(bt, 0.34 if is_gogo else 0.28)
            if b in (1, 3):
                buf.add_clap(bt, 0.15 if is_gogo else 0.11)
            buf.add_hat(bt, 0.08)
            buf.add_hat(bt + 0.5 * beat, 0.08, open_hat=(is_gogo and b in (1, 3)))
        # Driving 8th bass
        for e in range(8):
            buf.add_bass(mt + e * 0.5 * beat, root + (12 if e % 2 == 1 else 0), 0.42 * beat, 0.22)

        if 2 <= m < 12:
            for off, note, d in verse_bars[(m - 2) % 4]:
                buf.add_pluck(mt + off * beat, note, d * beat, 0.25, pan=-0.12, bright=1.3)
                if m >= 6:
                    buf.add_lead(mt + off * beat, note + 12, d * beat * 0.9, 0.12, pan=0.12)
        elif 12 <= m < 14:
            for k in range(8):
                buf.add_pluck(mt + k * 0.5 * beat, 69 + (k % 4) * 3, 0.3 * beat, 0.20)
        elif 14 <= m < 24:
            for off, note, d in gogo_bars[(m - 14) % 4]:
                buf.add_lead(mt + off * beat, note, d * beat * 0.9, 0.20, pan=0.05)
                buf.add_pluck(mt + off * beat, note - 12, d * beat * 0.85, 0.19, pan=-0.18, bright=1.4)
        elif 24 <= m < 28:
            if m < 27:
                for off, note, d in verse_bars[(m - 24) % 4]:
                    buf.add_pluck(mt + off * beat, note + 12, d * beat, 0.22, pan=0.0)
            else:
                buf.add_lead(mt, 81, 3.0 * beat, 0.24)
                buf.add_bass(mt, 45, 3.0 * beat, 0.30)

    song_dir = os.path.join(SONGS_DIR, "sakura-wind-taiko")
    os.makedirs(song_dir, exist_ok=True)
    buf.write_m4a(os.path.join(song_dir, "main.m4a"))

    tja = f"""TITLE:桜風・疾風太鼓
SUBTITLE:--Sakura Wind Taiko (Demo)
BPM:160
WAVE:main.m4a
OFFSET:{-lead_in:.4f}
DEMOSTART:{lead_in + 14 * measure:.2f}
GENRE:Anime

COURSE:Easy
LEVEL:3
BALLOON:8
#START
10002000,
10001000,
10201000,
20001000,
10102000,
20201000,
10201020,
30000000,
10102000,
10201000,
10102020,
30004000,
50000000,
00000008,
#GOGOSTART
10102010,
20201020,
10102020,
30004000,
10201020,
10102000,
20201010,
30004000,
10102010,
30000000,
#GOGOEND
70000000,
00083000,
10201020,
30000000,
#END

COURSE:Normal
LEVEL:5
BALLOON:12
#START
10102010,
20102000,
10121020,
20212010,
11201120,
10201210,
11202210,
30004000,
10121020,
11201210,
22102120,
30204010,
50000000,
00000008,
#GOGOSTART
11201120,
22102210,
11211020,
30104020,
12102120,
11202210,
11212210,
30204000,
11201210,
30004000,
#GOGOEND
70000000,
00083040,
11202210,
30000000,
#END

COURSE:Hard
LEVEL:7
BALLOON:16
#START
10121021,
20212012,
11201210,
22102120,
11211022,
22122011,
12102120,
30124021,
11212012,
22121021,
11212212,
30114022,
60000000,
00000008,
#GOGOSTART
11211210,
22122120,
12121120,
30114022,
11212212,
21211210,
11201212,
30214012,
11212212,
30124000,
#GOGOEND
70000000,
00083040,
11212212,
30000000,
#END

COURSE:Oni
LEVEL:9
BALLOON:22
#START
1120121011212010,
2210212022121020,
1121121220112120,
3011202240121021,
1121221210211210,
2212112120122120,
1212112121212212,
3011212040221210,
1120112122102212,
1211212021221210,
1121221212121121,
3012102140212012,
6000000000000000,
0000000000000008,
#GOGOSTART
#SCROLL 1.25
1121121222122121,
1212112121212212,
1121221211212121,
3011212240221211,
1210112121202212,
1121212212112120,
1212112122121212,
3012112040212210,
#SCROLL 1.0
1121221212121121,
3011202240003000,
#GOGOEND
7000000000000000,
0000000830214012,
1121221212121121,
3000000000000000,
#END
"""
    with open(os.path.join(song_dir, "main.tja"), "w", encoding="utf-8") as f:
        f.write(tja)

    return {
        "id": "sakura-wind-taiko",
        "title": "桜風・疾風太鼓",
        "subtitle": "Sakura Wind Taiko (Built-in)",
        "genre": "Anime",
        "genreId": 1,
        "bpm": 160,
        "chartUrl": "/songs/sakura-wind-taiko/main.tja",
        "audioUrl": "/songs/sakura-wind-taiko/main.m4a",
        "demoStart": round(lead_in + 14 * measure, 2),
        "courses": {"easy": 3, "normal": 5, "hard": 7, "oni": 9},
    }


def build_calibration_song():
    """Song 3: 节奏校准・初鼓 (BPM 120, 16 measures, ~34s)."""
    bpm = 120.0
    beat = 60.0 / bpm
    measure = 4.0 * beat
    lead_in = 2.0 * beat
    total_measures = 16
    buf = SynthBuffer(lead_in + total_measures * measure + 2.0)

    buf.add_clap(0.0, 0.16)
    buf.add_clap(beat, 0.16)

    scale = [60, 62, 64, 67, 69, 72, 74, 76]
    for m in range(total_measures):
        mt = lead_in + m * measure
        is_gogo = 8 <= m < 12
        for b in range(4):
            bt = mt + b * beat
            buf.add_kick(bt, 0.34)
            buf.add_hat(bt + 0.5 * beat, 0.08)
            if b in (1, 3):
                buf.add_clap(bt, 0.14)
            note = scale[(m * 2 + b) % len(scale)]
            buf.add_pluck(bt, note, beat * 0.85, 0.20 if not is_gogo else 0.24, pan=(-0.15 if b % 2 == 0 else 0.15))
            if is_gogo:
                buf.add_lead(bt, note + 12, beat * 0.75, 0.12)
        buf.add_bass(mt, 36 + (m % 4) * 2, beat * 1.8, 0.24)
        buf.add_bass(mt + 2 * beat, 43, beat * 1.8, 0.20)

    song_dir = os.path.join(SONGS_DIR, "calibration-groove")
    os.makedirs(song_dir, exist_ok=True)
    buf.write_m4a(os.path.join(song_dir, "main.m4a"))

    tja = f"""TITLE:节奏校准・初鼓
SUBTITLE:--Calibration & Practice Groove (BPM 120)
BPM:120
WAVE:main.m4a
OFFSET:{-lead_in:.4f}
DEMOSTART:{lead_in + 4 * measure:.2f}
GENRE:Variety

COURSE:Easy
LEVEL:1
BALLOON:5
#START
10001000,
20002000,
10102000,
10201000,
10101020,
20202010,
10201020,
30000000,
#GOGOSTART
10102020,
10201020,
10102010,
30004000,
#GOGOEND
50000008,
70000008,
10201020,
30000000,
#END

COURSE:Normal
LEVEL:3
BALLOON:8
#START
10102010,
20201020,
10121020,
20212010,
11201120,
22102210,
10201120,
30004000,
#GOGOSTART
11201210,
22102120,
11211020,
30204000,
#GOGOEND
50000008,
70000008,
11202210,
30000000,
#END

COURSE:Hard
LEVEL:5
BALLOON:12
#START
10121020,
20212010,
11201210,
22102120,
11211022,
22122011,
11212210,
30124000,
#GOGOSTART
11211210,
22122120,
11212212,
30114022,
#GOGOEND
60000008,
70000008,
11212212,
30000000,
#END
"""
    with open(os.path.join(song_dir, "main.tja"), "w", encoding="utf-8") as f:
        f.write(tja)

    return {
        "id": "calibration-groove",
        "title": "节奏校准・初鼓",
        "subtitle": "Calibration & Practice Groove (Built-in)",
        "genre": "Variety",
        "genreId": 3,
        "bpm": 120,
        "chartUrl": "/songs/calibration-groove/main.tja",
        "audioUrl": "/songs/calibration-groove/main.m4a",
        "demoStart": round(lead_in + 4 * measure, 2),
        "courses": {"easy": 1, "normal": 3, "hard": 5},
    }


def main():
    os.makedirs(SONGS_DIR, exist_ok=True)
    songs = [
        build_matsuri_song(),
        build_sakura_song(),
        build_calibration_song(),
    ]
    manifest_path = os.path.join(SONGS_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "songs": songs}, f, ensure_ascii=False, indent=2)
    print(f"Generated {len(songs)} demo songs into {SONGS_DIR}")


if __name__ == "__main__":
    main()
