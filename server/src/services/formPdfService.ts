import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { ITransferPaperwork, IParty } from '../models/TransferPaperwork';

/**
 * Preparation worksheets for the RTO and the insurer. They are NOT the official forms: they gather the
 * details the two people entered so those details can be copied onto the official form and signed there.
 * Every page says so. Their layout is our own and has NOT been checked against the official Form 29 and
 * Form 30 (the official files could not be read when this was written), so nothing here claims to mirror them.
 */

export const WORKSHEET_DISCLAIMER =
  'This is NOT the official form. DriveDock prepared it from details entered by the buyer and the seller, ' +
  'so you can copy them onto the official form and sign that. Your RTO may require the official form, ' +
  'and details here may be incomplete or wrong until both of you have checked them.';

// ── Content model (pure: this is what gets tested) ────────────────────────────

export interface Row {
  label: string;
  value?: string | null;
}
export type Block =
  | { type: 'fields'; heading: string; rows: Row[] }
  | { type: 'paragraphs'; heading?: string; paras: string[] }
  | { type: 'list'; heading: string; items: string[] }
  | { type: 'signatures'; labels: string[] };

export interface Worksheet {
  title: string;
  disclaimer: string;
  officialFormsUrl: string;
  filename: string;
  blocks: Block[];
}

export interface WorksheetContext {
  transferId: string;
  generatedAt: Date;
  officialFormsUrl: string;
  vehicle: { regNumber: string; make: string; model: string; year: number; fuelType: string; registrationState: string | null };
  /** The stored paperwork with personal fields already decrypted. */
  data: Partial<ITransferPaperwork>;
}

const ID_LABELS: Record<string, string> = { aadhaar: 'Aadhaar', pan: 'PAN', voter: 'Voter ID', passport: 'Passport', dl: 'Driving licence' };

const dmy = (iso?: string): string | null => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

const joinParts = (...parts: Array<string | undefined | null>): string | null => {
  const text = parts.filter((p) => p && String(p).trim()).join(', ');
  return text || null;
};

const addressOf = (p?: IParty): string | null =>
  joinParts(p?.address?.line1, p?.address?.line2, p?.address?.city, p?.address?.state, p?.address?.pincode);

const relationOf = (p?: IParty): string | null => (p?.guardianName ? joinParts(p.relation ? `${p.relation} ${p.guardianName}` : p.guardianName) : null);

/** Only the last four characters are ever stored, and that is all a worksheet shows. */
const maskedId = (p?: IParty): string | null =>
  p?.idLast4 ? `${ID_LABELS[p.idType ?? ''] ?? 'ID'}: XXXX-${p.idLast4}` : null;

const saleDateText = (d: Partial<ITransferPaperwork>): string | null => {
  const date = dmy(d.sale?.date);
  if (!date) return null;
  return d.sale?.dateConfirmedAt ? date : `${date} (not yet confirmed by both parties)`;
};

const loanText = (d: Partial<ITransferPaperwork>): string | null => {
  if (d.loan?.hypothecated === true) return d.loan.bankName ? `Yes, with ${d.loan.bankName}` : 'Yes';
  if (d.loan?.hypothecated === false) return 'No';
  return null;
};

const vehicleRows = (ctx: WorksheetContext): Row[] => [
  { label: 'Registration number', value: ctx.vehicle.regNumber },
  { label: 'Make and model', value: `${ctx.vehicle.make} ${ctx.vehicle.model}` },
  { label: 'Year of manufacture', value: String(ctx.vehicle.year) },
  { label: 'Fuel', value: ctx.vehicle.fuelType },
  { label: 'Chassis number', value: ctx.data.vehicle?.chassisNo },
  { label: 'Engine number', value: ctx.data.vehicle?.engineNo },
  { label: 'Colour', value: ctx.data.vehicle?.colour },
  { label: 'Date of registration', value: dmy(ctx.data.vehicle?.registrationDate) },
  { label: 'Registered in (from the registration number)', value: ctx.vehicle.registrationState }
];

const nameAndAddress = (p?: IParty): Row[] => [
  { label: 'Full name', value: p?.fullName },
  { label: "Son / daughter / wife / care of", value: relationOf(p) },
  { label: 'Address', value: addressOf(p) }
];

const stamp = (ctx: WorksheetContext, base: string) => `${base}-${ctx.vehicle.regNumber.replace(/[^A-Za-z0-9]/g, '')}.pdf`;

