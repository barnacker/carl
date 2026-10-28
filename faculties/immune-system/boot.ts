// IMMU — immune-system boot sequencer (spec v5 FINAL).
//
// The SOLE owner of self-test probe timing. DASH registers its probe
// closures here at init (`immu.registerLeg(module, probeFn)`); IMMU
// sequences the legs in FIXED order (DASH → TELE → NERV → CRTX → LLM1),
// enforces each leg's budget timer, owns the hidden retry, and publishes
// every `immu.selftest` event. The DASH faculty is the SOLE tape
// interpreter (it subscribes here and types the char band); telemetry is a
// telemetry-lane observer. Nobody else times a leg.
//
// Channels (NEW): immu.selftest (bright — DASH + telemetry subscribe),
// boot.commands (bright — main.ts routes the POST /dash handlers).
//
// `n` === `seq`: one monotonic counter, persisted to
// ~/.carl/selftest-state.json (sync write on every increment), seeded on
// process start, NEVER reset to 0 after its first publish. The in-flight
// lock is in-memory — a process death clears it; `n` continues.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join as pathJoin } from 'node:path'
import type { Synapse } from '../../synapse/index.js'

// The five sequenced legs (fixed order) + the module display labels (the
// subject names — DASH types them, IMMU carries them on events).
export const IMMU_LEG_ORDER: readonly string[] = ['DASH', 'TELE', 'NERV', 'CRTX', 'LLM1']
export const DASH_IMMU_DISPLAY = 'IMMU'
const IMMU_LABELS: Record<string, string> = { DASH: 'DASH', TELE: 'TELE', NERV: 'NERV', CRTX: 'CRTX', LLM1: 'LLM1' }

// Per-leg budget timers — the single fault trigger for every leg (IMMU is
// the right-aging clock; no other mechanism times a probe). Decision
// 1-locked: LLM1 = 4s; total = 15s hard cap.
const IMMU_LEG_BUDGET_MS: Record<string, number> = { DASH: 3000, TELE: 3000, NERV: 3000, CRTX: 2000, LLM1: 4000 }
const IMMU_BACKSTOP_MS = 15_000 // the 15s hard cap (SOLE terminal publisher on failure)

// Auth: hard-coded allow-list (operator-locked). `boot.start` /
// `boot.status` both check `dash_id` here; a forgery is refused + logged.
const ALLOWED: readonly string[] = ['dash', 'tele', 'nerv', 'crtx', 'llm1']

export interface ImmuReport {
  report(n: number): void
  done(ms: number): void
  fault(reason: string, detail?: string): void
}
export type ImmuProbeFn = (rep: ImmuReport) => void

type LegState = 'pending' | 'open' | 'settled'
interface ImmuLegSlot {
  module: string
  state: LegState
  verdict: boolean | null
  ms: number | null
  attempt: number
  pct: number
  t0: number | null
  settledN: number | null
  timer: NodeJS.Timeout | null
  budgetTimer: NodeJS.Timeout | null
}
export interface ImmuLegOut {
  module: string
  label: string
  state: LegState
  verdict: 'ok' | 'fault' | null
  ms: number | null
  attempt: number
  pct: number
}
interface ImmuSeq {
  running: boolean
  started_at: number | null
  done: boolean
  complete_payload: { n: number; ok: boolean; ms_total: number; legs: { module: string; label: string; verdict: string; ms: number; attempt: number }[] } | null
}

const STATE_FILE = pathJoin(homedir(), '.carl', 'selftest-state.json')
const PACE_MS = 50 // the dot pacer's cadence (DT-based 0-100 %= leg-budget domain)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function persistN(n: number): void {
  try {
    mkdirSync(pathJoin(homedir(), '.carl'), { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify({ n }) + '\n', 'utf8')
  } catch (e) {
    process.stderr.write(`immu: state persist failed (swallowed): ${(e as Error).message}\n`)
  }
}

