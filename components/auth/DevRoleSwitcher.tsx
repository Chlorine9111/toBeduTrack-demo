import DevRoleSwitcherFloating from "@/components/auth/DevRoleSwitcherFloating";
import { getActorContext } from "@/lib/auth/actor-context";
import {
  isDevRoleSwitcherEnabled,
  resolveDevRoleSwitcherProps,
} from "@/lib/auth/dev-role-switcher";

export default async function DevRoleSwitcher() {
  if (!isDevRoleSwitcherEnabled()) {
    return null;
  }

  const actor = await getActorContext();
  const switcher = resolveDevRoleSwitcherProps(actor);

  if (!switcher) {
    return null;
  }

  return <DevRoleSwitcherFloating roles={switcher.roles} activeRole={switcher.activeRole} />;
}
