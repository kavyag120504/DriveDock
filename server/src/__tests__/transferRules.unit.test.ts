import { TRANSFER_DEADLINE_RULES, ruleFor, Duty } from '../config/transferRules';
import { normalizeState, registrationStateOf } from '../services/indianStates';

describe('transfer deadline rules', () => {
  const allRules = (Object.keys(TRANSFER_DEADLINE_RULES) as Duty[]).flatMap((duty) => [
    { duty, scenario: 'sameState', rule: TRANSFER_DEADLINE_RULES[duty].sameState },
    { duty, scenario: 'otherState', rule: TRANSFER_DEADLINE_RULES[duty].otherState }
  ]);

  it.each(allRules.map((r) => [`${r.duty}/${r.scenario}`, r.rule] as const))(
    '%s only has a number when it names its source and date',
    (_name, rule) => {
      if (rule.days !== null) {
        expect(Number.isInteger(rule.days) && rule.days > 0).toBe(true);
        expect(rule.source.length).toBeGreaterThan(20);
        expect(rule.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(rule.resolution.length).toBeGreaterThan(20);
    }
  );

  it('states no RTO deadline when the scenario is unknown', () => {
    expect(ruleFor('sellerForm29', 'unknown')).toBeNull();
    expect(ruleFor('buyerForm30', 'unknown')).toBeNull();
  });

  it('applies the insurance period whatever the states are', () => {
    for (const scenario of ['sameState', 'otherState', 'unknown'] as const) {
      expect(ruleFor('buyerInsurance', scenario)?.days).toBe(14);
    }
  });
});

describe('normalizeState', () => {
  it.each([
    ['MH', 'Maharashtra'],
    ['maharashtra', 'Maharashtra'],
    ['  Delhi ', 'Delhi'],
    ['NCT of Delhi', 'Delhi'],
    ['Orissa', 'Odisha'],
    ['OR', 'Odisha'],
    ['TG', 'Telangana'],
    ['Jammu & Kashmir', 'Jammu and Kashmir'],
    ['uttaranchal', 'Uttarakhand'],
    ['Pondicherry', 'Puducherry']
  ])('%s -> %s', (input, name) => {
    expect(normalizeState(input)?.name).toBe(name);
  });

  it.each([['Narnia'], ['XX'], [''], ['   '], [123], [null], [undefined]])('cannot resolve %p', (input) => {
    expect(normalizeState(input)).toBeNull();
  });
});

describe('registrationStateOf', () => {
  it.each([
    ['DL3CAB1234', 'DL'],
    ['mh01ab1234', 'MH'],
    ['OR02AB1234', 'OD'],
    ['HR26DK9012', 'HR']
  ])('%s -> %s', (reg, code) => {
    expect(registrationStateOf(reg)?.code).toBe(code);
  });

  it.each([['22BH1234AA'], ['ZZ01AB1234'], [''], [undefined], [42]])('gives no state for %p', (reg) => {
    expect(registrationStateOf(reg)).toBeNull();
  });
});