function seedN(): number {
  try {
    const raw = readFileSync(STATE_FILE, 'utf8')
    const j = JSON.parse(raw) as { n?: unknown }
    if (typeof j.n === 'number' && Number.isFinite(j.n) && j.n >= 1) return j.n
  } catch {
    /* fresh process: no state file yet → seed 1 (the first publish claims it) */
  }
  return 1
}

export class IMMUSequencer {
  private readonly synapse: Synapse
  // in-flight lock (a GLOBAL singleton — one sequence per process: it is
  // what "two dashboards, one truth" means; the second attach renders the
  // first's band live, it never starts a second sequence).
  private inFlight: boolean = false
  private legs: ImmuLegSlot[] = []
  private seq: ImmuSeq = { running: false, started_at: null, done: false, complete_payload: null }
  // The monotonic counter `n` (=== seq): seeded from the persisted file,
  // NEVER reset to 0 after its first publish. The in-flight lock is
  // in-memory — a process death clears it; `n` continues.
  private n: number
  private legFns = new Map<string, ImmuProbeFn>()
  private backstopTimer: NodeJS.Timeout | null = null
  private already_completed = false
  private startedAt: number | null = null
  private lastSession = ''

  constructor(synapse: Synapse) {
    this.synapse = synapse
    this.n = seedN()
  }

  private log(line: string): void {
    process.stderr.write(`immu: ${line}\n`)
  }

  // ------------------------------------------------------------------
  // Wiring (called by DASH at init — DASH constructs the IMMU).
  // ------------------------------------------------------------------
  wire(): void {
    // boot.commands: the handler resolution channel (main.ts routes the
    // POST /dash branches here — the facet is bright: any faculty may hold
    // a position on it; the dash_id allow-list inside this file is the
    // auth gate). Subscribe + emit + verify + unsub lifecycle is the NERV
    // leg's table-stakes, not this file's.
    this.synapse.subscribe('boot.commands', async (ev: unknown) => {
      void ev
    }, 'immu')
    // The external settle handler (DASH's ping-round lifecycle → CRTX/LLM1
    // settle over the wire — see wireExternal).
    this.wireExternal()
  }

  // ------------------------------------------------------------------
  // In-process API (DASH runs in the same process — direct calls, NOT the
  // bus: the lane never carries module-origin events (spec S1-2)).
  // ------------------------------------------------------------------

  /** Register a leg's probe closure (fixed-order sequence). Probe bodies
   *  live in dash.ts as closures; IMMU invokes them, in its fixed order. */
  registerLeg(module: string, probeFn: ImmuProbeFn): void {
    this.legFns.set(module, probeFn)
  }

  /** Boot.status handler — main.ts POST /dash {boot_status:true,dash_id}.
   *  Pure read: types nothing, never starts, never bumps `n`. */
  bootStatus(dashId: string): { status: 'ok' | 'refused'; snapshot?: ImmuStatusOut; refused?: { reason: string } } {
    if (!ALLOWED.includes(dashId)) {
      const eta_ms = this.seq.running && this.seq.started_at !== null ? Math.max(0, IMMU_BACKSTOP_MS - (Date.now() - this.seq.started_at)) : undefined
      this.log(`boot.refused dash_id=${dashId} reason=auth`)
      this.pub({ type: 'boot.refused', n: this.n, reason: 'auth', source_session: dashId, ...(eta_ms !== undefined ? { eta_ms } : {}) })
      return { status: 'refused', refused: { reason: 'auth' } }
    }
    return { status: 'ok', snapshot: { running: this.seq.running, done: this.seq.done, seq: this.n, legs: this.legsOut(), complete_payload: this.seq.complete_payload } }
  }

