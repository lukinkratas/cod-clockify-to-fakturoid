import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { writeFile } from "node:fs/promises";

import { fetchJson, monthRange } from "./src/utils.ts";
import { ClockifyClient } from "./src/clockify.ts";
import { FakturoidClient, toLines } from "./src/fakturoid.ts";

// zapisovani raty do .env filu if missing
// clockify.request() like fakturoid request

const INVOICE_DIR = "invoices";

async function getParams() {
  const rl = readline.createInterface({ input, output });

  try {
    const now = new Date();
    const prevMonthStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

    console.log('Reporting year month in "YYYY-MM?" format:');
    const dateInput = await rl.question(`Or confirm default "${prevMonthStr}" by ENTER.\n`);
    const dateStr = dateInput ? dateInput : currentMonthStr;

    // parse
    const [rawYear, rawMonth] = dateStr.split("-");
    const year = Number(rawYear);
    const month = Number(rawMonth);

    const rateInput = process.env.RATE?.trim() ?? (await rl.question("Rate: "));
    const rate = Number(rateInput);

    console.log({ year, month, rate });
    return { year, month, rate };
  } finally {
    rl.close();
  }
}

const clockifyApiKey = process.env.CLOCKIFY_API_KEY;
const fakturoidClientId = process.env.FAKTUROID_CLIENT_ID;
const fakturoidClientSecret = process.env.FAKTUROID_CLIENT_SECRET;

if (!clockifyApiKey || !fakturoidClientId || !fakturoidClientSecret) {
  console.error(
    "Missing config - copy .env.example to .env and fill in CLOCKIFY_API_KEY, FAKTUROID_CLIENT_ID, FAKTUROID_CLIENT_SECRET.",
  );
}

const { year, month, rate } = await getParams();

const clockify = new ClockifyClient(process.env.CLOCKIFY_API_KEY);
const { userId, workspaceId } = await clockify.getCurrentUser();

const { startDay, endDay } = monthRange(year, month);
const clockifySummaryRows = await clockify.generateTimeEntrySummaryReport(
  workspaceId,
  userId,
  startDay,
  endDay,
  groups: ["PROJECT"],
);

const fakturoid = new FakturoidClient(fakturoidClientId, fakturoidClientSecret);

const fakturoidSlug = await fakturoid.getCurrentUserSlug();

// subjects/kontakty name have to contain "Colours of Data" and have country set to CZ or GB
const codSubjects = await fakturoid.searchSubjects(fakturoidSlug, "Colours of Data");

const ALIASES = { GB: "UK" };
const target = (country) => ALIASES[country] ?? country; // parens-free, safe here

for (const [idx, subject] of codSubjects.entries()) {
  const rowsPerCountry = clockifySummaryRows.filter(
    (row) => row.countryCode === target(subject.country),
  );

  if (rowsPerCountry.length !== 0) {
    console.table(rowsPerCountry);

    const payload = {
      subject_id: subject.id,
      due: 14,
      issued_on: endDay,
      lines: toLines(rowsPerCountry, rate),
      // custom_id: customId,
      // taxable_fulfillment_due: "2026-08-31",
      // document_type: "invoice",
      // payment_method: "bank",
      // note: "Konzultacni sluzby:",
      // footer_note: "Your legal entity footer.",
      // bank_account: "111111111111111",
      // iban_visibility: "automatically",
      // language: "cz",
    };

    const { invoiceId, pdfUrl, num } = await fakturoid.createInvoice(fakturoidSlug, payload);

    const pdf = await fakturoid.downloadInvoicePdf(pdfUrl);
    const path = `${INVOICE_DIR}/${num}_${invoiceId}.pdf`;
    await Bun.write(path, pdf);
    console.log(`  saved ${path} (${pdf.byteLength} bytes)`);
  }
}