export const buildForm29Model = (ctx: WorksheetContext): Worksheet => ({
  title: 'Form 29 preparation worksheet',
  disclaimer: WORKSHEET_DISCLAIMER,
  officialFormsUrl: ctx.officialFormsUrl,
  filename: stamp(ctx, 'Form29-worksheet'),
  blocks: [
    { type: 'paragraphs', paras: ['Notice of transfer of ownership of a motor vehicle. Filled in by the seller (transferor) and reported to the registering authority.'] },
    { type: 'fields', heading: 'Vehicle', rows: vehicleRows(ctx) },
    {
      type: 'fields',
      heading: 'Transferor (seller)',
      rows: [...nameAndAddress(ctx.data.seller), { label: 'Mobile number', value: ctx.data.seller?.mobile }, { label: 'ID (last 4 only)', value: maskedId(ctx.data.seller) }]
    },
    { type: 'fields', heading: 'Transferee (buyer)', rows: nameAndAddress(ctx.data.buyer) },
    {
      type: 'fields',
      heading: 'Transfer',
      rows: [
        { label: 'Date of sale / handover', value: saleDateText(ctx.data) },
        { label: 'Odometer reading (km)', value: ctx.data.sale?.odometerKm?.toLocaleString('en-IN') },
        { label: 'Vehicle under loan / hypothecation', value: loanText(ctx.data) }
      ]
    },
    {
      type: 'fields',
      heading: 'Additional details (not part of the official form)',
      rows: [{ label: 'Sale price (Rs.)', value: ctx.data.sale?.price != null ? ctx.data.sale.price.toLocaleString('en-IN') : null }]
    },
    {
      type: 'paragraphs',
      heading: 'Declaration',
      paras: ['I declare that I have sold the vehicle described above to the transferee (buyer) named above, and I have handed over the vehicle and its documents.']
    },
    { type: 'signatures', labels: ['Signature of transferor (seller)', 'Signature of transferee (buyer)'] }
  ]
});

export const buildForm30Model = (ctx: WorksheetContext): Worksheet => ({
  title: 'Form 30 preparation worksheet',
  disclaimer: WORKSHEET_DISCLAIMER,
  officialFormsUrl: ctx.officialFormsUrl,
  filename: stamp(ctx, 'Form30-worksheet'),
  blocks: [
    { type: 'paragraphs', paras: ['Application for registering the transfer of ownership of a motor vehicle. Filled in by the buyer (transferee) and made to the RTO where they live.'] },
    { type: 'fields', heading: 'Vehicle', rows: vehicleRows(ctx) },
    {
      type: 'fields',
      heading: 'Transferee (buyer, the applicant)',
      rows: [
        ...nameAndAddress(ctx.data.buyer),
        { label: 'Mobile number', value: ctx.data.buyer?.mobile },
        { label: 'Email', value: ctx.data.buyer?.email },
        { label: 'ID (last 4 only)', value: maskedId(ctx.data.buyer) }
      ]
    },
    { type: 'fields', heading: 'Transferor (seller)', rows: nameAndAddress(ctx.data.seller) },
    {
      type: 'fields',
      heading: 'Transfer',
      rows: [
        { label: 'Date of transfer', value: saleDateText(ctx.data) },
        { label: 'Vehicle under loan / hypothecation', value: loanText(ctx.data) },
        { label: 'Form 28 NOC number and date, if applicable', value: null }
      ]
    },
    {
      type: 'list',
      heading: 'Documents usually attached (check with your RTO)',
      items: [
        "Copy of Form 29 as given by the seller",
        'Original registration certificate (RC)',
        'Valid insurance certificate and pollution (PUC) certificate',
        'ID and address proof of the buyer (originals and copies)',
        'Form 28 NOC, if your RTO asks for one',
        "Lender's NOC or Form 35, if the vehicle was under a loan",
        'Fee payment receipt'
      ]
    },
    {
      type: 'paragraphs',
      heading: 'Declaration',
      paras: ['I apply to have the transfer of the vehicle described above recorded in my name. The details given are true to the best of my knowledge.']
    },
    { type: 'signatures', labels: ['Signature of transferee (buyer)', 'Consent of transferor (seller)'] }
  ]
});

