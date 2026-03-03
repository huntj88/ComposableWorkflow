/**
 * Queue state inspector for `app-builder.spec-doc.v1` integration tests.
 *
 * Provides deterministic queue snapshotting, ordering verification, insertion
 * tracking, and immutability assertions for the question queue managed by
 * `NumberedOptionsHumanRequest`.
 *
 * Requirement: SD-HAR-003-QueueInspectorDeterminism
 *
 * @module test/integration/harness/spec-doc/queue-inspector
 */

import type {
  NumberedQuestionOption,
  QuestionQueueItem,
} from '../../../../src/workflows/spec-doc/contracts.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A snapshot of a single queue item at a point in time. */
export interface QueueItemSnapshot {
  /** The unique question identifier. */
  questionId: string;
  /** The question prompt text. */
  prompt: string;
  /** The available answer options. */
  options: NumberedQuestionOption[];
  /** ISO-8601 timestamp when this snapshot was taken. */
  issuedAt: string;
  /** 0-based position in the queue at snapshot time. */
  index: number;
  /** Whether this item was answered at snapshot time. */
  answered: boolean;
  /** The kind of question. */
  kind: string;
}

/** A timestamped snapshot of the full queue. */
export interface QueueSnapshot {
  /** ISO-8601 timestamp when the snapshot was taken. */
  takenAt: string;
  /** Ordered item snapshots. */
  items: QueueItemSnapshot[];
  /** Number of items in the queue. */
  size: number;
  /** Label identifying the snapshot context (e.g. "after-insertion", "after-answer"). */
  label: string;
}

/** The queue inspector instance. */
export interface QueueInspector {
  /** Take a named snapshot of the current queue state. */
  snapshot(queue: readonly QuestionQueueItem[], label: string): QueueSnapshot;

  /** All snapshots taken in order. */
  readonly snapshots: readonly QueueSnapshot[];

  /** Get snapshot by label. Returns undefined if not found. */
  snapshotByLabel(label: string): QueueSnapshot | undefined;

  // ---- Assertion helpers ----

  /**
   * Assert that the queue is ordered deterministically by questionId
   * using locale-independent string comparison.
   */
  assertDeterministicOrder(queue: readonly QuestionQueueItem[]): void;

  /**
   * Assert that a new item was inserted at a specific index compared to a
   * prior snapshot.
   */
  assertInsertedAt(
    before: QueueSnapshot,
    after: QueueSnapshot,
    expectedItem: { questionId: string },
    expectedIndex: number,
  ): void;

  /**
   * Assert that no items in the "before" snapshot were mutated in the
   * "after" snapshot (prompt, options, and questionId unchanged).
   */
  assertImmutability(before: QueueSnapshot, after: QueueSnapshot): void;

  /**
   * Assert that a specific item exists at the expected index and matches expected fields.
   */
  assertItemAt(
    queue: readonly QuestionQueueItem[],
    index: number,
    expected: { questionId: string; kind?: string; answered?: boolean },
  ): void;

  /**
   * Assert option IDs for a queue item are unique contiguous integers starting at 1.
   */
  assertContiguousOptionIds(item: QuestionQueueItem): void;

