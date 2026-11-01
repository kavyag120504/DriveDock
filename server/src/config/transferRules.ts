/**
 * Time limits for the paperwork that follows a vehicle sale.
 *
 * RULE: a number goes in here only when the sources agree and say so. Where they conflict, or the
 * official text could not be read, `days` is null and the app shows "as soon as possible" with no
 * date. Every number needs `source` and `verifiedOn` (a unit test enforces it).
 *
 * Reconciliation done on 2026-10-28. Sources that could NOT be read on that date, so nothing below
 * rests on them: the India Code text of the Motor Vehicles Act "as on 21 May 2025" (HTTP 403), the
 * Parivahan pages parivahan.gov.in/en/content/ownership-transfer and /en/forms-all (connection
 * reset), the text of Central Motor Vehicles Rules 1989 rule 55 itself (only judgments quoting
 * rules 55(1)-(3) were read; none states a number of days), and any amendment notification
 * (a 2020 draft amending rules 55 and 56 was mentioned, with no sign it was finalised).
 * To change a cell: read the official text, then update `days`, `source`, `verifiedOn` and `resolution`.
 */

export type Scenario = 'sameState' | 'otherState' | 'unknown';
export type Duty = 'sellerForm29' | 'buyerForm30' | 'buyerInsurance';

export interface DeadlineRule {
  /** Whole days counted from the confirmed sale date, or null when no deadline can be stated. */
  days: number | null;
  source: string;
  verifiedOn: string;
  resolution: string;
}

const VERIFIED_ON = '2026-10-28';

const sellerForm29Unresolved: DeadlineRule = {
  days: null,
  source:
    'Motor Vehicles Act 1988 s.50(1)(a), unofficial text on indiankanoon.org/doc/613433: transferor reports within 14 days (same State) or 45 days (vehicle registered outside the State). ' +
    'The Parivahan page mparivahan.parivahan.gov.in/mstatic/english/rc-info-ownership.html states no seller time limit. CMVR rule 55(1), as quoted in judgments, states none.',
  verifiedOn: VERIFIED_ON,
  resolution:
    'Only an unofficial reproduction of the Act gives a number, and the official 2025 text and rule 55 could not be read. Not shipped. Re-check against India Code or the Gazette before setting 14 / 45.'
};

const buyerForm30Conflict: DeadlineRule = {
  days: null,
  source:
    'Parivahan (mparivahan.parivahan.gov.in/mstatic/english/rc-info-ownership.html): Form 30 within 14 days (same State) or 45 days (vehicle registered outside the State). ' +
    'MV Act s.50(1)(b), unofficial text on indiankanoon.org/doc/613433: transferee reports within 30 days.',
  verifiedOn: VERIFIED_ON,
  resolution:
    'The sources conflict (14/45 vs 30) and no official text, rule 55 or notification could be read to show which applies, or whether an amendment changed it. Not shipped.'
};

const buyerInsurance: DeadlineRule = {
  days: 14,
  source:
    'Motor Vehicles Act 1988 s.157(2), unofficial text on indiankanoon.org/doc/161412796: the transferee applies to the insurer within fourteen days from the date of transfer. ' +
    'Applied in NCDRC, Future Generali v. Sombir, 16 Aug 2016 (indiankanoon.org/doc/48131134), which counts from the date of actual transfer. Insurer guidance gives the same period.',
  verifiedOn: VERIFIED_ON,
  resolution:
    'No conflicting source found. The official India Code text could not be read (HTTP 403), so re-check it. Counted from the sale date both parties confirmed.'
};

export const TRANSFER_DEADLINE_RULES: Record<Duty, { sameState: DeadlineRule; otherState: DeadlineRule }> = {
  sellerForm29: { sameState: sellerForm29Unresolved, otherState: sellerForm29Unresolved },
  buyerForm30: { sameState: buyerForm30Conflict, otherState: buyerForm30Conflict },
  buyerInsurance: { sameState: buyerInsurance, otherState: buyerInsurance }
};

/**
 * The rule that applies to a duty in a scenario, or null when none can be stated.
 * The insurance duty does not depend on the states involved, so it applies in every scenario.
 */
export const ruleFor = (duty: Duty, scenario: Scenario): DeadlineRule | null => {
  if (duty === 'buyerInsurance') return TRANSFER_DEADLINE_RULES.buyerInsurance.sameState;
  if (scenario === 'unknown') return null;
  return TRANSFER_DEADLINE_RULES[duty][scenario];
};

export const DEADLINE_FOOTNOTE = 'Central rules shown; your state may differ. Confirm with your RTO.';