export const buildInsurerLetterModel = (ctx: WorksheetContext): Worksheet => {
  const ins = ctx.data.insurance;
  const reg = ctx.vehicle.regNumber;
  return {
    title: 'Insurer transfer request (draft letter)',
    disclaimer: WORKSHEET_DISCLAIMER,
    officialFormsUrl: ctx.officialFormsUrl,
    filename: stamp(ctx, 'Insurer-letter'),
    blocks: [
      {
        type: 'fields',
        heading: 'To',
        rows: [
          { label: 'The Manager, insurer', value: ins?.insurerName },
          { label: 'Date of this letter', value: null }
        ]
      },
      {
        type: 'paragraphs',
        heading: `Subject: request to transfer motor insurance policy no. ${ins?.policyNumber || '__________'} for vehicle ${reg}`,
        paras: [
          `I bought the vehicle ${reg} (${ctx.vehicle.make} ${ctx.vehicle.model}, ${ctx.vehicle.year}) from ${ctx.data.seller?.fullName || '__________'} on ${saleDateText(ctx.data) || '__________'}.`,
          'Please record me as the owner and make the necessary changes to the certificate of insurance and the policy in my name. I enclose the documents listed below.',
          'Please also confirm the amount, if any, payable for the change.'
        ]
      },
      {
        type: 'fields',
        heading: 'Buyer (policyholder to be)',
        rows: [
          { label: 'Full name', value: ctx.data.buyer?.fullName },
          { label: 'Address', value: addressOf(ctx.data.buyer) },
          { label: 'Mobile number', value: ctx.data.buyer?.mobile },
          { label: 'Email', value: ctx.data.buyer?.email }
        ]
      },
      {
        type: 'list',
        heading: 'Enclosures (check with your insurer)',
        items: [
          'Copy of the existing policy / certificate of insurance',
          'Updated RC in the buyer\'s name, or copies of Forms 29 and 30 if the RC has not been issued yet',
          "Buyer's ID and address proof",
          "Seller's signed consent below, if the insurer asks for it"
        ]
      },
      {
        type: 'paragraphs',
        heading: 'Seller\'s consent',
        paras: [`I, ${ctx.data.seller?.fullName || '__________'}, agree to the policy above being transferred to the buyer named in this letter.`]
      },
      { type: 'signatures', labels: ['Signature of buyer', 'Signature of seller'] }
    ]
  };
};

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * pdf-lib's built-in fonts can only draw WinAnsi characters and throw on anything else (the rupee
 * sign, Devanagari, ...). Input is already limited to English letters, so this is the safety net:
 * map what has an ASCII equivalent and show '?' for the rest rather than fail.
 */
export const pdfSafe = (input: unknown): string => {
  const text = input == null ? '' : String(input);
  return text
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
};

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const FOOTER_RESERVE = 70;
const LABEL_W = 190;
const GREY = rgb(0.4, 0.4, 0.45);
const INK = rgb(0.08, 0.1, 0.14);
const RED = rgb(0.6, 0.12, 0.12);

const istStamp = (d: Date): string => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' IST';

