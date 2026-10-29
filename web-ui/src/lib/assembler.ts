// CARL-01 — the wire (CANON §4). One connection. Attach framing, then blocks:
//   {t:'sseinit', session, tag} → {t:'ready', ok:true}
//   {t:'open', id} / {t:'re', id, F, n, tr, c} / {t:'close', id}
// Row tape: [state cell][decoration cell][2 padding][text]; \n and \b in-band.
// PASS-FIRST: the server's pace is the actual pace — this client is the
// assembler: per-id frame buffer keyed by n, ripple-insert at n (a late
// frame lands on its own n, bumps nothing ahead), re-paint from the drip
// point downward only — upstream rows are never touched. Gaps are marked
// visibly (◌), never hidden.

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

  phase: 'idle' | 'waiting' | 'working' | 'waiting2' = 'idle'; // emits on change

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
        const fresh = !m.has(n); // (id,n) dedup: replays are no-ops
        m.set(n, f.c ?? '');
        while (b!.rows.length <= n) b!.rows.push(null);
        if (fresh) {
          this.paintRow(b!, n);
          // ripple: fill the slots below n (known → paint, else a visible
          // gap); everything above n stays exactly as painted
          for (let i = n + 1; i < b!.rows.length; i++) {
            if (!b!.rows[i] && m.has(i)) this.paintRow(b!, i);
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
    if (this.sentState === 'sending') this.sentState = 'ack'; // @ '202 ack'
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
      stateCell = '«';
    } else if (this.sentState === 'sending') {
      stateCell = spinGlyph;
      text = this.sentText;
    }
    const cells =
      text
        .split('')
        .map((ch) => '<span class="c">' + (ch === ' ' ? '' : esc(ch)) + '</span>')
        .join('') ||
      '&nbsp;';
    return (
      '<div class="row user-row">' +
      '<span class="cell state">' + (stateCell === '' ? '&nbsp;' : esc(stateCell)) + '</span>' +
      '<span class="cell deco">&nbsp;</span>' +
      '<span class="content">' + cells + '</span>' +
      '</div>'
    );
  }

  /** full screen HTML; the boot block's terminal blank row is the caret row */
  private rowHtml(r: Row, isLead: boolean): string {
    const cells = r.text.split('').map((ch) => {
      const s = ch === ' ' ? '&nbsp;' : esc(ch);
      return '<span class="c">' + (ch === ' ' ? '' : s) + '</span>';
    }).join('');
    return (
      '<div class="row' + (isLead ? ' caret-row' : '') + '">' +
      '<span class="cell state">' + (r.state === '' ? '&nbsp;' : esc(r.state)) + '</span>' +
      '<span class="cell deco">' + (r.deco === '' ? '&nbsp;' : esc(r.deco)) + '</span>' +
      '<span class="content">' + (cells === '' ? (isLead ? '' : '&nbsp;') : cells) + '</span>' +
      '</div>'
    );
  }

  blockHtml(b: Block, caretOnLead: boolean): string {
    let h = '<div class="block" data-block="' + esc(b.id) + '">';
    for (let i = 0; i < b.rows.length; i++) {
      if (b.rows[i] === null) {
        h +=
          '<div class="row gap"><span class="cell state">&nbsp;</span><span class="cell deco">&nbsp;</span><span class="content"><span class="c gapmark">◌</span></span></div>';
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
      const caretOn = b.id === BOOT_ID && b.closed && this.sentState === 'edit';
      h += this.blockHtml(b, caretOn);
    }
    // the user's row (local paint from its own keystrokes)
    h += this.userRowHtml(spinGlyph);
    if (this.sentState === 'edit' && this.draft === '') {
      // the idle caret: a block at the content-column lead, fast fade in/out
      // — a client presentation element, NEVER a wire byte, NEVER a gutter byte
      h +=
        '<div class="row caret-row"><span class="cell state">&nbsp;</span>' +
        '<span class="cell deco">&nbsp;</span>' +
        '<span class="content"><span class="c"><span class="block-caret"></span></span></span></div>';
    }
    return h;
  }

  bootDone(): boolean {
    return this.byId.get(BOOT_ID)?.closed === true;
  }
}
