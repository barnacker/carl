import type { Synapse } from './synapse/index.js'
import type { CortexRequestEvent, LlmTokenEvent, LlmDoneEvent, LlmErrorEvent, PromptMessage } from './nervous-system.js'

/**
 * Cortex — Stage 0.5 deliberate forwarder stub (Spec §3, §4).
 *
 * Pure forwarder: the Cortex holds no state, no timer, no Arc system.
 * It re-publishes each incoming event on the matching channel with the
 * same payload (same request_id) so that, per Spec §5 §6 Caveat, the
 * correlation between Chat Faculty and LLM Faculty events is preserved.
 *
 *   cortex.request → llm.request   (same { type:'prompt', id, messages, ... })
 *   llm.token      → chat.response (same { type:'token',   id, lane, text })
 *   llm.done       → chat.response (same { type:'done',    id })
 *   llm.error      → chat.response (same { type:'error',   id, message })
 *
 * The field `type` in each event object carries the event subtype
 * (token / done / error / prompt); the channel name is determined by
 * the bus routing. The Sink's single-argument signature hands the
 * payload through unchanged.
 */
export class recreateCortex {
  private readonly synapse: Synapse

  constructor(synapse: Synapse) {
    this.synapse = synapse
    synapse.subscribe('cortex.request', async (event: unknown) => {
      const req = event as CortexRequestEvent
      await synapse.publish(
        {
          type: 'prompt',
          id: req.id,
          messages: (req.messages as readonly PromptMessage[]).map((m) => ({ role: m.role, content: m.content })),
          ...(req.model !== undefined ? { model: req.model } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
          ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
        },
        'llm.request',
      )
    })
    synapse.subscribe('llm.token', async (event: unknown) => {
      await this.forward('chat.response', event as LlmTokenEvent)
    })
    synapse.subscribe('llm.done', async (event: unknown) => {
      await this.forward('chat.response', event as LlmDoneEvent)
    })
    synapse.subscribe('llm.error', async (event: unknown) => {
      await this.forward('chat.response', event as LlmErrorEvent)
    })
  }

  private async forward(channel: 'chat.response', event: LlmTokenEvent | LlmDoneEvent | LlmErrorEvent): Promise<void> {
    await this.synapse.publish(event, channel)
  }
}