class Sheet {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;

  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.addPage();
  }

  private addPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < FOOTER_RESERVE) this.addPage();
  }

  gap(n: number) {
    this.y -= n;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const words = pdfSafe(text).split(' ').filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  text(text: string, o: { size?: number; bold?: boolean; x?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    const x = o.x ?? MARGIN;
    for (const line of this.wrap(text, font, size, A4.w - MARGIN - x)) {
      this.ensure(size * 1.5);
      this.y -= size * 1.35;
      this.page.drawText(line, { x, y: this.y, size, font, color: o.color ?? INK });
    }
  }

  heading(text: string) {
    this.ensure(40);
    this.gap(10);
    this.text(text, { size: 11, bold: true });
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 3 }, end: { x: A4.w - MARGIN, y: this.y - 3 }, thickness: 0.6, color: GREY });
    this.gap(5);
  }

  field(label: string, value?: string | null) {
    const valueX = MARGIN + LABEL_W;
    const labelLines = this.wrap(label, this.font, 8.5, LABEL_W - 8);
    const hasValue = value != null && String(value).trim() !== '';
    const valueLines = hasValue ? this.wrap(String(value), this.font, 10, A4.w - MARGIN - valueX) : [''];
    const rows = Math.max(labelLines.length, valueLines.length);
    this.ensure(rows * 14 + 6);
    const top = this.y;
    labelLines.forEach((l, i) => this.page.drawText(l, { x: MARGIN, y: top - 12 - i * 12, size: 8.5, font: this.font, color: GREY }));
    if (hasValue) {
      valueLines.forEach((l, i) => this.page.drawText(l, { x: valueX, y: top - 12 - i * 13, size: 10, font: this.font, color: INK }));
    } else {
      // A blank to fill in by hand
      this.page.drawLine({ start: { x: valueX, y: top - 12 }, end: { x: A4.w - MARGIN, y: top - 12 }, thickness: 0.5, color: GREY });
    }
    this.y = top - rows * 13 - 6;
  }

  bullet(text: string) {
    this.text(`- ${text}`, { x: MARGIN + 10 });
  }

  signatures(labels: string[]) {
    this.ensure(90);
    this.gap(34);
    const width = (A4.w - 2 * MARGIN - 30) / labels.length;
    labels.forEach((label, i) => {
      const x = MARGIN + i * (width + 30);
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + width, y: this.y }, thickness: 0.6, color: INK });
      this.page.drawText(pdfSafe(label), { x, y: this.y - 12, size: 8.5, font: this.font, color: GREY });
      this.page.drawText('Date: ____ / ____ / ________', { x, y: this.y - 26, size: 8.5, font: this.font, color: GREY });
    });
    this.gap(40);
  }

  disclaimerBox(text: string, url: string) {
    const lines = [...this.wrap(text, this.bold, 9, A4.w - 2 * MARGIN - 20), ...this.wrap(`Official forms: ${url}`, this.font, 8.5, A4.w - 2 * MARGIN - 20)];
    const height = lines.length * 12 + 14;
    this.ensure(height + 10);
    const top = this.y - 4;
    this.page.drawRectangle({ x: MARGIN, y: top - height, width: A4.w - 2 * MARGIN, height, borderColor: RED, borderWidth: 1.2, color: rgb(1, 0.96, 0.95) });
    lines.forEach((l, i) => {
      const isUrl = i >= lines.length - this.wrap(`Official forms: ${url}`, this.font, 8.5, A4.w - 2 * MARGIN - 20).length;
      this.page.drawText(l, { x: MARGIN + 10, y: top - 14 - i * 12, size: isUrl ? 8.5 : 9, font: isUrl ? this.font : this.bold, color: RED });
    });
    this.y = top - height - 8;
  }
}

export const renderWorksheet = async (ws: Worksheet, ctx: Pick<WorksheetContext, 'transferId' | 'generatedAt'>): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(ws.title));
  doc.setCreator('DriveDock');
  doc.setProducer('DriveDock');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(doc, font, bold);

  sheet.text(ws.title, { size: 17, bold: true });
  sheet.gap(6);
  sheet.disclaimerBox(ws.disclaimer, ws.officialFormsUrl);

  for (const block of ws.blocks) {
    if (block.type === 'fields') {
      sheet.heading(block.heading);
      block.rows.forEach((r) => sheet.field(r.label, r.value));
    } else if (block.type === 'paragraphs') {
      if (block.heading) sheet.heading(block.heading);
      block.paras.forEach((p) => {
        sheet.text(p);
        sheet.gap(4);
      });
    } else if (block.type === 'list') {
      sheet.heading(block.heading);
      block.items.forEach((i) => sheet.bullet(i));
    } else {
      sheet.signatures(block.labels);
    }
  }

  // Footer on every page: the same warning, the transfer reference, when it was made, and the page count
  const total = sheet.pages.length;
  sheet.pages.forEach((page, i) => {
    const note = pdfSafe('Preparation worksheet, not the official form. Check details with both parties before copying them onto the official form.');
    page.drawText(note, { x: MARGIN, y: 40, size: 7.5, font, color: GREY });
    page.drawText(pdfSafe(`Transfer ref ${ctx.transferId}  |  Prepared ${istStamp(ctx.generatedAt)}  |  Page ${i + 1} of ${total}`), {
      x: MARGIN,
      y: 29,
      size: 7.5,
      font,
      color: GREY
    });
  });

  return Buffer.from(await doc.save());
};

export type WorksheetKind = 'form29' | 'form30' | 'insurer-letter';
export const WORKSHEET_KINDS: readonly WorksheetKind[] = ['form29', 'form30', 'insurer-letter'];

export const buildModel = (kind: WorksheetKind, ctx: WorksheetContext): Worksheet =>
  kind === 'form29' ? buildForm29Model(ctx) : kind === 'form30' ? buildForm30Model(ctx) : buildInsurerLetterModel(ctx);

export const buildWorksheetPdf = async (kind: WorksheetKind, ctx: WorksheetContext): Promise<{ pdf: Buffer; filename: string }> => {
  const model = buildModel(kind, ctx);
  return { pdf: await renderWorksheet(model, ctx), filename: model.filename };
};
