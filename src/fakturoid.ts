import { fetchJson } from "./utils.ts";

type AuthResponse = {
  access_token: string;
};

type UserResponse = {
  accounts: { slug: string }[];
};

type InvoiceResponse = {
  id: string;
};

export type TimeEntry = {
  name: string;
  durationInHours: number;
  countryCode: string;
};

type SubjectItem = {
  id: number;
  name: string;
  country: string;
  email: string;
};

export type InvoiceLine = {
  name: string;
  quantity: string;
  unit_name: string;
  unit_price: string;
  vat_rate?: string;
};

export type InvoicePayload = {
  subject_id: string;
  lines: InvoiceLine[];
  due: number;
  issued_on: string;
  taxable_fulfillment_due?: string;
};

const API_BASE = "https://app.fakturoid.cz/api/v3";
const USER_AGENT = "clockify-to-fakturoid";

export function toLines(rows: TimeEntry[], rate: number): InvoiceLine[] {
  return rows.map((r) => ({
    name: r.name,
    quantity: r.durationInHours.toFixed(2),
    unit_name: "h",
    unit_price: rate.toFixed(2),
  }));
}

export class FakturoidClient {
  private token: string | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    if (!clientId || !clientSecret)
      throw new Error("FAKTUROID_CLIENT_ID / FAKTUROID_CLIENT_SECRET is not set");
  }

  private async request<T>(url: string | URL, init?: RequestInit): Promise<T> {
    return await fetchJson<T>(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Authorization: `Bearer ${await this.getAccessToken()}`,
      },
    });
  }

  private async getAccessToken(): Promise<String> {
    if (this.token) return this.token;

    const authResponse = await fetchJson<AuthResponse>(`${API_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
      },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });

    this.token = authResponse.access_token;
    return this.token;
  }

  async getUserSlug(): Promise<UserResponse> {
    const userResponse = await this.request<UserResponse>(`${API_BASE}/user.json`);

    // parse
    const slugs = userResponse.accounts.map((a) => a.slug);
    console.log({
      slugs,
      slug: slugs[0],
    });
    return slugs[0];
  }

  async searchSubjects(slug: string, query: string): Promise<SubjectsItem[]> {
    // user search endpoint to pre-filter
    const searchResult = await this.request<SubjectItem[]>(
      `${API_BASE}/accounts/${slug}/subjects.json?query=${encodeURIComponent(query)}`,
    );

    // parse - filter strictly only names containing cod
    const codSubjects = searchResult
      .filter((s) => s.name.includes(query))
      .map(({ id, name, country, email }) => ({ id, name, country, email }));

    console.table(codSubjects);
    return codSubjects;
  }

  async createInvoice(slug: string, payload: InvoicePayload): Promise<InvoiceResponse> {
    const invoiceResponse = await this.request<InvoiceResponse>(
      `${API_BASE}/accounts/${slug}/invoices.json`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    // parse
    const invoiceId = invoiceResponse.id;
    const htmlUrl = invoiceResponse.html_url;
    const publicHtmlUrl = invoiceResponse.public_html_url;
    const pdfUrl = invoiceResponse.pdf_url;
    const num = invoiceResponse.number;
    console.log({ invoiceId, htmlUrl, publicHtmlUrl, pdfUrl, number: num });
    return { invoiceId, pdfUrl, num };
  }

  async downloadInvoicePdf(
    pdfUrl: string,
    { attempts = 10, delayMs = 1500 } = {},
  ): Promise<Uint8Array> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const res = await fetch(pdfUrl, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
          "User-Agent": USER_AGENT,
          Authorization: `Bearer ${await this.getAccessToken()}`,
        },
      });

      if (res.status === 200) return new Uint8Array(await res.arrayBuffer());

      await Bun.sleep(delayMs);
    }

    throw new Error(
      `Fakturoid PDF for invoice ${invoiceId} was still generating after ${attempts} tries`,
    );
  }
}
