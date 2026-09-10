import LoginForm from "@/components/auth/LoginForm";

type RegisterFormProps = {
  next?: string | null;
};

/**
 * The portfolio build has no account creation flow. Keep this component as a
 * compatibility wrapper while using the same stateless demo entry as login.
 */
export default function RegisterForm(props: RegisterFormProps) {
  return <LoginForm next={props.next} />;
}
