import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@multica/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enSettings from "../../locales/en/settings.json";

const mockUpdateWorkspace = vi.hoisted(() => vi.fn());
const mockNavigationPush = vi.hoisted(() => vi.fn());
const mockNavigationReplace = vi.hoisted(() => vi.fn());
const workspaceRef = vi.hoisted(() => ({
  current: {
    id: "workspace-1",
    name: "Test Workspace",
    slug: "test-workspace",
    description: "",
    context: "",
    issue_prefix: "TES",
    repos: [] as { url: string }[],
  },
}));
const membersRef = vi.hoisted(() => ({
  current: [{ user_id: "user-1", role: "owner" as "owner" | "admin" | "member" }],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: membersRef.current, isFetched: true }),
  useQueryClient: () => ({
    setQueryData: vi.fn(),
    getQueryData: vi.fn(() => []),
  }),
}));

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "workspace-1",
}));

vi.mock("@multica/core/paths", () => ({
  paths: {
    workspace: (slug: string) => ({ settings: () => `/${slug}/settings` }),
  },
  useCurrentWorkspace: () => workspaceRef.current,
  useHasOnboarded: () => true,
  resolvePostAuthDestination: () => "/",
}));

vi.mock("@multica/core/platform", () => ({
  setCurrentWorkspace: vi.fn(),
}));

vi.mock("@multica/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"], queryFn: vi.fn() }),
  workspaceListOptions: () => ({ queryKey: ["workspaces"], queryFn: vi.fn() }),
  workspaceKeys: { list: () => ["workspaces"] },
}));

vi.mock("@multica/core/workspace/mutations", () => ({
  useLeaveWorkspace: () => ({ mutateAsync: vi.fn() }),
  useDeleteWorkspace: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@multica/core/api", () => ({
  api: { updateWorkspace: mockUpdateWorkspace, getBaseUrl: () => "http://127.0.0.1:8080" },
}));

vi.mock("@multica/core/auth", () => {
  const useAuthStore = Object.assign(
    (sel?: (s: { user: { id: string } }) => unknown) =>
      sel ? sel({ user: { id: "user-1" } }) : { user: { id: "user-1" } },
    { getState: () => ({ user: { id: "user-1" } }) },
  );
  return { useAuthStore };
});

vi.mock("../../navigation", () => ({
  useNavigation: () => ({
    push: mockNavigationPush,
    replace: mockNavigationReplace,
  }),
}));

vi.mock("./delete-workspace-dialog", () => ({
  DeleteWorkspaceDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { WorkspaceTab } from "./workspace-tab";

const TEST_RESOURCES = {
  en: { common: enCommon, settings: enSettings },
};

function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      {children}
    </I18nProvider>
  );
}

describe("WorkspaceTab — workspace slug editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceRef.current = {
      id: "workspace-1",
      name: "Test Workspace",
      slug: "test-workspace",
      description: "",
      context: "",
      issue_prefix: "TES",
      repos: [],
    };
    membersRef.current = [{ user_id: "user-1", role: "owner" }];
    mockUpdateWorkspace.mockImplementation(
      async (
        _id: string,
        payload: {
          name?: string;
          slug?: string;
          description?: string;
          context?: string;
        },
      ) => ({
        ...workspaceRef.current,
        ...payload,
      }),
    );
  });

  it("renders the current slug in the input", () => {
    render(<WorkspaceTab />, { wrapper: I18nWrapper });
    const input = screen.getByPlaceholderText("test-workspace") as HTMLInputElement;
    expect(input.value).toBe("test-workspace");
  });

  it("lowercases and strips unsupported slug characters as the user types", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />, { wrapper: I18nWrapper });
    const input = screen.getByPlaceholderText("test-workspace") as HTMLInputElement;

    await user.clear(input);
    await user.type(input, "New_Workspace!");

    expect(input.value).toBe("newworkspace");
  });

  it("saves directly without confirm when the slug is unchanged", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />, { wrapper: I18nWrapper });

    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ slug: "test-workspace" }),
    );
    expect(screen.queryByText(/Change workspace URL/i)).toBeNull();
    expect(mockNavigationReplace).not.toHaveBeenCalled();
  });

  it("confirms a slug change, saves it, and navigates to the new URL", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />, { wrapper: I18nWrapper });

    const input = screen.getByPlaceholderText("test-workspace") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "new-workspace");

    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    expect(mockUpdateWorkspace).not.toHaveBeenCalled();

    await screen.findByText(/Change workspace URL/i);
    expect(screen.getByText(/\/test-workspace/)).toBeTruthy();
    expect(screen.getByText(/\/new-workspace/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateWorkspace).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ slug: "new-workspace" }),
    );
    expect(mockNavigationReplace).toHaveBeenCalledWith(
      "/new-workspace/settings",
    );
  });

  it("cancelling the confirm dialog does not save", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />, { wrapper: I18nWrapper });

    const input = screen.getByPlaceholderText("test-workspace") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "new-workspace");

    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await screen.findByText(/Change workspace URL/i);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockUpdateWorkspace).not.toHaveBeenCalled();
    // The user's edited value is preserved so they can resume.
    expect(input.value).toBe("new-workspace");
  });

  it("disables Save when the slug is empty", async () => {
    const user = userEvent.setup();
    render(<WorkspaceTab />, { wrapper: I18nWrapper });

    const input = screen.getByPlaceholderText("test-workspace") as HTMLInputElement;
    await user.clear(input);

    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("disables the slug input for non-admins", () => {
    membersRef.current = [{ user_id: "user-1", role: "member" }];
    render(<WorkspaceTab />, { wrapper: I18nWrapper });
    expect(screen.getByPlaceholderText("test-workspace")).toBeDisabled();
  });
});
