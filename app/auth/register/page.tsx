import AuthShell from "@/components/auth/AuthShell";
import RegisterForm from "@/components/auth/RegisterForm";
import { sanitizeNextPath } from "@/lib/auth/urls";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage(props: { searchParams: SearchParams }) {
  const searchParams = (await props.searchParams) ?? {};
  const next = sanitizeNextPath(readSearchParam(searchParams.next), "/main/agent");
  return (
    <AuthShell
      title={{ zh: "进入 Deskmate Demo", en: "Enter the Deskmate demo" }}
      description={{
        zh: "演示版本不创建账户，也不会发送邮箱验证邮件。",
        en: "The demo creates no account and sends no verification email.",
      }}
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
