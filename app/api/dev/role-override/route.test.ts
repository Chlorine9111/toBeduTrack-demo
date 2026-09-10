import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const cookieDelete = vi.fn();
const getActorContext = vi.fn();

function createActor(roles = ["subject_teacher", "admin"]) {
  return {
    activeRole: "subject_teacher",
    authBypass: false,
    defaultRole: "subject_teacher",
    displayName: "Dev User",
    email: "dev@example.com",
    isAuthenticated: true,
    roles,
    user: null,
    userId: "dev-user",
  };
}

async function postRole(role: string | null) {
  const { POST } = await import("@/app/api/dev/role-override/route");
  return POST(
    new Request("http://127.0.0.1:3001/api/dev/role-override", {
      method: "POST",
      body: JSON.stringify({ role }),
      headers: {
        "content-type": "application/json",
      },
    }),
  );
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: cookieDelete,
    set: cookieSet,
  })),
}));

vi.mock("@/lib/auth/actor-context", () => ({
  getActorContext,
}));

describe("POST /api/dev/role-override", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.AUTH_BYPASS_USER_ID;
    delete process.env.DEV_ROLE_SWITCHER_EMAILS;
    delete process.env.DEV_ROLE_SWITCHER_USER_IDS;
    getActorContext.mockResolvedValue(createActor());
  });

  it("sets the active role cookie for an allowed developer role", async () => {
    process.env.DEV_ROLE_SWITCHER_USER_IDS = "dev-user";
    const response = await postRole("admin");

    expect(response.status).toBe(200);
    expect(cookieSet).toHaveBeenCalledWith(
      "deskmate-active-role",
      "admin",
      expect.objectContaining({
        path: "/",
        sameSite: "lax",
      }),
    );
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/main/agent",
      role: "admin",
    });
  });

  it("clears the cookie when role is empty", async () => {
    process.env.DEV_ROLE_SWITCHER_USER_IDS = "dev-user";
    const response = await postRole(null);

    expect(response.status).toBe(200);
    expect(cookieDelete).toHaveBeenCalledWith("deskmate-active-role");
    await expect(response.json()).resolves.toEqual({
      redirectTo: "/main",
      role: null,
    });
  });
});