  /** Boot.start handler — main.ts POST /dash {boot_start:{session},dash_id}.
   *  Guarded: a forgery is refused + hard-logged; a busy sequence refuses
   *  (+eta); otherwise the sequence starts (auto-trigger on EVERY attach). */
  bootStart(dashId: string, session: string): { status: 'ok' | 'refused'; refused?: { reason: string; eta_ms?: number } } {
    if (!ALLOWED.includes(dashId)) {
      this.log(`boot.refused dash_id=${dashId} reason=auth source_session=${session}`)
      const eta_ms = this.seq.running && this.seq.started_at !== null ? Math.max(0, IMMU_BACKSTOP_MS - (Date.now() - this.seq.started_at)) : undefined
      this.pub({ type: 'boot.refused', n: this.n, reason: 'auth', source_session: session, ...(eta_ms !== undefined ? { eta_ms } : {}) })
      return { status: 'refused', refused: { reason: 'auth' } }
    }
    if (this.inFlight || this.seq.running) {
      this.log(`boot.refused dash_id=${dashId} reason=busy source_session=${session}`)
      const eta_ms = this.seq.running && this.seq.started_at !== null ? Math.max(0, IMMU_BACKSTOP_MS - (Date.now() - this.seq.started_at)) : undefined
      this.pub({ type: 'boot.refused', n: this.n, reason: 'busy', source_session: session, ...(eta_ms !== undefined ? { eta_ms } : {}) })
      const r: { reason: string } & { eta_ms?: number } = { reason: 'busy' }
      if (eta_ms !== undefined) r.eta_ms = eta_ms
      return { status: 'refused', refused: r }
    }
    this.startSequence(session)
    return { status: 'ok' }
  }

  // ------------------------------------------------------------------
  // The sequencer body. Slot mutation is PURE SYNCHRONOUS (no await);
  // `n` advances as the LAST step of each lot; the publish follows the
  // slot write within the same tick. Settle is SOLE authority.
  // ------------------------------------------------------------------

  private startSequence(session: string): void {
    this.legs = IMMU_LEG_ORDER.map((m) => ({ module: m, state: 'pending', verdict: null, ms: null, attempt: 1, pct: 0, t0: null, settledN: null, timer: null, budgetTimer: null }))
    this.seq = { running: true, started_at: Date.now(), done: false, complete_payload: null }
    this.inFlight = true
    this.already_completed = false
    this.startedAt = this.seq.started_at
    this.lastSession = session
    // Arm the 15s backstop — the SOLE terminal publisher on the failure
    // path (a sequence may never hang; complete-once is its gate).
    this.backstopTimer = setTimeout(() => this.backstop(), IMMU_BACKSTOP_MS)
    this.backstopTimer.unref?.()
    void this.advanceLeg(0)
  }

  private async advanceLeg(idx: number): Promise<void> {
    // ONE-STEP guard (the spec's `if(already_completed) return;` — one
    // sync step, re-checked at every hop).
    if (this.already_completed || !this.seq.running) return
    if (idx >= IMMU_LEG_ORDER.length) {
      this.completeSequence(true)
      return
    }
    const module = IMMU_LEG_ORDER[idx] as string
    const slot = this.legs[idx] as ImmuLegSlot
    if (slot.state === 'settled') {
      await this.advanceLeg(idx + 1)
      return
    }
    // 1. sync lot: slot → open (attempt 1), probe armed, n LAST, publish.
    slot.state = 'open'
    slot.attempt = 1
    slot.pct = 0
    slot.t0 = Date.now()
    this.armLegClock(idx, 1)
    const n = this.claimN()
    this.pub({ type: 'selftest.start', n, module, session: this.lastSession, t0: slot.t0, attempt: 1 })
    await this.invokeProbe(module, idx, 1)
    // 2. hidden retry (spec §RETRIES): an attempt-1 fault settles the row
    //    on tape AS FAULT AND re-runs the probe — slot `{state:'open',
    //    attempt:2}` set SYNCHRONOUS with the fault publish, probeFn
    //    re-invoked. Only await the attempt-2 settle for the NEXT leg.
    if (!this.already_completed && !this.seq.running) return // backstop completed
    const after = this.legs[idx] as ImmuLegSlot
    if (after.attempt === 2) {
      await this.waitForSettle(idx)
      if (this.already_completed || !this.seq.running) return
    }
    await this.advanceLeg(idx + 1)
  }

