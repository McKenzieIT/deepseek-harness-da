/** Card-view helpers shared across tool-call card packages.
 *
 *  Lifted here (the runtime, which owns {@link ToolCallBlock} and
 *  {@link ConversationSnapshot}) so the present-table, present-decomposition,
 *  and suggest-followups cards do not each carry byte-identical copies that
 *  drift (ui-present-misc-2 isLatestTurn, ui-present-misc-10 blockText). */
import type { ToolCallBlock, ConversationSnapshot } from './sessions/conversation.ts'

/** Whether the block belongs to the turn the conversation is still on.
 *
 *  A running block (no `kind`) is treated as latest (its turn has not ended).
 *  When the snapshot's latest turn has no recorded start time the block is
 *  also treated as latest (defensive: the timing map may lag the timeline).
 *  Otherwise the block is latest when it settled at or after the latest
 *  turn's start. */
export function isLatestTurn(block: ToolCallBlock, snapshot: ConversationSnapshot): boolean {
  if (!('kind' in block)) return true
  const turnOrder = snapshot.chat.timeline.turnOrder
  if (turnOrder.length === 0) return true
  const latestTurn = turnOrder[turnOrder.length - 1] as number
  const timing = snapshot.turnTimings.get(latestTurn)
  if (!timing) return true
  return block.time >= timing.startTime
}

/** The concatenated render text of a settled tool block (trimmed). Empty for
 *  running blocks that have not yet settled (no `kind`).
 *
 *  Trim policy is trim (standardized across all card call sites): a settled
 *  block's content blocks are joined on '\n' and the result trimmed, so a
 *  trailing newline from the render pipeline does not surface as a blank
 *  fallback line. */
export function blockText(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  return (block.content as readonly { text?: string }[]).map(c => c.text ?? '').join('\n').trim()
}
