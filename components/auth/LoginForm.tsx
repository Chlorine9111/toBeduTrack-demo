"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Info, Lock, Mail } from "lucide-react";
import { Alert, Button, Card, Form, InputGroup, Label, TextField } from "@heroui/react";
import { sanitizeNextPath } from "@/lib/auth/urls";
import { useAppI18n } from "@/lib/app-i18n/provider";

type LoginFormProps = {
  next?: string | null;
  initialNotice?: string | null;
  initialError?: string | null;
};

export default function LoginForm(props: LoginFormProps) {
  const { isZh } = useAppI18n();
  const safeNext = sanitizeNextPath(props.next, "/main/agent");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const enterDemo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsEntering(true);

    // Demo credentials stay in React memory only. They are never validated,
    // persisted, or sent to Supabase (or any other service).
    setEmail("");
    setPassword("");
    window.location.assign(safeNext);
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <Card.Header>
        <Card.Title className="sr-only">{isZh ? "进入演示" : "Enter demo"}</Card.Title>
      </Card.Header>
      <Card.Content>
        <Form
          onSubmit={enterDemo}
          className="space-y-5"
          data-auth-ready={isHydrated ? "true" : "false"}
        >
          <Alert status="accent">
            <Alert.Indicator>
              <Info className="h-4 w-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                Demo won&apos;t record your email and password
              </Alert.Description>
            </Alert.Content>
          </Alert>

          {props.initialNotice ? (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{props.initialNotice}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <p className="text-sm leading-6 text-muted">
            {isZh
              ? "这是面试展示版本。邮箱和密码均为可选，仅用于呈现登录界面；留空也可以直接进入。"
              : "This is an interview demo. Both fields are optional and only illustrate the sign-in experience; you can leave them blank."}
          </p>

          <TextField>
            <Label>{isZh ? "邮箱（可选）" : "Email (optional)"}</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <Mail className="h-5 w-5 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                id="login-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="demo@example.com"
              />
            </InputGroup>
          </TextField>

          <TextField>
            <Label>{isZh ? "密码（可选）" : "Password (optional)"}</Label>
            <InputGroup>
              <InputGroup.Prefix>
                <Lock className="h-5 w-5 text-muted" />
              </InputGroup.Prefix>
              <InputGroup.Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
              <InputGroup.Suffix className="pr-0">
                <Button
                  isIconOnly
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </InputGroup.Suffix>
            </InputGroup>
          </TextField>

          <Button
            type="submit"
            fullWidth
            size="lg"
            isDisabled={!isHydrated || isEntering}
            isPending={isEntering}
          >
            {isZh ? "直接进入 Demo" : "Enter demo"}
          </Button>
        </Form>
      </Card.Content>
      <Card.Footer className="justify-center">
        <span className="text-sm text-muted">
          {isZh ? "无需注册、邮箱验证或真实账户" : "No sign-up, email verification, or real account required"}
        </span>
      </Card.Footer>
    </Card>
  );
}
