import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  count?: number | null;
  data?: unknown;
  error?: { code?: string | null; message: string } | null;
};

const mocks = vi.hoisted(() => {
  const state = {
    authBypass: false,
    cookieRoleOverride: null as string | null,
    authUser: null as
      | {
          email?: string | null;
          id: string;
          user_metadata?: Record<string, unknown>;
        }
      | null,
    membershipResult: { data: [], error: null } as QueryResult,
    profileResult: { data: null, error: null } as QueryResult,
    tableCalls: [] as string[],
    teacherResult: { data: null, error: null } as QueryResult,
  };

  const buildQuery = (result: QueryResult) => {
    const builder = {
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
      select: vi.fn(() => builder),
      then: (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const createClient = () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: state.authUser,
        },
      })),
    },
    from: vi.fn((table: string) => {
      state.tableCalls.push(table);
      switch (table) {
        case "teachers":
          return buildQuery(state.teacherResult);
        case "user_profiles":
          return buildQuery(state.profileResult);
        case "user_role_memberships":
          return buildQuery(state.membershipResult);
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
  });

  return {
    cookies: vi.fn(async () => ({
      get: vi.fn((name: string) =>
        name === "deskmate-active-role" && state.cookieRoleOverride
          ? { name, value: state.cookieRoleOverride }
          : undefined,
      ),
    })),
    createAdminSupabaseClient: vi.fn(() => createClient()),
    createServerSupabaseClient: vi.fn(async () => createClient()),
    isAuthBypassEnabled: vi.fn(() => state.authBypass),
    state,
  };
});

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: mocks.createAdminSupabaseClient,
}));

vi.mock("@/lib/auth/bypass", () => ({
  isAuthBypassEnabled: mocks.isAuthBypassEnabled,
}));

function resetMockState() {
  mocks.state.authBypass = false;
  mocks.state.cookieRoleOverride = null;
  mocks.state.authUser = null;
  mocks.state.membershipResult = { data: [], error: null };
  mocks.state.profileResult = { data: null, error: null };
  mocks.state.tableCalls = [];
  mocks.state.teacherResult = { data: null, error: null };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  resetMockState();
  delete process.env.AUTH_BYPASS_USER_ID;
  delete process.env.AUTH_BYPASS_ROLE;
});

describe("getActorContext", () => {
  it("preserves only teacher and admin memberships in auth bypass mode", async () => {
    mocks.state.authBypass = true;
    mocks.state.profileResult = {
      data: {
        default_role: "subject_teacher",
        display_name: "Bypass User",
        email: "bypass@example.com",
        user_id: "user-1",
      },
      error: null,
    };
    mocks.state.membershipResult = {
      data: [
        { role: "admin", status: "active" },
        { role: "subject_teacher", status: "active" },
        { role: "legacy_role", status: "active" },
      ],
      error: null,
    };
    process.env.AUTH_BYPASS_USER_ID = "user-1";
    process.env.AUTH_BYPASS_ROLE = "legacy_role";

    const { getActorContext } = await import("@/lib/auth/actor-context");
    const actor = await getActorContext();

    expect(actor.authBypass).toBe(true);
    expect(actor.roles).toEqual(["admin", "subject_teacher"]);
    expect(actor.defaultRole).toBe("subject_teacher");
    expect(actor.activeRole).toBe("subject_teacher");
    expect(actor.displayName).toBe("Bypass User");
    expect(actor.email).toBe("bypass@example.com");
  });

  it("ignores bypass cookie overrides for removed roles", async () => {
    mocks.state.authBypass = true;
    mocks.state.cookieRoleOverride = "legacy_role";
    mocks.state.profileResult = {
      data: {
        default_role: "subject_teacher",
        display_name: "Bypass User",
        email: "bypass@example.com",
        user_id: "user-1",
      },
      error: null,
    };
    mocks.state.membershipResult = {
      data: [
        { role: "subject_teacher", status: "active" },
        { role: "legacy_role", status: "active" },
      ],
      error: null,
    };
    process.env.AUTH_BYPASS_USER_ID = "user-1";
    process.env.AUTH_BYPASS_ROLE = "subject_teacher";

    const { getActorContext } = await import("@/lib/auth/actor-context");
    const actor = await getActorContext();

    expect(actor.roles).toEqual(["subject_teacher"]);
    expect(actor.defaultRole).toBe("subject_teacher");
    expect(actor.activeRole).toBe("subject_teacher");
  });

  it("does not infer extra roles without a teacher membership source", async () => {
    mocks.state.authUser = {
      email: "teacher@example.com",
      id: "user-1",
    };

    const { getActorContext } = await import("@/lib/auth/actor-context");
    const actor = await getActorContext();

    expect(actor.roles).toEqual([]);
    expect(actor.defaultRole).toBe(null);
    expect(actor.activeRole).toBe(null);
  });
});
