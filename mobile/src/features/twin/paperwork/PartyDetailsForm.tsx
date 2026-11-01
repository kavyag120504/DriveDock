import React from 'react';
import { View } from 'react-native';
import { Chips, Field, SectionTitle, StateField } from './fields';
import { ID_TYPES, RELATIONS } from './constants';
import { PartyForm, Errors } from './validators';

interface Props {
  value: PartyForm;
  onChange: (next: PartyForm) => void;
  errors: Errors;
  /** key prefix used for errors, e.g. "party." inside the seller form */
  errorPrefix?: string;
  title: string;
}

/** Name, address, mobile and ID fields shared by the buyer's and the seller's forms. */
export const PartyDetailsForm: React.FC<Props> = ({ value, onChange, errors, errorPrefix = '', title }) => {
  const set = <K extends keyof PartyForm>(key: K) => (v: PartyForm[K]) => onChange({ ...value, [key]: v });
  const err = (k: string) => errors[`${errorPrefix}${k}`];

  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      <Field label="Full name" value={value.fullName} onChangeText={set('fullName')} placeholder="As on your RC or ID" error={err('fullName')} autoCapitalize="words" />
      <Chips label="Relation" options={RELATIONS} value={value.relation} onChange={set('relation')} error={err('relation')} />
      <Field label="Father's / husband's / guardian's name" value={value.guardianName} onChangeText={set('guardianName')} error={err('guardianName')} autoCapitalize="words" />

      <Field label="Address line 1" value={value.line1} onChangeText={set('line1')} placeholder="House no., street" error={err('line1')} />
      <Field label="Address line 2 (optional)" value={value.line2} onChangeText={set('line2')} placeholder="Area, landmark" error={err('line2')} />
      <Field label="City" value={value.city} onChangeText={set('city')} error={err('city')} autoCapitalize="words" />
      <StateField value={value.state} onChange={set('state')} error={err('state')} />
      <Field label="Pincode" value={value.pincode} onChangeText={(t) => set('pincode')(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} error={err('pincode')} />

      <Field label="Mobile number" prefix="+91" value={value.mobile} onChangeText={(t) => set('mobile')(t.replace(/[^\d\s-]/g, '').slice(0, 14))} keyboardType="phone-pad" error={err('mobile')} />
      <Field label="Email (optional)" value={value.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={err('email')} />

      <Chips label="ID proof" options={ID_TYPES} value={value.idType} onChange={set('idType')} error={err('idType')} />
      <Field
        label="Last 4 characters of the ID"
        value={value.idLast4}
        onChangeText={(t) => set('idLast4')(t.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())}
        maxLength={4}
        autoCapitalize="characters"
        error={err('idLast4')}
        hint="Only the last 4. We never store the full number."
      />
    </View>
  );
};
