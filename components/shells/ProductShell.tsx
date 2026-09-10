import DevRoleSwitcher from "@/components/auth/DevRoleSwitcher";
import ProductShellChrome from "./ProductShellChrome";
import { getActorContext } from "@/lib/auth/actor-context";
import { buildShellNavigation } from "@/components/shells/navigation";

type ProductShellProps = {
  children: React.ReactNode;
};

export default async function ProductShell({ children }: ProductShellProps) {
  const actor = await getActorContext();
  const navigation = buildShellNavigation(actor.roles, actor.activeRole);

  return (
    <>
      <ProductShellChrome
        navigation={navigation.primaryItems}
        mobileNavigation={navigation.mobileItems}
        actorLabel={navigation.actorLabel}
        showQuota={navigation.showQuota}
      >
        {children}
      </ProductShellChrome>
      <DevRoleSwitcher />
    </>
  );
}