  /** Invoke the leg's probeFn (a synchronous kick — the probe reports
   *  through the in-process API; fns that need to wait park inside and
   *  call rep.done/rep.fault when they are genuinely done). A probe that
   *  throws is a fault (a fresh leg must not get orphaned). */
  private invokeProbe(module: string, idx: number, attempt: number): Promise<void> {
    const fn = this.legFns.get(module)
    if (typeof fn !== 'function') {
      // an unregistered leg: the budget timer is its fault trigger (the
      // spec's 'IMMU budget timer = the fault trigger for every leg').
      this.log(`leg ${module} has no probeFn — the budget timer is its fault trigger`)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const rep: ImmuReport = {
        report: (pct: number) => this.reportProgress(module, pct),
        done: (ms: number) => this.reportDone(module, ms),
        fault: (reason: string, detail?: string) => this.reportFault(module, reason, detail),
      }
      try {
        const r = fn(rep) as unknown
        if (r && typeof (r as Promise<void>).then === 'function') {
          void (r as Promise<void>).catch(() => {
            /* the probe's own rejection is not its settle — the budget timer owns it */
          }).then(() => resolve())
        } else {
          resolve()
        }
      } catch (e) {
        this.reportFault(module, 'probe-throw', (e as Error).message)
        resolve()
      }
    })
  }

  /** Try to settle the leg (attempt 1) and, on a fault, re-arm attempt 2
   *  SYNCHRONOUS with the fault publish (slot mutation: open, attempt:2,
   *  new t0 + clock + n + publish in one tick; then the probeFn re-runs). */
  private settleAttempt(module: string, idx: number, ok: boolean, ms: number, reason: string, detail: string | undefined, isImplicit: boolean): void {
    const slot = this.legs[idx] as ImmuLegSlot
    if (slot.state === 'settled') {
      // a report after settle → the spec's selftest.ignored (telemetry only,
      // no tape — DASH ignores it; the lane never carries a double-settle).
      this.pub({ type: 'selftest.ignored', n: this.n, module, session: this.lastSession, reason: 'leg_settled', original_n: slot.settledN ?? this.n })
      return
    }
    if (slot.state !== 'open') return
    this.clearLegClocks(idx)
    if (ok) {
      slot.state = 'settled'
      slot.verdict = true
      slot.ms = Math.max(0, Math.round(Number.isFinite(ms) ? ms : this.msSince(idx)))
      slot.pct = 100
      const n = this.claimN()
      slot.settledN = n
      this.pub({ type: 'selftest.done', n, module, ok: true, ms: slot.ms, session: this.lastSession, attempt: slot.attempt })
    } else {
      const ms = Math.max(0, Math.round(this.msSince(idx)))
      if (slot.attempt === 1 && !isImplicit) {
        // HIDDEN RETRY: the operator-locked FAULT settles the row on tape
        // (no detail, no retry text on the band — the interpreter paints it
        // from this event), and the slot flips {state:'open',attempt:2}
        // SYNCHRONOUS with the fault publish; the probeFn re-invokes now.
        slot.state = 'open'
        slot.attempt = 2
        slot.pct = 100 // the visible fault row carried 12 dots
        slot.t0 = Date.now()
        this.armLegClock(idx, 2)
        const nFault = this.claimN()
        this.pub({ type: 'selftest.fault', n: nFault, module, ok: false, ms, reason, detail: detail ?? '', session: this.lastSession, attempt: 1 })
        const fn = this.legFns.get(module)
        if (typeof fn === 'function') {
          const rep: ImmuReport = {
            report: (pct: number) => this.reportProgress(module, pct),
            done: (m: number) => { slot.state === 'open' && this.settleAttempt(module, idx, true, m, '', undefined, false) },
            fault: (r2: string, d2?: string) => { slot.state === 'open' && this.settleAttempt(module, idx, false, 0, r2, d2, false) },
          }
          try {
            const r = fn(rep) as unknown
            if (r && typeof (r as Promise<void>).then === 'function') {
              void (r as Promise<void>).catch(() => { /* the budget timer owns a rejected retry */ })
            }
          } catch (e) {
            this.reportFault(module, 'probe-throw', (e as Error).message)
          }
        }
      } else {
        // FINAL settle: attempt 2 (or an implicit/deadline fault) — OK or
        // FAULT both render the row's final state on tape.
        slot.state = 'settled'
        slot.verdict = false
        slot.ms = ms
        const nFault = this.claimN()
        slot.settledN = nFault
        this.pub({ type: 'selftest.fault', n: nFault, module, ok: false, ms, reason, detail: detail ?? '', session: this.lastSession, attempt: slot.attempt })
      }
    }
  }

  private waitForSettle(idx: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const tick = (): void => {
        const slot = this.legs[idx] as ImmuLegSlot
        if (slot.state === 'settled' || this.already_completed || !this.seq.running) { resolve(); return }
        setTimeout(tick, 25)
      }
      tick()
    })
  }

  // ------------------------------------------------------------------
  // External settle (bus path): the DASH faculty's PING-ROUND lifecycle
  // settles the CRTX/LLM1 legs from the round's own frames (llm.done →
  // settleRound; usage done-frame → LLM1 convergence). DASH publishes
  // `dash.ext.done` / `dash.ext.fault` onto immu.selftest (bright — DASH is
  // the publisher of its own probe evidence, the README's pattern); THIS
  // handler routes them to the same in-process settle the probe closures
  // use (settleAttempt — SOLE settle authority, report-after-settle →
  // selftest.ignored). The lane never carries a second module-origin
  // producer: these are the probe closures' own settles, over the wire.
  // ------------------------------------------------------------------
  private wireExternal(): void {
    this.synapse.subscribe('immu.selftest', async (ev: unknown) => {
      const e = ev as Record<string, unknown>
      if (!e || typeof e.type !== 'string') return
      if (e.type === 'dash.ext.done') {
        const module = typeof e.module === 'string' ? e.module : ''
        const ms = typeof e.ms === 'number' && Number.isFinite(e.ms) ? e.ms : 0
        const idx = IMMU_LEG_ORDER.indexOf(module)
        if (idx === -1) return
        const slot = this.legs[idx] as ImmuLegSlot
        if (slot.state === 'settled') {
          this.pub({ type: 'selftest.ignored', n: this.n, module, session: this.lastSession, reason: 'leg_settled', original_n: slot.settledN ?? this.n })
          return
        }
        if (slot.state === 'open') this.settleAttempt(module, idx, true, ms, '', undefined, false)
        return
      }
      if (e.type === 'dash.ext.fault') {
        const module = typeof e.module === 'string' ? e.module : ''
        const reason = typeof e.reason === 'string' ? e.reason : 'external'
        const detail = typeof e.detail === 'string' ? e.detail : ''
        const idx = IMMU_LEG_ORDER.indexOf(module)
        if (idx === -1) return
        const slot = this.legs[idx] as ImmuLegSlot
        if (slot.state === 'settled') {
          this.pub({ type: 'selftest.ignored', n: this.n, module, session: this.lastSession, reason: 'leg_settled', original_n: slot.settledN ?? this.n })
          return
        }
        if (slot.state === 'open') this.settleAttempt(module, idx, false, this.msSince(idx), reason, detail, false)
      }
    }, 'immu-ext')
  }

  /** claim the next monotonic `n` (=== seq): advance LAST in the slot
   *  write, persist SYNC, return the consumed value. Never decreases; never
   *  resets to 0 (seeded, continued across process restarts). */
  private claimN(): number {
    this.n += 1
    persistN(this.n)
    return this.n
  }

  /** The leg's clocks: the PROGRESS pacer (the SOLE dot driver — DT-based
   *  0-100 % against the leg's budget, 50 ms cadence) + the BUDGET TIMER
   *  (the fault trigger — fires only if the probe never settled). */
  private armLegClock(idx: number, attempt: number): void {
    this.clearLegClocks(idx)
    const slot = this.legs[idx] as ImmuLegSlot
    const module = IMMU_LEG_ORDER[idx] as string
    const budget = IMMU_LEG_BUDGET_MS[module] ?? 5000
    const t0 = slot.t0 ?? Date.now()
    const pacer = setInterval(() => {
      const cur = this.legs[idx] as ImmuLegSlot
      if (cur.state !== 'open' || cur.attempt !== attempt) {
        this.clearLegClocks(idx)
        return
      }
      const curT0 = cur.t0 ?? t0
      const pct = Math.min(100, Math.floor(((Date.now() - curT0) / budget) * 100))
      if (pct > cur.pct) {
        cur.pct = pct
        this.pub({ type: 'selftest.progress', n: this.n, module, pct, session: this.lastSession })
      }
    }, PACE_MS)
    pacer.unref?.()
    const budgetTimer = setTimeout(() => {
      // the deadline fault: a probe still open at budget expiry. A report
      // that lands after settle is `ignored` (see reportFault).
      this.clearLegClocks(idx)
      const cur = this.legs[idx] as ImmuLegSlot
      if (cur.state === 'open') {
        cur.state = 'settled'
        cur.verdict = false
        cur.ms = Math.max(0, Math.round(this.msSince(idx)))
        const n = this.claimN()
        cur.settledN = n
        this.log(`${module} deadline — leg budget ${budget}ms (attempt ${cur.attempt})`)
        this.pub({ type: 'selftest.fault', n, module, ok: false, ms: cur.ms, reason: 'deadline', detail: `leg budget ${budget}ms`, session: this.lastSession, attempt: cur.attempt })
      }
    }, budget)
    budgetTimer.unref?.()
    slot.timer = pacer
    slot.budgetTimer = budgetTimer
  }

  private clearLegClocks(idx: number): void {
    const slot = this.legs[idx] as ImmuLegSlot
    if (slot.timer) { clearInterval(slot.timer); slot.timer = null }
    if (slot.budgetTimer) { clearTimeout(slot.budgetTimer); slot.budgetTimer = null }
  }

  private msSince(idx: number): number {
    const slot = this.legs[idx] as ImmuLegSlot
    return slot.t0 === null ? 0 : Date.now() - slot.t0
  }

  // --- the in-process report API (DASH's probe closures call these) ----------

  /** reportProgress — a probe's 0-100 monotonic progress (the SOLE dot
   *  driver). Coerced to the leg-budget domain; a settled leg is a no-op. */
  private reportProgress(module: string, pct: number): void {
    const idx = IMMU_LEG_ORDER.indexOf(module)
    if (idx === -1) return
    const slot = this.legs[idx] as ImmuLegSlot
    if (!slot || slot.state !== 'open') return
    const p = Math.max(0, Math.min(100, Math.floor(Number.isFinite(pct) ? pct : 0)))
    if (p > slot.pct) {
      slot.pct = p
      this.pub({ type: 'selftest.progress', n: this.n, module, pct: p, session: this.lastSession })
    }
  }

  /** reportDone — the probe's OK settle. Sole authority: a report after
   *  settle is `ignored` (telemetry only, no tape). */
  private reportDone(module: string, ms: number): void {
    const idx = IMMU_LEG_ORDER.indexOf(module)
    if (idx === -1) return
    const slot = this.legs[idx] as ImmuLegSlot
    if (!slot) return
    if (slot.state === 'settled') {
      this.pub({ type: 'selftest.ignored', n: this.n, module, session: this.lastSession, reason: 'leg_settled', original_n: slot.settledN ?? this.n })
      return
    }
    if (slot.state !== 'open') return
    this.settleAttempt(module, idx, true, ms, '', undefined, false)
  }

  /** reportFault — the probe's fault (or the budget timer's 'deadline').
   *  IMMU is the SOLE settle authority; a hidden retry may follow on
   *  attempt 1. A report after settle is `ignored`. */
  private reportFault(module: string, reason: string, detail?: string): void {
    const idx = IMMU_LEG_ORDER.indexOf(module)
    if (idx === -1) return
    const slot = this.legs[idx] as ImmuLegSlot
    if (!slot) return
    if (slot.state === 'settled') {
      this.pub({ type: 'selftest.ignored', n: this.n, module, session: this.lastSession, reason: 'leg_settled', original_n: slot.settledN ?? this.n })
      return
    }
    if (slot.state !== 'open') return
    this.settleAttempt(module, idx, false, this.msSince(idx), reason, detail, false)
  }

  // --- completion (EXACTLY ONCE: guard + backstop; no double publish) -------

  private backstop(): void {
    if (this.already_completed) return
    if (!this.seq.running) return
    // Un-judged legs → fault{deadline} (sync), then the terminal complete
    // (ok=false). The backstop is the SOLE terminal publisher on the
    // failure path. (ms optional-default(0): an un-judged leg's ms is its
    // own t0-based elapsed — a deadline is the budget, not a mystery 0.)
    let anyUnsettled = false
    for (let i = 0; i < this.legs.length; i++) {
      const slot = this.legs[i] as ImmuLegSlot
      if (slot.state !== 'settled') {
        anyUnsettled = true
        this.clearLegClocks(i)
        slot.state = 'settled'
        slot.verdict = false
        slot.ms = Math.max(0, Math.round(this.msSince(i)))
        const n = this.claimN()
        slot.settledN = n
        this.log(`backstop: ${slot.module} un-judged → fault{deadline}`)
        this.pub({ type: 'selftest.fault', n, module: slot.module, ok: false, ms: slot.ms, reason: 'deadline', detail: 'backstop 15s', session: this.lastSession, attempt: slot.attempt, backstop: true })
      }
    }
    if (this.seq.running || anyUnsettled) this.completeSequence(false, 'backstop')
  }

  /** COMPLETE-ONCE: the `already_completed` check-and-set is ONE sync step;
   *  the finally-cleared lock lives on the sequence, not the timer. */
  private completeSequence(ok: boolean, reason?: string): void {
    if (this.already_completed) return
    this.already_completed = true
    for (let i = 0; i < this.legs.length; i++) this.clearLegClocks(i)
    if (this.backstopTimer) { clearTimeout(this.backstopTimer); this.backstopTimer = null }
    const legs = this.legs.map((l) => ({ module: l.module, label: IMMU_LABELS[l.module] ?? l.module, verdict: l.verdict === true ? 'OK' : 'FAULT', ms: l.ms ?? 0, attempt: l.attempt }))
    const ms_total = this.startedAt === null ? 0 : Date.now() - this.startedAt
    const n = this.claimN()
    this.seq.complete_payload = { n, ok, ms_total, legs }
    this.seq.done = true
    this.seq.running = false
    this.inFlight = false
    this.pub({ type: 'selftest.complete', n, session: this.lastSession, ok, ms_total, legs, ...(reason !== undefined ? { reason } : {}) })
  }

  private pub(ev: Record<string, unknown>, channel: string = 'immu.selftest'): void {
    // The lane NEVER carries module-origin events: every event here is
    // IMMU-authored and published on the channel (bright lane; DASH +
    // telemetry subscribe via synapse.subscribe — both are allowed there).
    void this.synapse.publish(ev, channel)
  }

  private legsOut(): ImmuLegOut[] {
    if (this.legs.length > 0) {
      return this.legs.map((l) => ({ module: l.module, label: IMMU_LABELS[l.module] ?? l.module, state: l.state, verdict: l.verdict === null ? null : l.verdict ? 'ok' : 'fault', ms: l.ms, attempt: l.attempt, pct: l.pct }))
    }
    return IMMU_LEG_ORDER.map((m) => ({ module: m, label: IMMU_LABELS[m] ?? m, state: 'pending', verdict: null, ms: null, attempt: 1, pct: 0 }))
  }
}

export type ImmuStatusOut = {
  running: boolean
  done: boolean
  seq: number
  legs: ImmuLegOut[]
  complete_payload: ImmuSeq['complete_payload']
}

// (the interpreter's own progress pacing is owned by IMMU's pacer — the
// DASH interpreter is a pure event→byte renderer and needs no sleep here).
