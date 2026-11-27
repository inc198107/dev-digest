/**
 * Fixture PR #483 of the seeded repo (acme/payments-api) for the Skills Lab control
 * experiment: a refund calculator with several branches and boundaries, shipped with tests that
 * all walk the same happy path (partial refunds). The suite looks thorough at a glance; only a
 * systematic branch/boundary pass finds that no test reaches the two throws, the full-refund
 * branch, or the fee remainder lost to rounding on the final partial refund. The demo repo has no clone, so a review reads the diff from these
 * `pr_files` patches (diff-loader falls back to them).
 *
 * Expected: the Test Quality Reviewer without skills judges the tests sound; with
 * `untested-branches` and `boundary-cases` it flags the untested branches and the rounding
 * boundary of the pro-rata fee.
 */

export const REFUND_PR_NUMBER = 483;

export const REFUND_PR = {
  number: REFUND_PR_NUMBER,
  title: 'Add partial refunds with fee proration',
  author: 'dev.lee',
  branch: 'feat/partial-refunds',
  base: 'main',
  headSha: 'b7c8d9e0f1a2',
  body:
    'Adds `calculateRefund` so support can refund part of a captured payment. The processing ' +
    'fee is returned pro rata on partial refunds and in full on a full refund. Covered by unit tests.',
  commitMessage: 'Add calculateRefund with pro-rata fee return',
} as const;

const CALCULATE_REFUND_TS = `/** Input of a refund, all amounts in minor units (cents). */
export interface RefundInput {
  /** Amount captured on the original charge. */
  capturedAmount: number;
  /** Amount refunded by earlier partial refunds. */
  alreadyRefunded: number;
  /** Amount to refund now. */
  requestedAmount: number;
  /** Processing fee charged on the capture. */
  processingFee: number;
}

export interface RefundResult {
  refundAmount: number;
  feeReturned: number;
  isFullRefund: boolean;
}

/**
 * Work out a refund and the share of the processing fee that goes back to the customer.
 * A full refund returns the whole fee; a partial refund returns it pro rata.
 */
export function calculateRefund(input: RefundInput): RefundResult {
  const { capturedAmount, alreadyRefunded, requestedAmount, processingFee } = input;
  if (requestedAmount <= 0) {
    throw new RangeError('Refund amount must be positive');
  }

  const refundable = capturedAmount - alreadyRefunded;
  if (requestedAmount > refundable) {
    throw new RangeError(\`Refund exceeds the refundable balance of \${refundable}\`);
  }

  const isFullRefund = alreadyRefunded === 0 && requestedAmount === capturedAmount;
  if (isFullRefund) {
    return { refundAmount: requestedAmount, feeReturned: processingFee, isFullRefund };
  }

  /** Pro-rata share of the fee, rounded down to a whole cent. */
  const feeReturned = Math.floor((processingFee * requestedAmount) / capturedAmount);
  return { refundAmount: requestedAmount, feeReturned, isFullRefund };
}
`;

const CALCULATE_REFUND_TEST_TS = `import { describe, expect, it } from 'vitest';
import { calculateRefund } from '../../src/refunds/calculate-refund';

describe('calculateRefund', () => {
  it('refunds a quarter of the payment with a quarter of the fee', () => {
    expect(
      calculateRefund({ capturedAmount: 10_000, alreadyRefunded: 0, requestedAmount: 2_500, processingFee: 320 }),
    ).toEqual({ refundAmount: 2_500, feeReturned: 80, isFullRefund: false });
  });

  it('refunds half of the payment with half of the fee', () => {
    expect(
      calculateRefund({ capturedAmount: 10_000, alreadyRefunded: 0, requestedAmount: 5_000, processingFee: 320 }),
    ).toEqual({ refundAmount: 5_000, feeReturned: 160, isFullRefund: false });
  });

  it('refunds a second part after an earlier partial refund', () => {
    expect(
      calculateRefund({ capturedAmount: 10_000, alreadyRefunded: 2_500, requestedAmount: 2_500, processingFee: 320 }),
    ).toEqual({ refundAmount: 2_500, feeReturned: 80, isFullRefund: false });
  });

  it('handles a small payment', () => {
    expect(
      calculateRefund({ capturedAmount: 1_000, alreadyRefunded: 0, requestedAmount: 400, processingFee: 59 }),
    ).toEqual({ refundAmount: 400, feeReturned: 23, isFullRefund: false });
  });
});
`;

/**
 * GitHub-style patch of a newly added file.
 * @param content The file content.
 * @returns One hunk that adds every line.
 */
function addedFilePatch(content: string): string {
  const lines = content.replace(/\n$/, '').split('\n');
  return [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n');
}

/**
 * @param content The file content.
 * @returns How many lines the file adds.
 */
function lineCount(content: string): number {
  return content.replace(/\n$/, '').split('\n').length;
}

/** The PR's files with their patches. */
export const REFUND_PR_FILES = [
  {
    path: 'src/refunds/calculate-refund.ts',
    additions: lineCount(CALCULATE_REFUND_TS),
    deletions: 0,
    patch: addedFilePatch(CALCULATE_REFUND_TS),
  },
  {
    path: 'test/refunds/calculate-refund.test.ts',
    additions: lineCount(CALCULATE_REFUND_TEST_TS),
    deletions: 0,
    patch: addedFilePatch(CALCULATE_REFUND_TEST_TS),
  },
] as const;
