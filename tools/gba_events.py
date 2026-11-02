"""
Mimas: Saturn events (pages, conditions, commands) compiled into a compact script for the GBA runtime.

Each map gets one list of 16-bit words (`code`; word 0 is END, so a page with code 0 does nothing), its events and
their pages. Conditions and text are shared by the whole game. What the GBA can't do yet is skipped and reported
(the editor's GBA check lists the same things), so nothing disappears silently.

The script (game/src/main.cpp runs it; keep the two in step, and the op numbers with the enum export.py writes):
  END
  TEXT str speaker bubble          speaker: -3 the running event, -1 the player, -2 nobody, k event k of the map
  CHOICE n str*n cancel target*n   cancel -1: B does nothing; each branch ends with JUMP to after the choice
  JUMP addr
  IF cond else_addr
  SWITCH id value
  VAR id op value                  op 0 set, 1 add
  SELF letter value                letter 0..3 (A..D) of the running event
  GIVE item count str              str: the "Received …!" line (-1: silent)
  TAKE item count
  GOLD set value str               set 1: set, 0: add
  TRANSFER map x y dir             dir -1: keep facing
  WAIT frames
  FADEOUT frames
  FADEIN frames
  BATTLE str troop                 GBA battles come with the next update: a line for now

Text: \\v[name] becomes {Vn} (the variable's value) and \\s[name] {Sn} (ON / OFF); Saturn's rich-text tags are dropped.
"""
import re

OPS = ['END', 'TEXT', 'CHOICE', 'JUMP', 'IF', 'SWITCH', 'VAR', 'SELF', 'GIVE', 'TAKE', 'GOLD', 'TRANSFER', 'WAIT',
       'FADEOUT', 'FADEIN', 'BATTLE']
OP = {n: i for i, n in enumerate(OPS)}
DIRS = {'down': 0, 'up': 1, 'left': 2, 'right': 3}
TRIGGERS = {'action': 0, 'touch': 1, 'auto': 2, 'none': 3}
VAR_OPS = {'>=': 0, '<=': 1, '==': 2, '>': 3, '<': 4}
SELF_LETTERS = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
I16 = lambda v: max(-32768, min(32767, int(v)))

# Commands that only mean something in the HD-2D game: skipped quietly.
QUIET = {'weather', 'heroWeather', 'temperature', 'ambience', 'fieldWeapons', 'journalTab', 'tutorial', 'console',
         'roost', 'horse', 'stable', 'tendFire', 'sound', 'music'}


