// CARL-01 — the wire (CANON §4). One connection. Attach framing, then blocks:
//   {t:'sseinit', session, tag} → {t:'ready', ok:true}
//   {t:'open', id} / {t:'re', id, F, n, tr, c} / {t:'close', id}
// Row tape: [state cell][decoration cell][text]; \n and \b in-band; the
// 2-char content margin rides in the tape. PASS-FIRST: the server's pace is
// the actual pace — this client is the assembler: per-id frame buffer keyed
// by n, ripple-insert at n (a late frame lands on its own n, bumps nothing
// ahead), re-paint from the drip point downward only — upstream rows are
// never touched. Gaps are marked visibly (◌), never hidden.

export interface WireFrame {
  t: 'sseinit' | 'ready' | 'open' | 're' | 'close';
  session?: string;
  tag?: string;
  ok?: boolean;
  id?: string;
  F?: number;
  n?: number;
  tr?: number;
  c?: string;
}

export interface Row {
  state: string; // gutter col 0: '' | spinner glyph | « | »
  deco: string; // gutter col 1: '' | ┌ | │ | └
  text: string; // content col (col 3+)
}

export interface Block {
  id: string;
  rows: (Row | null)[]; // index = n; null = in-flight gap (marked visibly)
  closed: boolean;
}

export const SPIN = ['⣶', '⣧', '⣏', '⡟', '⠿', '⢻', '⣹', '⣼'];
export const BOOT_ID = 'boot';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type SentState = 'edit' | 'sending' | 'ack' | 'done';

/** gutter cell: empty → a space (pre-wrap keeps the uniform column grid) */
function cell(ch: string, cls: string): string {
  return '<span class="cell ' + cls + '">' + (ch === '' ? ' ' : esc(ch)) + '</span>';
}

/** one content char → a fixed-width cell (the pixel face's advances are NOT
 * uniformly equal, so each glyph is drawn in its own 8px cell — the terminal
 * grid, not the face's natural spacing) */
function charCell(ch: string, extra: string): string {
  return '<span class="c' + (extra ? ' ' + extra : '') + '">' + (ch === ' ' ? '' : esc(ch)) + '</span>';
}

export class Assembler {
  // (id) → (n) → raw tape c — the per-id frame buffer keyed by n
  private tape = new Map<string, Map<number, string>>();
  private blocks: Block[] = [];
  private byId = new Map<string, Block>();

  attachSession = '';
  attachTag = '';
  ready = false;

  // the user's row, painted locally from its own keystrokes (CANON §5)
  draft = '';
  sentText = '';
  sentState: SentState = 'edit';

