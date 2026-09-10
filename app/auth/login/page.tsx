import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import { sanitizeNextPath } from "@/lib/auth/urls";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage(props: { searchParams: SearchParams }) {
  const searchParams = (await props.searchParams) ?? {};
  const next = sanitizeNextPath(readSearchParam(searchParams.next), "/main/agent");
  const notice = readSearchParam(searchParams.notice) ?? null;
  const error = readSearchParam(searchParams.error) ?? null;

  return (
    <AuthShell
      title={{ zh: "进入 Deskmate Demo", en: "Enter the Deskmate demo" }}
      description={{
        zh: "无需创建账户或验证邮箱，直接体验智能教学工作台。",
        en: "Explore the teaching workspace without creating an account or verifying an email.",
      }}
    >
      <LoginForm next={next} initialNotice={notice} initialError={error} />
    </AuthShell>
  );
}
