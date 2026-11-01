// Names match the server's canonical state list (server/src/services/indianStates.ts)
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

export const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'voter', label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'dl', label: 'Licence' }
];

export const RELATIONS = [
  { value: 'S/o', label: 'Son of' },
  { value: 'D/o', label: 'Daughter of' },
  { value: 'W/o', label: 'Wife of' },
  { value: 'C/o', label: 'Care of' }
];

export const INSURANCE_PLANS = [
  { value: 'transfer', label: 'Transfer the existing policy' },
  { value: 'new', label: 'Buy a new policy' }
];

export const FORMS: Array<{ key: 'form29' | 'form30' | 'insurer-letter'; title: string; sub: string }> = [
  { key: 'form29', title: 'Form 29 worksheet', sub: "Seller's notice of transfer" },
  { key: 'form30', title: 'Form 30 worksheet', sub: "Buyer's application" },
  { key: 'insurer-letter', title: 'Insurer letter', sub: 'Draft request to move the policy' }
];