  /** Reset all snapshots. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a queue state inspector. */
export function createQueueInspector(): QueueInspector {
  const snapshots: QueueSnapshot[] = [];

  function takeItemSnapshot(
    item: QuestionQueueItem,
    index: number,
    issuedAt: string,
  ): QueueItemSnapshot {
    return {
      questionId: item.questionId,
      prompt: item.prompt,
      options: item.options.map((o) => ({ ...o })),
      issuedAt,
      index,
      answered: item.answered,
      kind: item.kind,
    };
  }

  const inspector: QueueInspector = {
    snapshot(queue, label) {
      const takenAt = new Date().toISOString();
      const items = queue.map((item, idx) => takeItemSnapshot(item, idx, takenAt));
      const snap: QueueSnapshot = {
        takenAt,
        items,
        size: queue.length,
        label,
      };
      snapshots.push(snap);
      return snap;
    },

    get snapshots() {
      return snapshots;
    },

    snapshotByLabel(label) {
      return snapshots.find((s) => s.label === label);
    },

    assertDeterministicOrder(queue) {
      for (let i = 1; i < queue.length; i++) {
        const prev = queue[i - 1].questionId;
        const curr = queue[i].questionId;
        if (prev > curr) {
          throw new Error(
            `Queue is not deterministically ordered: "${prev}" at index ${i - 1} > "${curr}" at index ${i}`,
          );
        }
      }
    },

    assertInsertedAt(before, after, expectedItem, expectedIndex) {
      // After should have exactly one more item
      if (after.size !== before.size + 1) {
        throw new Error(
          `Expected queue size to increase by 1: was ${before.size}, now ${after.size}`,
        );
      }

      // The item at expectedIndex should match
      const insertedItem = after.items[expectedIndex];
      if (!insertedItem) {
        throw new Error(
          `No item found at expected insertion index ${expectedIndex} (queue size: ${after.size})`,
        );
      }
      if (insertedItem.questionId !== expectedItem.questionId) {
        throw new Error(
          `Expected item "${expectedItem.questionId}" at index ${expectedIndex}, ` +
            `found "${insertedItem.questionId}"`,
        );
      }

      // Items before the insertion point should be unchanged
      for (let i = 0; i < expectedIndex; i++) {
        if (before.items[i].questionId !== after.items[i].questionId) {
          throw new Error(
            `Item at index ${i} changed after insertion: ` +
              `was "${before.items[i].questionId}", now "${after.items[i].questionId}"`,
          );
        }
      }

      // Items after the insertion point should be shifted by +1
      for (let i = expectedIndex; i < before.size; i++) {
        if (before.items[i].questionId !== after.items[i + 1].questionId) {
          throw new Error(
            `Item at original index ${i} not correctly shifted: ` +
              `was "${before.items[i].questionId}", now "${after.items[i + 1]?.questionId}"`,
          );
        }
      }
    },

    assertImmutability(before, after) {
      for (const beforeItem of before.items) {
        const afterItem = after.items.find((a) => a.questionId === beforeItem.questionId);
        if (!afterItem) {
          // Item was removed — not an immutability violation but could be
          // flagged. For now just skip missing items.
          continue;
        }
        if (afterItem.prompt !== beforeItem.prompt) {
          throw new Error(
            `Prompt mutated for "${beforeItem.questionId}": ` +
              `was "${beforeItem.prompt}", now "${afterItem.prompt}"`,
          );
        }
        if (JSON.stringify(afterItem.options) !== JSON.stringify(beforeItem.options)) {
          throw new Error(
            `Options mutated for "${beforeItem.questionId}": ` +
              `was ${JSON.stringify(beforeItem.options)}, ` +
              `now ${JSON.stringify(afterItem.options)}`,
          );
        }
      }
    },

    assertItemAt(queue, index, expected) {
      if (index < 0 || index >= queue.length) {
        throw new Error(`Index ${index} out of bounds (queue size: ${queue.length})`);
      }
      const item = queue[index];
      if (item.questionId !== expected.questionId) {
        throw new Error(
          `Expected questionId "${expected.questionId}" at index ${index}, ` +
            `found "${item.questionId}"`,
        );
      }
      if (expected.kind !== undefined && item.kind !== expected.kind) {
        throw new Error(
          `Expected kind "${expected.kind}" for "${item.questionId}", found "${item.kind}"`,
        );
      }
      if (expected.answered !== undefined && item.answered !== expected.answered) {
        throw new Error(
          `Expected answered=${expected.answered} for "${item.questionId}", ` +
            `found answered=${item.answered}`,
        );
      }
    },

    assertContiguousOptionIds(item) {
      const ids = item.options.map((o) => o.id).sort((a, b) => a - b);
      // Check uniqueness first
      const unique = new Set(ids);
      if (unique.size !== ids.length) {
        throw new Error(
          `Option IDs for "${item.questionId}" contain duplicates: [${ids.join(', ')}]`,
        );
      }
      for (let i = 0; i < ids.length; i++) {
        if (ids[i] !== i + 1) {
          throw new Error(
            `Option IDs for "${item.questionId}" are not contiguous starting at 1: ` +
              `[${ids.join(', ')}]`,
          );
        }
      }
    },

    reset() {
      snapshots.length = 0;
    },
  };

  return inspector;
}