  apply(f: WireFrame): void {
    switch (f.t) {
      case 'sseinit':
        this.attachSession = f.session ?? '';
        this.attachTag = f.tag ?? 'terminal';
        break;
      case 'ready':
        if ((f as { ok?: boolean }).ok !== false) this.ready = true;
        break;
      case 'open': {
        const id = f.id ?? BOOT_ID;
        if (!this.byId.has(id)) {
          const b: Block = { id, rows: [], closed: false };
          this.byId.set(id, b);
          this.blocks.push(b);
        }
        if (id.startsWith('turn-') && this.sentState === 'ack') this.turnOpened();
        break;
      }
      case 're': {
        const id = f.id ?? BOOT_ID;
        let b = this.byId.get(id);
        if (!b) {
          // an re without its open: the contract is in the frame, not the
          // transport — (id, n) is self-describing, open is implied
          b = { id, rows: [], closed: false };
          this.byId.set(id, b);
          this.blocks.push(b);
        }
        const n = f.n ?? 0;
        let m = this.tape.get(id);
        if (!m) {
          m = new Map();
          this.tape.set(id, m);
        }
        const fresh = !m.has(n); // (id,n) dedup: a byte-identical replay is a no-op
        const prev = m.get(n);
        m.set(n, f.c ?? '');
        while (b.rows.length <= n) b.rows.push(null);
        if (fresh || prev !== (f.c ?? '')) {
          // paint n, and ensure slots below n are filled (known → paint,
          // else a visible gap); everything above n stays exactly as painted
          this.paintRow(b, n);
          for (let i = n + 1; i < b.rows.length; i++) {
            if (!b.rows[i] && m.has(i)) this.paintRow(b, i);
          }
        }
        break;
      }
      case 'close': {
        const b = this.byId.get(f.id ?? '');
        if (b) {
          b.closed = true;
          if (b.id.startsWith('turn-')) {
            this.sentState = 'edit'; // the line frees; caret returns to lead
            this.sentText = '';
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private paintRow(b: Block, n: number): void {
    const c = this.tape.get(b.id)?.get(n) ?? '';
    b.rows[n] = {
      state: c.length >= 1 ? c[0] : '',
      deco: c.length >= 2 ? c.slice(1, 2) : '',
      // tape = [state][deco][text] — the 2-char content margin is in the tape
      text: c.length > 2 ? c.slice(2) : '',
    };
  }

  // --- the user row (local paint from its own keystrokes)

  setDraft(t: string): void {
    this.draft = t;
  }

  /** Enter: the row freezes — no more edits on that line */
  commit(): boolean {
    if (this.sentState !== 'edit' || this.draft === '') return false;
    this.sentText = this.draft;
    this.draft = '';
    this.sentState = 'sending'; // spinner in col 0 (send in flight)
    return true;
  }

  /** POST /sse returned the 202 ack — the possibility is visible */
  ack(): void {
    if (this.sentState === 'sending') this.sentState = 'ack';
  }

  /** the reply block opened — the reply's gutter owns the state from here */
  turnOpened(): void {
    if (this.sentState === 'ack') this.sentState = 'done';
  }

  userRowHtml(spinGlyph: string): string {
    if (this.sentState === 'edit' && this.draft === '') return '';
    let stateCell = '«';
    let text = this.sentText;
    if (this.sentState === 'edit') {
      text = this.draft;
    } else if (this.sentState === 'sending') {
      stateCell = spinGlyph;
    }
    const cells = text.split('').map((ch) => charCell(ch)).join('');
    return (
      '<div class="row user-row">' +
      cell(stateCell, 'state') +
      cell(' ', 'deco') +
      '<span class="content">' + cells + '</span></div>'
    );
  }

  /** one wire row → HTML; isLead marks the boot block's caret row */
  private rowHtml(r: Row, isLead: boolean): string {
    const cells = r.text.split('').map((ch) => charCell(ch)).join('');
    return (
      '<div class="row' + (isLead ? ' caret-row' : '') + '">' +
      cell(r.state, 'state') +
      cell(r.deco, 'deco') +
      '<span class="content">' +
      (cells || '&nbsp;') +
      (isLead ? '<span class="block-caret"></span>' : '') +
      '</span></div>'
    );
  }

  blockHtml(b: Block, caretOnLead: boolean): string {
    let h = '<div class="block" data-block="' + esc(b.id) + '">';
    for (let i = 0; i < b.rows.length; i++) {
      if (b.rows[i] === null) {
        h +=
          '<div class="row gap">' +
          cell(' ', 'state') +
          cell(' ', 'deco') +
          '<span class="content">' +
          charCell('◌', 'gapmark') +
          '</span></div>';
        continue;
      }
      const r = b.rows[i];
      const isLead =
        caretOnLead && i === b.rows.length - 1 && r.state === '' && r.deco === '' && r.text === '';
      h += this.rowHtml(r, isLead);
    }
    h += '</div>';
    return h;
  }

  render(spinGlyph: string): string {
    let h = '';
    for (const b of this.blocks) {
      h += this.blockHtml(b, b.id === BOOT_ID && b.closed && this.sentState === 'edit');
    }
    h += this.userRowHtml(spinGlyph);
    return h;
  }

  bootDone(): boolean {
    return this.byId.get(BOOT_ID)?.closed === true;
  }
}
