import { PageWrapper } from "../../common/page-wrapper";
import { Generic404 } from "../../components/generic-404";
import { getLayout } from "../../layouts/main-layout";
import type { inferSSRProps } from "../../lib/infer-ssr-props";
import { Folder404 } from "../../modules/folders/folder-404";

export const runtime = "experimental-edge";

const ShareResolver = ({
  entity,
}: inferSSRProps<typeof getServerSideProps>) => {
  if (entity?.type == "Folder") return <Folder404 />;
  return <Generic404 />;
};

// The Drizzle/edge SSR layer this page used was removed: it was gated behind a
// PLANETSCALE flag that was never set, so this branch is the only one that has
// ever run. getServerSideProps is kept so the route stays server-rendered
// rather than becoming a static page that would demand getStaticPaths.
export const getServerSideProps = (): Promise<{
  props: { entity: { type: string } | null };
}> => Promise.resolve({ props: { entity: null } });

ShareResolver.PageWrapper = PageWrapper;
ShareResolver.getLayout = getLayout;

export default ShareResolver;
