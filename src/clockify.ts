import { fetchJson } from "./utils.ts";
import { type invoiceLine } from "./fakturoid.ts";

type Membership = {
  targetId: string;
  membershipType: string;
};

type UserResponse = {
  id: string;
  defaultWorkspace: string;
  activeWorkspace: string;
  memberships: Membership[];
};

type SummaryRow = {
  name: string;
  duration: number;
};

type SummaryResponse = {
  groupOne: SummaryRow[];
};

type SummaryRowEnriched = {
  name: string;
  durationInHours: number;
  countryCode: string;
};

function workspaceIds(user: UserResponse): string[] {
  return (user.memberships ?? [])
    .filter((membership) => membership.membershipType === "WORKSPACE")
    .map((membership) => membership.targetId);
}

function toRows(summary: SummaryResponse): SummaryRowEnriched[] {
  return summary.groupOne
    .map(({ name, duration }) => ({
      name,
      durationInHours: duration / 3600,
      countryCode: name.split("-").pop()?.trim().slice(0, 2) ?? "UNKNOWN",
    }))
    .sort((a, b) => b.durationInHours - a.durationInHours); // longest first
}

export class ClockifyClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("CLOCKIFY_API_KEY is not set");
  }

  async getCurrentUser(): Promise<UserResponse> {
    const userResponse = await fetchJson<ClockifyUserResponse>(
      "https://api.clockify.me/api/v1/user?include-memberships=true",
      {
        headers: { "X-Api-Key": this.apiKey },
      },
    );

    // parse
    const userId = userResponse.id;
    const workspaceId = userResponse.activeWorkspace;
    console.log({
      userId,
      workspaceId,
      workspaces: workspaceIds(userResponse),
    });
    return { userId, workspaceId };
  }

  async generateTimeEntrySummaryReport(
    workspaceId: string,
    userId: string,
    startDay: string,
    endDay: string,
    groups: string[],
  ): Promise<SummaryResponse> {
    const summaryResponse = await fetchJson<SummaryResponse>(
      `https://reports.api.clockify.me/v1/workspaces/${workspaceId}/reports/summary`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": this.apiKey },
        body: JSON.stringify({
          dateRangeStart: `${startDay}T00:00:00.000Z`,
          dateRangeEnd: `${endDay}T23:59:59.999Z`,
          summaryFilter: groups,
          users: { ids: [userId], contains: "CONTAINS", status: "ALL" },
          amountShown: "HIDE_AMOUNT", // 403: You don't have a permission for that action
        }),
      },
    );

    // parse
    const summaryRows = toRows(summaryResponse);
    console.table(summaryRows);
    return summaryRows;
  }
}