class Compiler:
    """Shared by every map: switches, variables, conditions, text, self-switch slots, warnings."""

    def __init__(self, db, map_index, wrap):
        self.db = db
        self.map_index = map_index            # map id -> index in the ROM
        self.wrap = wrap                      # wrap(text, bubble) -> pages of lines
        items = db.get('items', [])
        self.items = {it.get('id'): n for n, it in enumerate(items)}
        self.item_names = [it.get('name') or it.get('id', '?') for it in items]
        self.troops = {t.get('id'): t for t in db.get('troops', [])}
        self.enemies = {e.get('id'): e for e in db.get('enemies', [])}
        self.switches, self.vars, self.strings = {}, {}, []
        self.string_index = {}
        self.conds = [(0, 0, 0, 0)]           # 0: always
        self.cond_index = {(0, 0, 0, 0): 0}
        self.self_count = 0
        self.warnings = []
        self.where = ''

    # ------------------------------------------------------------- names

    def sw(self, name):
        return self.switches.setdefault(str(name), len(self.switches))

    def var(self, name):
        return self.vars.setdefault(str(name), len(self.vars))

    def text(self, s):
        if s not in self.string_index:
            self.string_index[s] = len(self.strings)
            self.strings.append(s)
        return self.string_index[s]

    def warn(self, what):
        msg = f'{self.where}: {what}'
        if msg not in self.warnings:
            self.warnings.append(msg)

    def plain(self, text):
        # variables and switches first (their [name] isn't a rich-text tag), then the tags go
        text = re.sub(r'\\v\[([^\]]+)\]', lambda m: '{V%d}' % self.var(m.group(1).strip()), text or '')
        text = re.sub(r'\\s\[([^\]]+)\]', lambda m: '{S%d}' % self.sw(m.group(1).strip()), text)
        text = re.sub(r'\[/?[a-zA-Z]+(?:=[^\]]*)?\]', '', text)
        if '\\rp[' in text or '\\fire' in text:
            self.warn('text with \\rp[…] or \\fire (HD-2D only): left out')
        text = re.sub(r'\\rp\[[^\]]*\]', '', text).replace('\\fire', '')
        return text

    def message(self, text, bubble=False):
        return self.text('\f'.join('\n'.join(p) for p in self.wrap(self.plain(text), bubble)))

    def cond(self, c):
        """A condition's index (0: always). Ones the GBA can't check count as met, with a warning."""
        if not c:
            return 0
        if 'switch' in c:
            t = (1, 0, self.sw(c['switch']), 1 if c.get('is', True) else 0)
        elif 'self' in c:
            t = (2, 0, SELF_LETTERS.get(c['self'], 0), 1 if c.get('is', True) else 0)
        elif 'var' in c:
            t = (3, VAR_OPS.get(c.get('op', '>='), 0), self.var(c['var']), I16(c.get('value', 0)))
        elif 'item' in c:
            if c['item'] not in self.items:
                self.warn(f'a condition on an item that isn\'t in the Database ({c["item"]}): treated as met')
                return 0
            t = (4, 0, self.items[c['item']], I16(c.get('count', 1)))
        elif 'gold' in c:
            t = (5, 0, 0, I16(c['gold']))
        else:
            self.warn(f'a condition the GBA can\'t check yet ({", ".join(sorted(c.keys()))}): treated as met')
            return 0
        if t not in self.cond_index:
            self.cond_index[t] = len(self.conds)
            self.conds.append(t)
        return self.cond_index[t]

    # ------------------------------------------------------------- one map

    def map_events(self, map_id, saturn, sprite_of):
        """(code, pages, events) for one map. sprite_of(page) gives a page's sprite (-1 none, -2 the player's)."""
        code = [OP['END']]
        events = [e for e in saturn.get('events', []) if 0 <= e.get('x', -1) < saturn['width'] and 0 <= e.get('z', -1) < saturn['height']]
        ev_index = {e.get('id'): k for k, e in enumerate(events)}
        pages_out, events_out = [], []

        def emit(*words):
            code.extend(I16(w) for w in words)

        def block(cmds):
            for c in cmds or []:
                command(c)

        def command(c):
            k = c.get('cmd')
            if k == 'text':
                bubble = c.get('bubble') == 'speech'
                text = c.get('text', '')
                if c.get('speaker') and not bubble:
                    text = f'{c["speaker"]}: {text}'   # the GBA box has no name tag: the name leads the line
                emit(OP['TEXT'], self.message(text, bubble), -3 if bubble else -2, 1 if bubble else 0)
            elif k == 'choice':
                opts = [self.plain(o)[:24] for o in c.get('options', [])][:4]
                if not opts:
                    return
                if len(c.get('options', [])) > 4:
                    self.warn('a choice with more than 4 options: only the first 4 fit on the GBA')
                n = len(opts)
                cancel = c.get('cancel')
                emit(OP['CHOICE'], n, *[self.text(o) for o in opts], cancel if isinstance(cancel, int) and 0 <= cancel < n else -1)
                targets = len(code)
                emit(*([0] * n))
                ends = []
                branches = c.get('branches') or []
                for i in range(n):
                    code[targets + i] = len(code)
                    block(branches[i] if i < len(branches) else [])
                    emit(OP['JUMP'], 0)
                    ends.append(len(code) - 1)
                for e in ends:
                    code[e] = len(code)
            elif k == 'if':
                emit(OP['IF'], self.cond(c.get('condition')), 0)
                else_at = len(code) - 1
                block(c.get('then'))
                if c.get('else'):
                    emit(OP['JUMP'], 0)
                    end_at = len(code) - 1
                    code[else_at] = len(code)
                    block(c.get('else'))
                    code[end_at] = len(code)
                else:
                    code[else_at] = len(code)
            elif k == 'setSwitch':
                emit(OP['SWITCH'], self.sw(c['switch']), 1 if c.get('value') else 0)
            elif k == 'setVar':
                emit(OP['VAR'], self.var(c['var']), 1 if c.get('op') == 'add' else 0, c.get('value', 0))
            elif k == 'selfSwitch':
                emit(OP['SELF'], SELF_LETTERS.get(c.get('letter', 'A'), 0), 1 if c.get('value') else 0)
            elif k in ('giveItem', 'takeItem'):
                if c.get('item') not in self.items:
                    self.warn(f'{"Give" if k == "giveItem" else "Take"} item: “{c.get("item")}” isn\'t in the Database')
                    return
                n = max(1, int(c.get('count', 1)))
                it = self.items[c['item']]
                if k == 'giveItem':
                    name = self.item_names[it]
                    msg = -1 if c.get('silent') else self.message(f'Received {str(n) + " x " if n > 1 else ""}{name}!')
                    emit(OP['GIVE'], it, n, msg)
                else:
                    emit(OP['TAKE'], it, n)
            elif k == 'gold':
                v = int(c.get('value', 0))
                msg = self.message(f'Received {v} gold!') if c.get('op') == 'add' and v > 0 and not c.get('silent') else -1
                emit(OP['GOLD'], 1 if c.get('op') == 'set' else 0, v, msg)
            elif k == 'transfer':
                mi = self.map_index.get(c.get('map'))
                if mi is None:
                    self.warn(f'a transfer to “{c.get("map")}”, which isn\'t a GBA map: skipped')
                    return
                emit(OP['TRANSFER'], mi, int(float(c.get('x', 0))), int(float(c.get('z', 0))), DIRS.get(c.get('dir'), -1))
            elif k == 'wait':
                emit(OP['WAIT'], max(1, round(float(c.get('seconds', 1) or 0) * 60)))
            elif k in ('fadeOut', 'fadeIn'):
                emit(OP['FADEOUT' if k == 'fadeOut' else 'FADEIN'], max(1, round(float(c.get('seconds', 0.5) or 0.5) * 60)))
            elif k == 'battle':
                names = ', '.join(dict.fromkeys(self.enemies.get(e, {}).get('name', e) for e in c.get('enemies', [])))
                self.warn('Start battle: GBA battles come with the next update (the ROM shows a line for now)')
                emit(OP['BATTLE'], self.message(f'A battle with {names or "foes"}! (GBA battles come soon.)'), 0)
            elif k in QUIET:
                pass
            else:
                self.warn(f'the “{k}” command isn\'t on the GBA yet: skipped')

        for e in events:
            self.where = f'{map_id} · event {e.get("name") or e.get("id")}'
            first = len(pages_out)
            for pg in e.get('pages', []):
                if pg.get('enemy'):
                    self.warn('an enemy on the map: GBA battles come with the next update (left out)')
                if pg.get('sprite') and not pg.get('gbaSprite') and sprite_of(pg) == -1:
                    self.warn(f'the object sprite “{pg["sprite"]}” has no GBA picture yet (save the map in the editor)')
                if pg.get('character') and not pg.get('gbaSprite'):
                    self.warn('a Saturn character: the player\'s GBA sprite stands in for it')
                cmds = pg.get('commands', [])
                start = len(code) if cmds else 0
                if cmds:
                    block(cmds)
                    emit(OP['END'])
                pages_out.append((self.cond(pg.get('condition')), sprite_of(pg), DIRS.get(pg.get('dir', 'down'), 0),
                                  TRIGGERS.get(pg.get('trigger', 'action'), 0), bool(pg.get('solid')), bool(pg.get('facePlayer')), start))
            events_out.append((e['x'], e['z'], max(1, int(e.get('w', 1))), max(1, int(e.get('h', 1))), first,
                               len(pages_out) - first, self.self_count))
            self.self_count += 1
        if len(code) > 32000:
            self.warn('this map\'s events are too long for the GBA (split them over more maps)')
        return code, pages_out, events_out
